import cv2
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from nomad.yolo import YoloAnnotatorSingleton

# ── Set your phone's stream URL here ─────────────────────────────────────────
# IP Webcam (Android): "http://192.168.x.x:8080/video"
# EpochCam / DroidCam: "http://192.168.x.x:4747/video"
# RTSP:                "rtsp://192.168.x.x:8080/h264_ulaw.sdp"
PHONE_STREAM_URL = "http://132.207.213.38:4747/video"
# ─────────────────────────────────────────────────────────────────────────────

_stream_lock = threading.Lock()
_stream_url: str | None = None
_cap: cv2.VideoCapture | None = None


def _release_cap() -> None:
    global _cap
    if _cap is not None:
        _cap.release()
        _cap = None


def _open_stream(url: str) -> None:
    global _stream_url, _cap
    cap = cv2.VideoCapture(url)
    if not cap.isOpened():
        raise ValueError(f"Cannot open stream: {url}")
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"Stream opened: {width}x{height}")
    _stream_url = url
    _cap = cap


@asynccontextmanager
async def lifespan(app: FastAPI):
    if PHONE_STREAM_URL:
        try:
            _open_stream(PHONE_STREAM_URL)
        except ValueError as e:
            print(f"Warning: {e}")
    yield
    with _stream_lock:
        _release_cap()


app = FastAPI(title="Nomad Camera Stream Server", lifespan=lifespan)


class StreamConfig(BaseModel):
    url: str


@app.post("/stream/start")
def start_stream(config: StreamConfig) -> dict:
    """Override the stream URL at runtime."""
    with _stream_lock:
        _release_cap()
        try:
            _open_stream(config.url)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    return {"status": "started", "url": config.url}


@app.post("/stream/stop")
def stop_stream() -> dict:
    global _stream_url
    with _stream_lock:
        _release_cap()
    _stream_url = None
    return {"status": "stopped"}


@app.get("/stream/status")
def stream_status() -> dict:
    return {"active": _cap is not None, "url": _stream_url}


def _mjpeg_frames():
    while True:
        with _stream_lock:
            cap = _cap
        if cap is None:
            break
        ret, frame = cap.read()
        if not ret:
            break
        frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
        _, buf = cv2.imencode(".jpg", frame)
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + buf.tobytes()
            + b"\r\n"
        )


@app.get("/stream/preview")
def preview_stream():
    if _cap is None:
        raise HTTPException(status_code=404, detail="No active stream.")
    return StreamingResponse(
        _mjpeg_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


def _yolo_frames():
    while True:
        with _stream_lock:
            cap = _cap
        if cap is None:
            break
        ret, frame = cap.read()
        if not ret:
            break
        frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
        yolo = YoloAnnotatorSingleton()
        annotated = yolo.annotate(frame)
        _, buf = cv2.imencode(".jpg", annotated)
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + buf.tobytes()
            + b"\r\n"
        )


@app.get("/stream/yolo")
def yolo_stream():
    if _cap is None:
        raise HTTPException(status_code=404, detail="No active stream.")
    return StreamingResponse(
        _yolo_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/stream/snapshot")
def snapshot():
    if _cap is None:
        raise HTTPException(status_code=404, detail="No active stream.")
    with _stream_lock:
        ret, frame = _cap.read()
    if not ret:
        raise HTTPException(status_code=503, detail="Failed to read frame.")
    frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
    _, buf = cv2.imencode(".jpg", frame)
    return StreamingResponse(iter([buf.tobytes()]), media_type="image/jpeg")
