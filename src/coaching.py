from typing import Dict, List, Optional

# ── 코칭 문장 규칙 ─────────────────────────────────────────────────────────────
# 구조: metric → direction(too_low/too_high) → phase_key or 'default'
COACHING_RULES: Dict[str, Dict[str, Dict[str, str]]] = {
    'elbow_angle': {
        'too_low': {  # 사용자가 프로보다 팔꿈치를 더 구부림
            'takeback':      '테이크백에서 팔꿈치가 너무 구부러져 있습니다. 팔을 조금 더 펴서 스윙 범위를 넓혀보세요.',
            'impact':        '임팩트 순간 팔꿈치가 몸에 너무 가깝게 굽혀져 있습니다. 팔을 뻗어서 공을 맞히세요.',
            'followthrough': '팔로스루에서 팔꿈치가 충분히 펴지지 않았습니다. 끝까지 팔을 뻗어주세요.',
            'ready':         '레디 포지션에서 팔꿈치가 너무 꺾여 있습니다. 자연스럽게 릴렉스해보세요.',
            'default':       '팔꿈치 각도가 프로보다 작습니다. 팔을 좀 더 펴는 연습을 해보세요.',
        },
        'too_high': {
            'takeback':      '테이크백에서 팔이 너무 펴져 있습니다. 팔꿈치를 자연스럽게 구부려 스윙을 준비해보세요.',
            'impact':        '임팩트 순간 팔꿈치가 너무 펴져 있습니다. 적절히 구부리면 더 강한 타구를 낼 수 있습니다.',
            'followthrough': '팔로스루에서 팔이 과하게 펴져 있습니다.',
            'ready':         '레디 포지션에서 팔이 너무 펴져 있습니다. 긴장을 풀고 자연스럽게 구부려보세요.',
            'default':       '팔꿈치 각도가 프로보다 큽니다. 팔을 조금 구부리는 연습을 해보세요.',
        },
    },
    'shoulder_angle': {
        'too_low': {
            'takeback':      '테이크백에서 어깨 각도가 충분하지 않습니다. 어깨를 좀 더 높이 들어올려보세요.',
            'impact':        '임팩트 순간 어깨가 충분히 올라가 있지 않습니다. 어깨를 적극적으로 사용해보세요.',
            'followthrough': '팔로스루에서 어깨를 더 올려 스윙을 완성해보세요.',
            'default':       '어깨 각도가 부족합니다. 스윙 시 어깨를 더 적극적으로 사용해보세요.',
        },
        'too_high': {
            'takeback':      '테이크백에서 어깨를 너무 높이 올리고 있습니다. 좀 더 자연스러운 자세를 유지하세요.',
            'impact':        '임팩트 순간 어깨가 너무 올라가 있습니다. 안정적인 어깨 위치를 유지하세요.',
            'default':       '어깨 각도가 너무 큽니다. 자연스럽게 조절해보세요.',
        },
    },
    'shoulder_rotation': {
        'too_low': {
            'takeback':      '테이크백에서 어깨 회전이 부족합니다. 어깨를 충분히 돌려서 파워를 축적해보세요.',
            'impact':        '임팩트 순간 어깨 회전이 충분하지 않습니다. 어깨 회전으로 더 강한 타구를 만들어보세요.',
            'followthrough': '팔로스루에서 어깨를 끝까지 회전시켜보세요.',
            'default':       '어깨 회전량이 부족합니다. 어깨 회전 섀도우 스윙으로 연습해보세요.',
        },
        'too_high': {
            'takeback':      '테이크백에서 어깨가 과도하게 회전합니다. 컨트롤이 떨어질 수 있습니다.',
            'default':       '어깨 회전이 다소 과합니다. 컨트롤에 집중해보세요.',
        },
    },
    'hip_rotation': {
        'too_low': {
            'takeback':      '테이크백에서 골반 회전이 부족합니다. 하체를 더 적극적으로 사용해보세요.',
            'impact':        '임팩트 순간 골반 회전이 부족합니다. 골반을 먼저 회전시켜 파워를 전달해보세요.',
            'followthrough': '팔로스루에서 골반을 끝까지 회전시켜보세요.',
            'default':       '골반 회전량이 부족합니다. 하체 회전 드릴로 파워를 키워보세요.',
        },
        'too_high': {
            'default':       '골반 회전이 약간 과합니다. 상체와의 협응을 맞춰보세요.',
        },
    },
    'knee_angle': {
        'too_high': {  # 무릎이 너무 펴짐
            'ready':  '레디 포지션에서 무릎을 더 구부려 낮은 자세를 만들어보세요.',
            'impact': '임팩트 순간 무릎이 너무 펴져 있습니다. 안정적인 자세를 위해 구부려보세요.',
            'default': '무릎이 충분히 구부러지지 않았습니다. 무릎을 더 굽혀 낮은 자세를 유지해보세요.',
        },
        'too_low': {
            'default': '무릎이 너무 많이 구부러져 있습니다. 좀 더 일어서서 자연스러운 자세를 유지해보세요.',
        },
    },
    'trunk_inclination': {
        'too_high': {
            'impact':  '임팩트 순간 상체가 과도하게 기울어져 있습니다. 균형을 유지해보세요.',
            'default': '상체가 너무 앞으로 기울어져 있습니다. 척추를 좀 더 세워보세요.',
        },
        'too_low': {
            'default': '상체가 너무 뒤로 기울어져 있습니다. 약간 앞으로 기울여보세요.',
        },
    },
    'wrist_height': {
        'too_low': {
            'takeback':      '테이크백에서 손목 위치가 너무 낮습니다. 손목을 좀 더 올려 준비해보세요.',
            'impact':        '임팩트 순간 손목이 너무 낮습니다. 공을 치는 높이를 높여보세요.',
            'followthrough': '팔로스루가 짧게 끝납니다. 손목을 반대쪽 어깨까지 끌어올려보세요.',
            'default':       '손목 높이가 부족합니다. 더 높은 위치에서 스윙해보세요.',
        },
        'too_high': {
            'impact':  '임팩트 순간 손목이 너무 높습니다. 자연스러운 타격 포인트를 찾아보세요.',
            'default': '손목이 너무 높습니다. 자연스러운 타격 위치를 찾아보세요.',
        },
    },
    'wrist_trunk_distance': {
        'too_low': {
            'impact':  '임팩트 순간 손목이 몸에 너무 가깝습니다. 공을 몸 앞쪽에서 맞히는 연습을 해보세요.',
            'takeback': '테이크백에서 손이 몸에서 충분히 멀어지지 않았습니다. 스윙 범위를 넓혀보세요.',
            'default': '손목이 몸에 너무 가깝습니다. 팔을 더 뻗어서 스윙해보세요.',
        },
        'too_high': {
            'default': '손목이 몸에서 너무 멀리 있습니다. 컨트롤을 위해 조금 가까이 가져오세요.',
        },
    },
    'followthrough_direction': {
        'too_low': {
            'followthrough': '팔로스루가 충분히 높지 않습니다. 팔을 반대쪽 어깨 방향으로 끝까지 올려보세요.',
            'default':       '팔로스루 방향이 아래를 향하고 있습니다. 위쪽으로 끝내는 연습을 해보세요.',
        },
        'too_high': {
            'followthrough': '팔로스루가 너무 위로 올라가고 있습니다. 자연스러운 방향으로 조정해보세요.',
            'default':       '팔로스루 방향을 조정해보세요.',
        },
    },
}

