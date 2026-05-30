import cv2
import queue
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from pydantic import BaseModel

from nomad.yolo import YoloAnnotatorSingleton
from nomad.tts import TTSServiceSingleton
from nomad.listen import ListenerServiceSingleton, WAKE_WORD
from nomad.gemini_client import GeminiClientSingleton

# ── Set your phone's stream URL here ─────────────────────────────────────────
# IP Webcam (Android): "http://192.168.x.x:8080/video"
# EpochCam / DroidCam: "http://192.168.x.x:4747/video"
# RTSP:                "rtsp://192.168.x.x:8080/h264_ulaw.sdp"
PHONE_STREAM_URL = "http://132.207.213.38:4747/video"
# ─────────────────────────────────────────────────────────────────────────────

SNAPSHOT_INTERVAL = 5  # seconds between automatic camera → Gemini sends

_stream_lock = threading.Lock()
_stream_url: str | None = None
_cap: cv2.VideoCapture | None = None
_gemini_buffer: list[str] = []

# SSE subscribers: each open /gemini/logs connection gets its own queue
_log_subscribers: list[queue.SimpleQueue] = []
_log_subscribers_lock = threading.Lock()


def _broadcast_log(event: str, data: str) -> None:
    msg = f"event: {event}\ndata: {data}\n\n"
    with _log_subscribers_lock:
        for q in _log_subscribers:
            q.put(msg)


# ── Gemini callbacks ──────────────────────────────────────────────────────────

def _on_gemini_text(chunk: str) -> None:
    print(chunk, end="", flush=True)
    _gemini_buffer.append(chunk)
    _broadcast_log("chunk", chunk)


def _on_gemini_turn_complete() -> None:
    full = "".join(_gemini_buffer)
    _gemini_buffer.clear()
    if not full:
        return

    print()  # newline after streamed chunks
    gemini = GeminiClientSingleton()

    if "STEP COMPLETE" in full:
        next_step = gemini.nav.advance_step()
        speak_text = (
            f"Step complete! Next: {next_step}" if next_step
            else "You have reached your destination!"
        )
    else:
        speak_text = full

    gemini.nav.log_observation(summary=full[:150], response=full)
    _broadcast_log("turn_complete", full)
    threading.Thread(
        target=TTSServiceSingleton().speak, args=(speak_text,), daemon=True
    ).start()


# ── Vosk transcript callback ──────────────────────────────────────────────────

def _on_transcript(text: str) -> None:
    if WAKE_WORD in text.lower():
        print("Asking Gemini...")
        GeminiClientSingleton().send_text(text)


# ── Periodic snapshot sender ──────────────────────────────────────────────────

def _start_snapshot_sender() -> None:
    def _loop() -> None:
        while True:
            time.sleep(SNAPSHOT_INTERVAL)
            with _stream_lock:
                cap = _cap
            if cap is None:
                continue
            ret, frame = cap.read()
            if ret:
                frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
                GeminiClientSingleton().send_image(frame)

    threading.Thread(target=_loop, daemon=True).start()


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
    YoloAnnotatorSingleton()
    TTSServiceSingleton()

    gemini = GeminiClientSingleton()
    gemini.set_callbacks(on_text=_on_gemini_text, on_turn_complete=_on_gemini_turn_complete)
    gemini.nav.load_graph("graph_nav_graph.json")
    gemini.connect()

    ListenerServiceSingleton().start(_on_transcript)
    _start_snapshot_sender()

    if PHONE_STREAM_URL:
        try:
            _open_stream(PHONE_STREAM_URL)
        except ValueError as e:
            print(f"Warning: {e}")

    yield

    gemini.disconnect()
    ListenerServiceSingleton().stop()
    with _stream_lock:
        _release_cap()


app = FastAPI(title="Nomad Camera Stream Server", lifespan=lifespan)


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


# ── Navigation endpoints ──────────────────────────────────────────────────────

class NavigationStart(BaseModel):
    goal: str
    steps: list[str]


