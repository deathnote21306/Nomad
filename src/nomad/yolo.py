import numpy as np
from ultralytics import YOLO

class YoloAnnotator:
    def __init__(self):
        self._model = YOLO("yolo11n.pt")

    def annotate(self, frame: np.ndarray) -> np.ndarray:
        results = self._model(frame, imgsz=640, device="cpu", verbose=False)
        return results[0].plot()

class YoloAnnotatorSingleton:
    _instance: YoloAnnotator | None = None

    def __new__(cls) -> YoloAnnotator:
        if cls._instance is None:
            cls._instance = YoloAnnotator()
        return cls._instance
