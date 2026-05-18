"""
MediaPipe Tasks API (0.10.x+) 기반 포즈 추정기.
첫 실행 시 pose_landmarker_full.task 모델 파일을 자동 다운로드합니다.
"""

import os
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# 모델 다운로드 URL 및 저장 경로
_MODEL_URL = (
    'https://storage.googleapis.com/mediapipe-models/'
    'pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task'
)
_MODEL_PATH = Path(__file__).parent.parent / 'models' / 'pose_landmarker_full.task'


def _ensure_model() -> str:
    """모델 파일이 없으면 다운로드한다."""
    _MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not _MODEL_PATH.exists():
        print(f'[PoseEstimator] 모델 다운로드 중: {_MODEL_URL}')
        urllib.request.urlretrieve(_MODEL_URL, _MODEL_PATH)
        print(f'[PoseEstimator] 모델 저장 완료: {_MODEL_PATH}')
    return str(_MODEL_PATH)


class PoseEstimator:
    """MediaPipe PoseLandmarker 기반 포즈 추정기"""

    # 스켈레톤 연결선 (MediaPipe Tasks 표준)
    CONNECTIONS: List[Tuple[int, int]] = [
        # 몸통
        (11, 12), (11, 23), (12, 24), (23, 24),
        # 왼쪽 팔
        (11, 13), (13, 15),
        # 오른쪽 팔
        (12, 14), (14, 16),
        # 왼손 (간략)
        (15, 17), (15, 19), (15, 21),
        # 오른손 (간략)
        (16, 18), (16, 20), (16, 22),
        # 왼쪽 다리
        (23, 25), (25, 27), (27, 29), (27, 31),
        # 오른쪽 다리
        (24, 26), (26, 28), (28, 30), (28, 32),
    ]

    def __init__(self, min_detection_confidence: float = 0.5):
        model_path = _ensure_model()
        base_opts = mp_python.BaseOptions(model_asset_path=model_path)
        opts = mp_vision.PoseLandmarkerOptions(
            base_options=base_opts,
            running_mode=mp_vision.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=min_detection_confidence,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._landmarker = mp_vision.PoseLandmarker.create_from_options(opts)

    def estimate(self, frame: np.ndarray) -> Optional[Dict]:
        """
        RGB numpy 배열에서 포즈 추정.
        반환: {'landmarks': dict, 'mean_visibility': float, 'is_reliable': bool}
        포즈 미감지 시 None 반환.
        """
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
        result = self._landmarker.detect(mp_image)

        if not result.pose_landmarks or len(result.pose_landmarks) == 0:
            return None

        h, w = frame.shape[:2]
        raw = result.pose_landmarks[0]  # 첫 번째 사람

        landmarks: Dict[int, Dict] = {}
        visibilities: List[float] = []

        for idx, lm in enumerate(raw):
            vis = float(getattr(lm, 'visibility', 0.0) or 0.0)
            landmarks[idx] = {
                'x':          float(lm.x),
                'y':          float(lm.y),
                'z':          float(lm.z),
                'visibility': vis,
                'x_px':       int(lm.x * w),
                'y_px':       int(lm.y * h),
            }
            visibilities.append(vis)

        mean_vis = float(np.mean(visibilities)) if visibilities else 0.0
        return {
            'landmarks':       landmarks,
            'mean_visibility': mean_vis,
            'min_visibility':  float(np.min(visibilities)) if visibilities else 0.0,
            'is_reliable':     mean_vis > 0.5,
        }

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
                if vis > 0.2:
                    pa = (la['x_px'], la['y_px'])
                    pb = (lb['x_px'], lb['y_px'])
                    cv2.line(result, pa, pb, bone_color,
                             max(2, int(vis * 5)), cv2.LINE_AA)

        for lm in lms.values():
            if lm['visibility'] > 0.2:
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

    def close(self):
        try:
            self._landmarker.close()
        except Exception:
            pass

    def __del__(self):
        self.close()
