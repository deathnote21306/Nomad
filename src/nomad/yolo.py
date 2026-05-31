import numpy as np
from ultralytics import YOLO

HAZARDOUS_OBJECTS = {
    "car", "truck", "bus", "motorcycle", "bicycle",
    "knife", "scissors",
    "dog", "bear",
    "fire hydrant",
}


class YoloAnnotator:
    def __init__(self):
        self._model = YOLO("yolo11n.pt")

    def annotate(self, frame: np.ndarray) -> np.ndarray:
        results = self._model(frame, imgsz=640, device="cpu", verbose=False)
        return results[0].plot()

    def detect_hazards(self, frame: np.ndarray) -> list[str]:
        """Return list of hazardous object names detected in the frame."""
        results = self._model(frame, imgsz=640, device="cpu", verbose=False)
        names = results[0].names
        detected = set()
        for cls_id in results[0].boxes.cls.tolist():
            label = names[int(cls_id)]
            if label in HAZARDOUS_OBJECTS:
                detected.add(label)
        return list(detected)

class YoloAnnotatorSingleton:
    _instance: YoloAnnotator | None = None

    def __new__(cls) -> YoloAnnotator:
        if cls._instance is None:
            cls._instance = YoloAnnotator()
        return cls._instance