# ── 추천 연습 ─────────────────────────────────────────────────────────────────
RECOMMENDATIONS: Dict[str, List[str]] = {
    'elbow_angle': [
        '거울 앞에서 팔꿈치 각도를 확인하며 섀도우 스윙을 해보세요.',
        '벽에 팔꿈치 거리를 맞추는 임팩트 포인트 드릴을 해보세요.',
    ],
    'shoulder_angle': [
        '어깨 스트레칭으로 유연성을 높여보세요.',
        '코치와 함께 어깨 움직임을 피드백 받아보세요.',
    ],
    'shoulder_rotation': [
        '어깨 회전 섀도우 스윙을 20회 반복해보세요.',
        '폼 롤러를 이용한 어깨 회전 가동성 훈련을 해보세요.',
    ],
    'hip_rotation': [
        '하체 회전 드릴: 라켓 없이 골반만 돌리는 연습을 해보세요.',
        '레그 드라이브를 이용한 파워 전달 드릴을 해보세요.',
    ],
    'knee_angle': [
        '낮은 자세 유지 드릴: 낮게 앉아서 스윙하는 연습을 해보세요.',
        '스쿼트로 하체 안정성을 키워보세요.',
    ],
    'trunk_inclination': [
        '코어 근육 강화 운동으로 상체 안정성을 높여보세요.',
        '전신 거울 앞에서 자세를 확인하며 스윙해보세요.',
    ],
    'wrist_height': [
        '팔로스루를 반대쪽 어깨까지 보내는 연습을 해보세요.',
        '높은 타깃을 향해 스윙하는 드릴을 해보세요.',
    ],
    'wrist_trunk_distance': [
        '임팩트 지점을 몸 앞쪽에 두는 드릴을 해보세요.',
        '공을 몸 앞에서 잡는 트로피 캐치 연습을 해보세요.',
    ],
    'followthrough_direction': [
        '팔로스루를 반대쪽 어깨까지 완성하는 연습을 해보세요.',
        '끝까지 스윙하는 섀도우 스윙을 해보세요.',
    ],
}

