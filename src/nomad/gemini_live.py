import asyncio
import logging
import os
import traceback
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

from nomad.floor_plan import load_floor_plan

load_dotenv()

logging.getLogger("google").setLevel(logging.ERROR)

_LIVE_MODEL      = "gemini-3.1-flash-live-preview"
_GEMINI_IN_RATE  = 16_000
_GEMINI_OUT_RATE = 24_000

_GRAPH_PATH = Path(__file__).parent.parent.parent / "assets" / "graph_nav_graph.json"

_BASE_PROMPT = (
    "You are Echo Guide, a friendly real-time navigation assistant for a visually impaired person. "
    "You can see through their phone camera and hear them speak.\n\n"
    "When a session starts, briefly introduce yourself and ask where they are or where they want to go one short sentence. "
    "Once you know their location, give clear step-by-step directions using the floor plan. "
    "Keep every response short and warm. One instruction at a time. "
    "Use left, right, straight ahead, stop. "
    "Immediately call out obstacles, doors, signs, or people you see in the camera. "
    "Be encouraging and calm: the user is counting on you."
)


def _build_system_prompt() -> str:
    if _GRAPH_PATH.exists():
        fp = load_floor_plan(_GRAPH_PATH)
        return (
            f"{_BASE_PROMPT}\n\n"
            f"You have detailed knowledge of the current floor plan. "
            f"Use it to give precise navigation instructions.\n\n"
            f"<floor_plan>\n{fp}\n</floor_plan>"
        )
    return _BASE_PROMPT


class GeminiLiveSession:
    def __init__(self) -> None:
        self._stop  = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        self._audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=200)
        self._video_queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=10)
        self._clients: set = set()  # connected browser WebSockets

    def add_client(self, ws) -> None:
        self._clients.add(ws)

    def remove_client(self, ws) -> None:
        self._clients.discard(ws)

    async def start(self) -> None:
        self._stop.clear()
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            try:
                await asyncio.wait_for(asyncio.shield(self._task), timeout=5)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._task.cancel()

    # ------------------------------------------------------------------
    # Public feed methods — called by WebSocket handlers
    # ------------------------------------------------------------------

    def feed_audio(self, pcm: bytes) -> None:
        try:
            self._audio_queue.put_nowait(pcm)
        except asyncio.QueueFull:
            pass

    def feed_video(self, jpeg: bytes) -> None:
        try:
            self._video_queue.put_nowait(jpeg)
        except asyncio.QueueFull:
            pass

    # ------------------------------------------------------------------
    # Session
    # ------------------------------------------------------------------

    async def _run(self) -> None:
        config = types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Puck")
                )
            ),
            system_instruction=types.Content(
                parts=[types.Part(text=_build_system_prompt())]
            ),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            realtime_input_config=types.RealtimeInputConfig(
                turn_coverage="TURN_INCLUDES_ONLY_ACTIVITY",
                automatic_activity_detection=types.AutomaticActivityDetection(
                    disabled=False,
                    start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_HIGH,
                    end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_HIGH,
                    prefix_padding_ms=0,
                    silence_duration_ms=300,
                ),
            ),
        )
        try:
            async with self._client.aio.live.connect(model=_LIVE_MODEL, config=config) as session:
                print("[Live] Connected to Gemini Live")
                send_audio_task = asyncio.create_task(self._send_audio(session))
                send_video_task = asyncio.create_task(self._send_video(session))
                receive_task    = asyncio.create_task(self._receive(session))
                try:
                    await asyncio.gather(send_audio_task, send_video_task, receive_task,
                                         return_exceptions=True)
                finally:
                    for t in (send_audio_task, send_video_task, receive_task):
                        t.cancel()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[Live] Session error: {e}\n{traceback.format_exc()}")
        finally:
            print("[Live] Session closed")

    # ------------------------------------------------------------------
    # Senders
    # ------------------------------------------------------------------

    async def _send_audio(self, session) -> None:
        chunk_n = 0
        try:
            while not self._stop.is_set():
                try:
                    chunk = await asyncio.wait_for(self._audio_queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                if chunk is None:
                    break
                await session.send_realtime_input(
                    audio=types.Blob(mime_type=f"audio/pcm;rate={_GEMINI_IN_RATE}", data=chunk)
                )
                chunk_n += 1
                if chunk_n % 50 == 0:
                    print(f"[Live →] audio chunk #{chunk_n}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[Live] Audio send error: {e}\n{traceback.format_exc()}")

    async def _send_video(self, session) -> None:
        frame_n = 0
        try:
            while not self._stop.is_set():
                try:
                    jpeg = await asyncio.wait_for(self._video_queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                if jpeg is None:
                    break
                await session.send_realtime_input(
                    video=types.Blob(mime_type="image/jpeg", data=jpeg)
                )
                frame_n += 1
                if frame_n % 10 == 0:
                    print(f"[Live →] video frame #{frame_n}  {len(jpeg)//1024}KB")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[Live] Video send error: {e}\n{traceback.format_exc()}")

    # ------------------------------------------------------------------
    # Receiver — re-enters iterator after each turn
    # ------------------------------------------------------------------

    async def _receive(self, session) -> None:
        print("[Live] _receive: listening...")
        try:
            while not self._stop.is_set():
                async for response in session.receive():
                    if self._stop.is_set():
                        return

                    sc = response.server_content

                    if sc and sc.model_turn:
                        for part in sc.model_turn.parts:
                            if part.inline_data and part.inline_data.data:
                                pcm = part.inline_data.data
                                for ws in list(self._clients):
                                    try:
                                        await ws.send_bytes(pcm)
                                    except Exception:
                                        self._clients.discard(ws)

                    if sc and getattr(sc, "interrupted", False):
                        print("[Live ←] interrupted — flushing clients")
                        for ws in list(self._clients):
                            try:
                                await ws.send_text('{"type":"interrupt"}')
                            except Exception:
                                self._clients.discard(ws)

                    if sc and sc.output_transcription and sc.output_transcription.text:
                        print(f"[Live ←] Gemini: {sc.output_transcription.text}")

                    if sc and sc.input_transcription and sc.input_transcription.text:
                        print(f"[Live ←] User:   {sc.input_transcription.text}")

                    if sc and sc.turn_complete:
                        print("[Live ←] turn complete")

        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[Live] Receive error: {e}\n{traceback.format_exc()}")
