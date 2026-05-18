import numpy as np
from typing import Dict, Optional


class PoseAnalyzer:
    """
    MediaPipe 랜드마크에서 테니스 자세 지표(관절 각도, 위치 등)를 계산.
    """

    # MediaPipe landmark 인덱스
    IDX = {
        'nose': 0,
        'left_shoulder': 11, 'right_shoulder': 12,
        'left_elbow': 13,    'right_elbow': 14,
        'left_wrist': 15,    'right_wrist': 16,
        'left_hip': 23,      'right_hip': 24,
        'left_knee': 25,     'right_knee': 26,
        'left_ankle': 27,    'right_ankle': 28,
    }

    def __init__(self, dominant_hand: str = 'right', stroke_type: str = 'forehand'):
        self.dominant_hand = dominant_hand
        self.stroke_type = stroke_type

        if dominant_hand == 'right':
            self.dom = {
                'shoulder': self.IDX['right_shoulder'],
                'elbow':    self.IDX['right_elbow'],
                'wrist':    self.IDX['right_wrist'],
                'hip':      self.IDX['right_hip'],
                'knee':     self.IDX['right_knee'],
                'ankle':    self.IDX['right_ankle'],
            }
            self.non = {
                'shoulder': self.IDX['left_shoulder'],
                'hip':      self.IDX['left_hip'],
            }
        else:
            self.dom = {
                'shoulder': self.IDX['left_shoulder'],
                'elbow':    self.IDX['left_elbow'],
                'wrist':    self.IDX['left_wrist'],
                'hip':      self.IDX['left_hip'],
                'knee':     self.IDX['left_knee'],
                'ankle':    self.IDX['left_ankle'],
            }
            self.non = {
                'shoulder': self.IDX['right_shoulder'],
                'hip':      self.IDX['right_hip'],
            }

    # ── 내부 헬퍼 ──────────────────────────────────────────────────────────────

    def _pt(self, landmarks: Dict, idx: int) -> Optional[np.ndarray]:
        lm = landmarks.get(idx)
        if lm is None:
            return None
        return np.array([lm['x'], lm['y']])

    def _angle(self, a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
        """b 꼭짓점에서의 각도 (도)"""
        ba, bc = a - b, c - b
        na, nb = np.linalg.norm(ba), np.linalg.norm(bc)
        if na < 1e-7 or nb < 1e-7:
            return 0.0
        cos = np.clip(np.dot(ba, bc) / (na * nb), -1.0, 1.0)
        return float(np.degrees(np.arccos(cos)))

    def _line_angle_from_horiz(self, v: np.ndarray) -> float:
        """벡터와 수평선 사이의 각도 (절댓값, 도)"""
        norm = np.linalg.norm(v)
        if norm < 1e-7:
            return 0.0
        cos = np.clip(abs(v[0]) / norm, 0.0, 1.0)
        return float(np.degrees(np.arccos(cos)))

    # ── 공개 API ───────────────────────────────────────────────────────────────

    def analyze_frame(self, pose_data: Optional[Dict]) -> Optional[Dict]:
        """
        포즈 데이터에서 자세 지표 딕셔너리를 계산해 반환.
        None 입력이면 None 반환.
        """
        if pose_data is None:
            return None

        lm = pose_data['landmarks']
        m: Dict = {}

        ds = self._pt(lm, self.dom['shoulder'])
        de = self._pt(lm, self.dom['elbow'])
        dw = self._pt(lm, self.dom['wrist'])
        dh = self._pt(lm, self.dom['hip'])
        dk = self._pt(lm, self.dom['knee'])
        da = self._pt(lm, self.dom['ankle'])
        ns = self._pt(lm, self.non['shoulder'])
        nh = self._pt(lm, self.non['hip'])

        # 1. 팔꿈치 각도 (손목-팔꿈치-어깨)
        m['elbow_angle'] = self._angle(dw, de, ds) if (dw is not None and de is not None and ds is not None) else None

        # 2. 어깨 각도 (팔꿈치-어깨-골반)
        m['shoulder_angle'] = self._angle(de, ds, dh) if (de is not None and ds is not None and dh is not None) else None

        # 3. 무릎 각도 (골반-무릎-발목)
        m['knee_angle'] = self._angle(dh, dk, da) if (dh is not None and dk is not None and da is not None) else None

        # 4. 상체 기울기 (어깨-골반 벡터와 수직선 사이 각도)
        if ds is not None and dh is not None:
            spine = ds - dh
            vertical = np.array([0.0, -1.0])
            norm = np.linalg.norm(spine)
            if norm > 1e-7:
                cos = np.clip(np.dot(spine, vertical) / norm, -1.0, 1.0)
                m['trunk_inclination'] = float(np.degrees(np.arccos(cos)))
            else:
                m['trunk_inclination'] = None
        else:
            m['trunk_inclination'] = None

        # 5. 손목 높이 (정규화: 골반 기준, 어깨-골반 거리로 나눔, 위가 양수)
        if dw is not None and ds is not None and dh is not None and ns is not None and nh is not None:
            hip_y = (dh[1] + nh[1]) / 2.0
            sh_y  = (ds[1] + ns[1]) / 2.0
            body_h = abs(hip_y - sh_y)
            if body_h > 1e-7:
                m['wrist_height'] = float((hip_y - dw[1]) / body_h)
            else:
                m['wrist_height'] = None
        else:
            m['wrist_height'] = None

        # 6. 손목-몸통 거리 (어깨 너비로 정규화)
        if dw is not None and ds is not None and ns is not None:
            body_center = (ds + ns) / 2.0
            sh_width = np.linalg.norm(ds - ns)
            if sh_width > 1e-7:
                m['wrist_trunk_distance'] = float(np.linalg.norm(dw - body_center) / sh_width)
            else:
                m['wrist_trunk_distance'] = None
        else:
            m['wrist_trunk_distance'] = None

        # 7. 어깨 회전량 (어깨 연결선과 수평선 사이 각도)
        if ds is not None and ns is not None:
            m['shoulder_rotation'] = self._line_angle_from_horiz(ds - ns)
        else:
            m['shoulder_rotation'] = None

        # 8. 골반 회전량 (골반 연결선과 수평선 사이 각도)
        if dh is not None and nh is not None:
            m['hip_rotation'] = self._line_angle_from_horiz(dh - nh)
        else:
            m['hip_rotation'] = None

        # 9. 팔로스루 방향 (손목-팔꿈치 벡터와 수평선 사이 부호 있는 각도)
        if dw is not None and de is not None:
            arm_vec = dw - de
            norm = np.linalg.norm(arm_vec)
            if norm > 1e-7:
                # 이미지 y 좌표는 아래가 양수이므로 부호 반전
                signed_angle = float(np.degrees(np.arctan2(-arm_vec[1], arm_vec[0])))
                m['followthrough_direction'] = signed_angle
            else:
                m['followthrough_direction'] = None
        else:
            m['followthrough_direction'] = None

        m['visibility'] = pose_data.get('mean_visibility', 0.0)
        m['is_reliable'] = pose_data.get('is_reliable', False)

        return m