_PHASE_KEY_MAP = {
    '레디 포지션': 'ready',
    '테이크백':    'takeback',
    '임팩트':      'impact',
    '팔로스루':    'followthrough',
}


class CoachingEngine:

    def generate_coaching(self, top_differences: List[Dict], stroke_type: str = 'forehand') -> List[str]:
        """비교 결과의 주요 차이점으로부터 한국어 코칭 문장 생성"""
        coaching: List[str] = []
        for diff in top_differences:
            metric   = diff.get('metric')
            phase_ko = diff.get('phase', '')
            uv       = diff.get('user_value')
            pv       = diff.get('pro_value')

            if uv is None or pv is None or metric not in COACHING_RULES:
                continue

            direction = 'too_low' if uv < pv else 'too_high'
            rules     = COACHING_RULES[metric].get(direction, {})
            phase_key = _PHASE_KEY_MAP.get(phase_ko, 'default')

            sentence = rules.get(phase_key) or rules.get('default', '')
            if sentence:
                coaching.append(sentence)

        return coaching

    def generate_recommendations(self, top_differences: List[Dict]) -> List[str]:
        """주요 차이점으로부터 추천 연습 생성"""
        recs: List[str] = []
        seen: set = set()
        for diff in top_differences:
            metric = diff.get('metric')
            if metric in RECOMMENDATIONS and metric not in seen:
                seen.add(metric)
                for r in RECOMMENDATIONS[metric]:
                    if len(recs) < 5:
                        recs.append(r)
        return recs

    def generate_solo_coaching(self, metrics: Dict, phase: str) -> List[str]:
        """단독 분석 시 절대값 기반 기초 피드백"""
        tips: List[str] = []

        elbow = metrics.get('elbow_angle')
        if elbow is not None:
            if elbow < 80:
                tips.append(f'팔꿈치가 많이 굽혀져 있습니다 ({elbow:.0f}°). 스윙 시 자연스럽게 펴보세요.')
            elif elbow > 165:
                tips.append(f'팔꿈치가 거의 펴져 있습니다 ({elbow:.0f}°). 약간 구부려 스윙해보세요.')

        knee = metrics.get('knee_angle')
        if knee is not None and knee > 170:
            tips.append(f'무릎이 너무 펴져 있습니다 ({knee:.0f}°). 무릎을 구부려 낮은 자세를 유지해보세요.')

        sh_rot = metrics.get('shoulder_rotation')
        if sh_rot is not None and sh_rot < 8 and 'takeback' in phase:
            tips.append('테이크백에서 어깨 회전이 매우 적습니다. 충분히 돌려보세요.')

        wh = metrics.get('wrist_height')
        if wh is not None and wh < -0.3 and 'followthrough' in phase:
            tips.append('팔로스루가 낮게 끝나고 있습니다. 손목을 반대쪽 어깨 방향으로 올려보세요.')

        return tips
