import cv2
import numpy as np
from typing import Dict, Optional, Tuple


class PoseVisualizer:
    """스켈레톤 오버레이 및 나란히 비교 이미지 생성"""

    CONNECTIONS = [
        (11, 12), (11, 23), (12, 24), (23, 24),   # 몸통
        (11, 13), (13, 15),                         # 왼쪽 팔
        (12, 14), (14, 16),                         # 오른쪽 팔
        (15, 17), (15, 19), (15, 21),               # 왼손 손가락 (간략)
        (16, 18), (16, 20), (16, 22),               # 오른손 손가락 (간략)
        (23, 25), (25, 27), (27, 29), (27, 31),    # 왼쪽 다리
        (24, 26), (26, 28), (28, 30), (28, 32),    # 오른쪽 다리
    ]

    def draw_skeleton(
        self,
        frame: np.ndarray,
        pose_data: Optional[Dict],
        joint_color: Tuple[int, int, int] = (0, 220, 0),
        label: str = '',
    ) -> np.ndarray:
        """스켈레톤 오버레이를 그려서 반환 (RGB 이미지)"""
        if pose_data is None:
            return frame

        result = frame.copy()
        lms = pose_data['landmarks']
        h, w = result.shape[:2]
        bone_color = tuple(max(0, c - 60) for c in joint_color)

        for a, b in self.CONNECTIONS:
            la, lb = lms.get(a), lms.get(b)
            if la and lb:
                vis = min(la['visibility'], lb['visibility'])
                if vis > 0.25:
                    pa = (la['x_px'], la['y_px'])
                    pb = (lb['x_px'], lb['y_px'])
                    cv2.line(result, pa, pb, bone_color, max(2, int(vis * 5)), cv2.LINE_AA)

        for lm in lms.values():
            if lm['visibility'] > 0.25:
                pt = (lm['x_px'], lm['y_px'])
                r = max(4, int(lm['visibility'] * 7))
                cv2.circle(result, pt, r, joint_color, -1, cv2.LINE_AA)
                cv2.circle(result, pt, r + 1, (255, 255, 255), 1, cv2.LINE_AA)

        if label:
            cv2.putText(result, label, (10, 35),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)

        if not pose_data.get('is_reliable', True):
            cv2.putText(result, '! 신뢰도 낮음', (10, h - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (60, 60, 255), 2, cv2.LINE_AA)

        return result

    def create_comparison_image(
        self,
        user_frame:  np.ndarray,
        pro_frame:   np.ndarray,
        user_pose:   Optional[Dict],
        pro_pose:    Optional[Dict],
        user_label:  str = '나의 스윙',
        pro_label:   str = '롤모델',
        target_height: int = 420,
    ) -> np.ndarray:
        """두 영상을 스켈레톤 오버레이와 함께 나란히 붙인 이미지 반환"""
        user_drawn = self.draw_skeleton(user_frame, user_pose, (255, 140, 0), user_label)
        pro_drawn  = self.draw_skeleton(pro_frame,  pro_pose,  (0, 120, 255), pro_label)

        def resize_to_height(img: np.ndarray, h: int) -> np.ndarray:
            ih, iw = img.shape[:2]
            new_w = int(iw * h / ih)
            return cv2.resize(img, (new_w, h))

        u_resized = resize_to_height(user_drawn, target_height)
        p_resized = resize_to_height(pro_drawn,  target_height)

        divider = np.full((target_height, 6, 3), 180, dtype=np.uint8)
        return np.hstack([u_resized, divider, p_resized])

    def annotate_angles(
        self,
        frame:    np.ndarray,
        pose_data: Optional[Dict],
        metrics:  Dict,
        dominant_hand: str = 'right',
    ) -> np.ndarray:
        """팔꿈치·무릎 각도 수치를 프레임에 오버레이"""
        if pose_data is None:
            return frame

        result = frame.copy()
        lms = pose_data['landmarks']
        h, w = result.shape[:2]

        elbow_idx = 14 if dominant_hand == 'right' else 13
        knee_idx  = 26 if dominant_hand == 'right' else 25

        def put_angle(lm_idx: int, value: Optional[float], suffix: str = '°'):
            lm = lms.get(lm_idx)
            if lm and value is not None:
                pt = (lm['x_px'] + 10, lm['y_px'] - 10)
                cv2.putText(result, f'{value:.0f}{suffix}', pt,
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 0), 1, cv2.LINE_AA)

        put_angle(elbow_idx, metrics.get('elbow_angle'))
        put_angle(knee_idx,  metrics.get('knee_angle'))
        return result
