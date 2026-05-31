import os
import threading
import time
from contextlib import asynccontextmanager

import cv2
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from nomad.yolo import YoloAnnotatorSingleton
from nomad.tts import TTSServiceSingleton
from nomad.listen import ListenerServiceSingleton, WAKE_WORD
from nomad.gemini_client import GeminiClientSingleton

HAZARD_CHECK_INTERVAL = 2.0   # seconds between YOLO hazard scans
HAZARD_COOLDOWN = 10.0        # seconds before re-announcing the same hazard

# ── Set your phone's stream URL here ─────────────────────────────────────────
# PHONE_STREAM_URL = "http://132.207.213.38:4747/video"
PHONE_STREAM_URL = "http://10.201.12.78:4747/video"

# ─────────────────────────────────────────────────────────────────────────────

_stream_lock = threading.Lock()
_stream_url: str | None = None
_cap: cv2.VideoCapture | None = None
_hazard_monitor_running = False


def _hazard_monitor_loop() -> None:
    last_spoken: dict[str, float] = {}
    while _hazard_monitor_running:
        with _stream_lock:
            cap = _cap
        if cap is not None:
            ret, frame = cap.read()
            if ret:
                frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
                hazards = YoloAnnotatorSingleton().detect_hazards(frame)
                now = time.time()
                to_speak = [
                    h for h in hazards
                    if now - last_spoken.get(h, 0) > HAZARD_COOLDOWN
                ]
                if to_speak:
                    for h in to_speak:
                        last_spoken[h] = now
                    msg = "Warning: " + ", ".join(to_speak) + " detected."
                    print(f"[Hazard] {msg}")
                    TTSServiceSingleton().speak(msg)
        time.sleep(HAZARD_CHECK_INTERVAL)


# ── PocketLens handler ────────────────────────────────────────────────────────

def _handle_pocketlens(transcript: str) -> None:
    """Called when the wake word is heard. Snapshot → YOLO → Gemini → TTS."""
    with _stream_lock:
        cap = _cap
    if cap is None:
        TTSServiceSingleton().speak("No camera stream active.")
        return

    ret, frame = cap.read()
    if not ret:
        TTSServiceSingleton().speak("Could not read from camera.")
        return

    frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
    annotated = YoloAnnotatorSingleton().annotate(frame)

    print(f"[PocketLens] Heard: {transcript}")
    print("[PocketLens] Asking Gemini...")
    description = GeminiClientSingleton().describe(annotated, transcript)
    print(f"[PocketLens] Gemini: {description}")
    TTSServiceSingleton().speak(description)


def _on_transcript(text: str) -> None:
    if WAKE_WORD in text.lower():
        threading.Thread(target=_handle_pocketlens, args=(text,), daemon=True).start()


# ── Camera helpers ────────────────────────────────────────────────────────────

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


# ── FastAPI lifespan ──────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _hazard_monitor_running
    YoloAnnotatorSingleton()
    TTSServiceSingleton()
    GeminiClientSingleton()
    ListenerServiceSingleton().start(_on_transcript)

    if PHONE_STREAM_URL:
        try:
            _open_stream(PHONE_STREAM_URL)
        except ValueError as e:
            print(f"Warning: {e}")

    _hazard_monitor_running = True
    threading.Thread(target=_hazard_monitor_loop, daemon=True).start()

    yield

    _hazard_monitor_running = False
    ListenerServiceSingleton().stop()
    with _stream_lock:
        _release_cap()


app = FastAPI(title="PocketLens", lifespan=lifespan)


# ── Stream endpoints ──────────────────────────────────────────────────────────

class StreamConfig(BaseModel):
    url: str


@app.post("/stream/start")
def start_stream(config: StreamConfig) -> dict:
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
        yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"


@app.get("/stream/preview")
def preview_stream():
    if _cap is None:
        raise HTTPException(status_code=404, detail="No active stream.")
    return StreamingResponse(_mjpeg_frames(), media_type="multipart/x-mixed-replace; boundary=frame")


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
        annotated = YoloAnnotatorSingleton().annotate(frame)
        _, buf = cv2.imencode(".jpg", annotated)
        yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"


@app.get("/stream/yolo")
def yolo_stream():
    if _cap is None:
        raise HTTPException(status_code=404, detail="No active stream.")
    return StreamingResponse(_yolo_frames(), media_type="multipart/x-mixed-replace; boundary=frame")


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
