import cv2
import numpy as np
from ultralytics import YOLO


class YOLODetector:
    _instance: "YOLODetector | None" = None

    def __new__(cls) -> "YOLODetector":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._model = YOLO("yolo11n.pt")
        return cls._instance

    def annotate(self, frame: np.ndarray) -> np.ndarray:
        results = self._model(frame, imgsz=640, device="cpu", verbose=False)
        return results[0].plot()
