import numpy as np
from typing import Dict, Optional


class PoseNormalizer:
    """
    체형(키·거리·체격) 차이를 줄이기 위한 포즈 좌표 정규화.
    골반 중심을 원점으로 이동하고 어깨-골반 거리로 스케일링.
    """

    # 참조 랜드마크 인덱스
    LEFT_SHOULDER  = 11
    RIGHT_SHOULDER = 12
    LEFT_HIP       = 23
    RIGHT_HIP      = 24

    def normalize(self, landmarks: Dict) -> Optional[Dict]:
        """정규화된 좌표(x_norm, y_norm)를 각 랜드마크에 추가해 반환"""
        if not landmarks:
            return None

        ls = self._xy(landmarks, self.LEFT_SHOULDER)
        rs = self._xy(landmarks, self.RIGHT_SHOULDER)
        lh = self._xy(landmarks, self.LEFT_HIP)
        rh = self._xy(landmarks, self.RIGHT_HIP)

        if any(p is None for p in (ls, rs, lh, rh)):
            return landmarks  # 참조점 없으면 원본 반환

        hip_center = (lh + rh) / 2.0
        shoulder_center = (ls + rs) / 2.0
        scale = np.linalg.norm(shoulder_center - hip_center)

        if scale < 1e-7:
            return landmarks

        normalized = {}
        for idx, lm in landmarks.items():
            xy = np.array([lm['x'], lm['y']])
            xy_n = (xy - hip_center) / scale
            normalized[idx] = {**lm, 'x_norm': float(xy_n[0]), 'y_norm': float(xy_n[1])}

        return normalized

    def _xy(self, landmarks: Dict, idx: int) -> Optional[np.ndarray]:
        lm = landmarks.get(idx)
        return np.array([lm['x'], lm['y']]) if lm else None
