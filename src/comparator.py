import numpy as np
from typing import Dict, List, Optional

# 각 지표의 가중치 (합계 = 1.0)
WEIGHTS = {
    'elbow_angle':            0.15,
    'shoulder_angle':         0.15,
    'knee_angle':             0.10,
    'trunk_inclination':      0.10,
    'wrist_height':           0.10,
    'wrist_trunk_distance':   0.10,
    'shoulder_rotation':      0.15,
    'hip_rotation':           0.10,
    'followthrough_direction': 0.05,
}

# 각 지표별 "최대 허용 차이" (이 이상이면 유사도 0)
MAX_DIFF = {
    'elbow_angle':            60.0,
    'shoulder_angle':         60.0,
    'knee_angle':             40.0,
    'trunk_inclination':      30.0,
    'wrist_height':            1.5,
    'wrist_trunk_distance':    1.5,
    'shoulder_rotation':      30.0,
    'hip_rotation':           25.0,
    'followthrough_direction': 60.0,
}

METRIC_KO = {
    'elbow_angle':            '팔꿈치 각도',
    'shoulder_angle':         '어깨 각도',
    'knee_angle':             '무릎 각도',
    'trunk_inclination':      '상체 기울기',
    'wrist_height':           '손목 높이',
    'wrist_trunk_distance':   '손목-몸통 거리',
    'shoulder_rotation':      '어깨 회전량',
    'hip_rotation':           '골반 회전량',
    'followthrough_direction': '팔로스루 방향',
}

PHASE_KO = {
    'ready':       '레디 포지션',
    'takeback':    '테이크백',
    'impact':      '임팩트',
    'followthrough': '팔로스루',
}


class PoseComparator:

    def compare_phases(
        self,
        user_analyses: Dict[str, Optional[Dict]],
        pro_analyses:  Dict[str, Optional[Dict]],
    ) -> Dict:
        """
        각 단계별 지표 비교 결과와 전체 유사도를 반환.

        반환 구조:
        {
          'overall_similarity': float,          # 0~100
          'phase_similarities': {str: float},   # 단계 레이블 → 점수
          'phases': {str: {label, comparison, similarity}},
          'top_differences': [list of diffs],
        }
        """
        phases = list(PHASE_KO.keys())
        results: Dict = {'phases': {}, 'overall_similarity': 0.0,
                         'phase_similarities': {}, 'top_differences': []}
        all_diffs: Dict[str, list] = {}

        for phase in phases:
            u = user_analyses.get(phase)
            p = pro_analyses.get(phase)
            if u is None or p is None:
                continue

            comp = self._compare_metrics(u, p)
            sim  = self._calc_similarity(comp)
            label = PHASE_KO[phase]

            results['phases'][phase] = {'label': label, 'comparison': comp, 'similarity': sim}
            results['phase_similarities'][label] = sim

            for metric, data in comp.items():
                if data.get('diff') is not None:
                    all_diffs.setdefault(metric, []).append({
                        'phase': label, **data
                    })

        if results['phases']:
            results['overall_similarity'] = float(
                np.mean([v['similarity'] for v in results['phases'].values()])
            )

        # 단계 전체에서 정규화 차이가 가장 큰 지표 순 정렬
        aggregated = []
        for metric, diffs in all_diffs.items():
            best = max(diffs, key=lambda x: x.get('normalized_diff', 0))
            aggregated.append({
                'metric':         metric,
                'metric_label':   METRIC_KO.get(metric, metric),
                'phase':          best['phase'],
                'normalized_diff': best.get('normalized_diff', 0),
                'user_value':     best.get('user_value'),
                'pro_value':      best.get('pro_value'),
                'diff':           best.get('diff'),
            })

        aggregated.sort(key=lambda x: x['normalized_diff'], reverse=True)
        results['top_differences'] = aggregated[:5]

        return results

    # ── 내부 헬퍼 ──────────────────────────────────────────────────────────────

    def _compare_metrics(self, user: Dict, pro: Dict) -> Dict:
        comp = {}
        for metric in WEIGHTS:
            uv = user.get(metric)
            pv = pro.get(metric)
            if uv is None or pv is None:
                comp[metric] = {'user_value': uv, 'pro_value': pv,
                                'diff': None, 'normalized_diff': 0.0, 'user_higher': None}
                continue
            diff = abs(uv - pv)
            nd   = min(1.0, diff / MAX_DIFF.get(metric, 1.0))
            comp[metric] = {
                'user_value':     uv,
                'pro_value':      pv,
                'diff':           diff,
                'normalized_diff': nd,
                'user_higher':    uv > pv,
            }
        return comp

    def _calc_similarity(self, comp: Dict) -> float:
        weighted, total = 0.0, 0.0
        for metric, w in WEIGHTS.items():
            data = comp.get(metric, {})
            if data.get('diff') is None:
                continue
            weighted += w * (1.0 - data['normalized_diff'])
            total    += w
        return float((weighted / total) * 100) if total > 0 else 0.0
