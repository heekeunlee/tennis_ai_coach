import cv2
import numpy as np
from typing import List, Tuple, Optional


class VideoProcessor:
    def __init__(self, video_path: str):
        self.video_path = video_path
        self.cap = cv2.VideoCapture(video_path)
        if not self.cap.isOpened():
            raise ValueError(f"영상을 열 수 없습니다: {video_path}")

        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30.0
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    def get_frame(self, frame_idx: int) -> Optional[np.ndarray]:
        """특정 프레임을 RGB 이미지로 반환"""
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = self.cap.read()
        if ret:
            return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        return None

    def get_sample_frames(self, n: int = 60) -> List[Tuple[int, np.ndarray]]:
        """n개의 균등 간격 프레임 추출"""
        frames = []
        if self.total_frames <= 0:
            return frames
        count = min(n, self.total_frames)
        indices = np.linspace(0, self.total_frames - 1, count, dtype=int)
        for idx in indices:
            frame = self.get_frame(int(idx))
            if frame is not None:
                frames.append((int(idx), frame))
        return frames

    def release(self):
        if self.cap.isOpened():
            self.cap.release()

    def __del__(self):
        self.release()