@app.post("/navigation/start")
def navigation_start(body: NavigationStart) -> dict:
    gemini = GeminiClientSingleton()
    gemini.nav.set_navigation(body.goal, body.steps)
    first_step = body.steps[0] if body.steps else ""
    if first_step:
        threading.Thread(
            target=TTSServiceSingleton().speak,
            args=(f"Navigation started. {first_step}",),
            daemon=True,
        ).start()
    gemini.send_text(
        f"Navigation just started. The user's goal is: {body.goal}. First instruction: {first_step}. Acknowledge and wish them luck briefly.",
        inject_context=True,
    )
    return {"status": "started", "goal": body.goal, "steps": body.steps}


@app.get("/navigation/status")
def navigation_status() -> dict:
    nav = GeminiClientSingleton().nav
    return {
        "goal": nav.goal,
        "steps": nav.steps,
        "current_step": nav.current_step,
        "current_instruction": nav.current_instruction,
        "is_complete": nav.is_complete,
    }


# ── Gemini log endpoints ──────────────────────────────────────────────────────

@app.get("/gemini/logs")
def gemini_logs():
    """SSE stream of live Gemini output. Open in browser to watch in real-time."""
    q: queue.SimpleQueue = queue.SimpleQueue()
    with _log_subscribers_lock:
        _log_subscribers.append(q)

    def stream():
        try:
            yield "event: connected\ndata: Gemini log stream started\n\n"
            while True:
                try:
                    msg = q.get(timeout=15)
                    yield msg
                except queue.Empty:
                    yield ": heartbeat\n\n"  # keep connection alive
        finally:
            with _log_subscribers_lock:
                _log_subscribers.remove(q)

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/gemini/viewer", response_class=HTMLResponse)
def gemini_viewer():
    """Browser UI showing live Gemini responses and navigation status."""
    return HTMLResponse("""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Nomad — Gemini Logs</title>
<style>
  body { font-family: monospace; background: #0d1117; color: #c9d1d9; margin: 0; padding: 20px; }
  h2 { color: #58a6ff; margin-bottom: 4px; }
  #status { font-size: 13px; color: #8b949e; margin-bottom: 16px; }
  #nav { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 13px; }
  #nav span { color: #58a6ff; }
  #log { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px; min-height: 400px; white-space: pre-wrap; font-size: 13px; overflow-y: auto; max-height: 70vh; }
  .turn { border-top: 1px solid #21262d; margin-top: 10px; padding-top: 10px; color: #e6edf3; }
  .label { color: #3fb950; font-size: 11px; margin-bottom: 4px; }
  .chunk { color: #c9d1d9; }
</style>
</head>
<body>
<h2>Nomad — Gemini Live Log</h2>
<div id="status">Connecting...</div>
<div id="nav">Loading navigation status...</div>
<div id="log"></div>

<script>
  const log = document.getElementById('log');
  const statusEl = document.getElementById('status');
  const navEl = document.getElementById('nav');
  let currentTurn = null;

  // Poll navigation status every 3 seconds
  async function refreshNav() {
    try {
      const r = await fetch('/navigation/status');
      const d = await r.json();
      if (d.goal) {
        navEl.innerHTML = `<span>Goal:</span> ${d.goal} &nbsp;|&nbsp; <span>Step:</span> ${d.current_step + 1}/${d.steps.length}: ${d.current_instruction}`;
      } else {
        navEl.textContent = 'No active navigation.';
      }
    } catch(e) {}
  }
  refreshNav();
  setInterval(refreshNav, 3000);

  // SSE log stream
  const es = new EventSource('/gemini/logs');

  es.addEventListener('connected', () => {
    statusEl.textContent = 'Connected — watching Gemini live';
  });

  es.addEventListener('chunk', e => {
    if (!currentTurn) {
      currentTurn = document.createElement('div');
      currentTurn.className = 'turn';
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = '▶ Gemini';
      currentTurn.appendChild(label);
      log.appendChild(currentTurn);
    }
    const span = document.createElement('span');
    span.className = 'chunk';
    span.textContent = e.data;
    currentTurn.appendChild(span);
    log.scrollTop = log.scrollHeight;
  });

  es.addEventListener('turn_complete', () => {
    currentTurn = null;
  });

  es.onerror = () => {
    statusEl.textContent = 'Connection lost — reload to reconnect';
  };
</script>
</body>
</html>
""")

