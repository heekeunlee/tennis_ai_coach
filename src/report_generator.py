from datetime import datetime
from typing import Dict, List, Optional
import pandas as pd


PHASE_KO = {
    'ready':         '레디 포지션',
    'takeback':      '테이크백',
    'impact':        '임팩트',
    'followthrough': '팔로스루',
}

METRIC_KO = {
    'elbow_angle':            '팔꿈치 각도 (°)',
    'shoulder_angle':         '어깨 각도 (°)',
    'knee_angle':             '무릎 각도 (°)',
    'trunk_inclination':      '상체 기울기 (°)',
    'wrist_height':           '손목 높이 (정규화)',
    'wrist_trunk_distance':   '손목-몸통 거리 (정규화)',
    'shoulder_rotation':      '어깨 회전량 (°)',
    'hip_rotation':           '골반 회전량 (°)',
    'followthrough_direction': '팔로스루 방향 (°)',
}


class ReportGenerator:

    def generate_csv(
        self,
        user_analyses: Dict,
        pro_analyses:  Optional[Dict] = None,
        comparison_results: Optional[Dict] = None,
    ) -> str:
        """CSV 형식 문자열 반환 (UTF-8 BOM)"""
        rows = []
        for phase_key, phase_label in PHASE_KO.items():
            um = user_analyses.get(phase_key) or {}
            pm = (pro_analyses or {}).get(phase_key) or {}
            for mk, ml in METRIC_KO.items():
                uv = um.get(mk)
                pv = pm.get(mk) if pro_analyses else None
                diff = abs(uv - pv) if (uv is not None and pv is not None) else None
                row = {
                    '단계':    phase_label,
                    '측정 항목': ml,
                    '사용자 값': f'{uv:.3f}' if uv is not None else '-',
                }
                if pro_analyses:
                    row['롤모델 값'] = f'{pv:.3f}' if pv is not None else '-'
                    row['차이']      = f'{diff:.3f}' if diff is not None else '-'
                rows.append(row)

        df = pd.DataFrame(rows)
        return df.to_csv(index=False, encoding='utf-8-sig')

    def generate_markdown(
        self,
        user_analyses:      Dict,
        pro_analyses:       Optional[Dict] = None,
        comparison_results: Optional[Dict] = None,
        coaching:           Optional[List[str]] = None,
        recommendations:    Optional[List[str]] = None,
        stroke_type:        str = 'forehand',
        dominant_hand:      str = 'right',
        overall_similarity: Optional[float] = None,
    ) -> str:
        """Markdown 형식 문자열 반환"""
        now          = datetime.now().strftime('%Y년 %m월 %d일 %H:%M')
        stroke_label = '포핸드' if stroke_type == 'forehand' else '백핸드'
        hand_label   = '오른손' if dominant_hand == 'right' else '왼손'

        lines = [
            '# 테니스 AI 자세 분석 리포트',
            '',
            f'**분석 일시:** {now}  ',
            f'**스트로크:** {stroke_label}  ',
            f'**주 사용 손:** {hand_label}  ',
            '',
        ]

        # 전체 유사도
        if overall_similarity is not None:
            lines += [
                '## 전체 유사도',
                '',
                f'### **{overall_similarity:.0f} / 100점**',
                '',
            ]
            if comparison_results and 'phase_similarities' in comparison_results:
                lines += ['### 단계별 유사도', '', '| 단계 | 유사도 |', '|------|--------|']
                for phase, sim in comparison_results['phase_similarities'].items():
                    lines.append(f'| {phase} | {sim:.0f}점 |')
                lines.append('')

        # 주요 개선점
        if coaching:
            lines += ['## 주요 개선점', '']
            for i, c in enumerate(coaching, 1):
                lines.append(f'{i}. {c}')
            lines.append('')

        # 추천 연습
        if recommendations:
            lines += ['## 추천 연습', '']
            for i, r in enumerate(recommendations, 1):
                lines.append(f'{i}. {r}')
            lines.append('')

        # 상세 측정값
        lines += ['## 상세 측정값', '']
        for phase_key, phase_label in PHASE_KO.items():
            um = user_analyses.get(phase_key)
            if not um:
                continue
            pm = (pro_analyses or {}).get(phase_key) or {}
            lines += [f'### {phase_label}', '']

            if pro_analyses:
                lines += ['| 항목 | 사용자 | 롤모델 | 차이 |', '|------|--------|--------|------|']
                for mk, ml in METRIC_KO.items():
                    uv = um.get(mk)
                    pv = pm.get(mk)
                    us = f'{uv:.2f}' if uv is not None else '-'
                    ps = f'{pv:.2f}' if pv is not None else '-'
                    ds = f'{abs(uv - pv):.2f}' if (uv is not None and pv is not None) else '-'
                    lines.append(f'| {ml} | {us} | {ps} | {ds} |')
            else:
                lines += ['| 항목 | 값 |', '|------|----|']
                for mk, ml in METRIC_KO.items():
                    uv = um.get(mk)
                    lines.append(f'| {ml} | {f"{uv:.2f}" if uv is not None else "-"} |')
            lines.append('')

        lines += [
            '---',
            '*이 리포트는 Tennis AI Coach에 의해 자동 생성되었습니다.*',
            '*분석 결과는 참고용이며, 전문 코치의 지도와 함께 활용하세요.*',
        ]
        return '\n'.join(lines)
