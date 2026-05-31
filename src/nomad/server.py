from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from nomad.gemini_live import GeminiLiveSession
from nomad.ip_webcam import mjpeg_frames
from nomad.tts import TTSServiceSingleton
from nomad.utils import bearing_to_cardinal, get_declination

_STATIC = Path(__file__).parent / "static"

_gps: dict | None = None
_live: GeminiLiveSession | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _live
    _live = GeminiLiveSession()
    await _live.start()
    yield
    await _live.stop()
    _live = None


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory=_STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(_STATIC / "index.html")


@app.get("/preview")
def preview():
    return StreamingResponse(mjpeg_frames(), media_type="multipart/x-mixed-replace; boundary=frame")


class SpeakRequest(BaseModel):
    text: str


@app.post("/speak")
def speak(body: SpeakRequest):
    TTSServiceSingleton().speak(body.text)
    return {"status": "ok"}


@app.post("/live/start")
async def live_start():
    global _live
    if _live is not None:
        return {"status": "already running"}
    _live = GeminiLiveSession()
    await _live.start()
    return {"status": "started"}


@app.post("/live/restart")
async def live_restart():
    global _live
    if _live:
        await _live.stop()
    _live = GeminiLiveSession()
    await _live.start()
    return {"status": "restarted"}


@app.post("/live/stop")
async def live_stop():
    global _live
    if _live is None:
        return {"status": "not running"}
    await _live.stop()
    _live = None
    return {"status": "stopped"}


@app.websocket("/ws/audio")
async def ws_audio(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Audio client connected")
    if _live:
        _live.add_client(websocket)
    try:
        while True:
            data = await websocket.receive_bytes()
            if _live:
                _live.feed_audio(data)
    except WebSocketDisconnect:
        print("[WS] Audio client disconnected")
    finally:
        if _live:
            _live.remove_client(websocket)


@app.websocket("/ws/video")
async def ws_video(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Video client connected")
    try:
        while True:
            data = await websocket.receive_bytes()
            if _live:
                _live.feed_video(data)
    except WebSocketDisconnect:
        print("[WS] Video client disconnected")


@app.post("/sensor_logger")
async def sensor_logger(request: Request):
    global _gps
    data = await request.json()

    declination = None

    for entry in data.get("payload", []):
        name = entry["name"]
        values = entry["values"]

        if name == "location":
            _gps = values
            lat, lon = values["latitude"], values["longitude"]
            declination = get_declination(lat, lon, values.get("altitude", 0))
            print(f"[GPS] lat={lat:.6f}  lon={lon:.6f}")

        elif name == "compass":
            magnetic = values["magneticBearing"]
            dec = declination or (
                get_declination(_gps["latitude"], _gps["longitude"], _gps.get("altitude", 0))
                if _gps else None
            )
            true_bearing, cardinal = bearing_to_cardinal(magnetic, dec) if dec is not None else bearing_to_cardinal(magnetic)
            print(f"[Compass] true={true_bearing:.1f}°  {cardinal}")

    return {"status": "ok"}
