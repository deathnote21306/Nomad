import json
import subprocess
import threading
import time
import urllib.request
from collections.abc import Callable

import numpy as np
import pyaudio
from vosk import KaldiRecognizer, Model

MODEL_PATH = "models/vosk-model-en-us-0.42-gigaspeech"
SAMPLE_RATE = 16000
CHUNK = 4096
WAKE_WORD = "pocket lens"

SILENCE_SECONDS = 3.0

# DroidCam /audio streams raw PCM at 8000 Hz, 16-bit, mono
DROIDCAM_AUDIO_RATE = 8000


def _resample(data: bytes, from_rate: int, to_rate: int) -> bytes:
    """Linear interpolation resample using numpy (no audioop needed)."""
    if from_rate == to_rate or not data:
        return data
    arr = np.frombuffer(data, dtype=np.int16).astype(np.float32)
    n = int(len(arr) * to_rate / from_rate)
    resampled = np.interp(np.linspace(0, len(arr), n), np.arange(len(arr)), arr)
    return resampled.astype(np.int16).tobytes()


class ListenerService:
    def __init__(self) -> None:
        print("Loading Vosk model...")
        self._model = Model(MODEL_PATH)
        self._thread: threading.Thread | None = None
        self._running = False

    def start(self, on_transcript: Callable[[str], None], audio_url: str | None = None) -> None:
        self._running = True
        if audio_url:
            target = self._network_loop
            args = (on_transcript, audio_url)
            print(f"Listener starting from network audio: {audio_url}")
        else:
            target = self._mic_loop
            args = (on_transcript,)
            print("Listener starting from microphone.")
        self._thread = threading.Thread(target=target, args=args, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)

    def _process(
        self,
        recognizer: KaldiRecognizer,
        data: bytes,
        buffer: list[str],
        flush_timer_ref: list,
        on_transcript: Callable[[str], None],
    ) -> None:
        def _flush() -> None:
            if buffer:
                text = " ".join(buffer).strip()
                buffer.clear()
                if text:
                    print(f"\nHeard: {text}")
                    on_transcript(text)

        if recognizer.AcceptWaveform(data):
            text = json.loads(recognizer.Result()).get("text", "")
            print()
            if text:
                buffer.append(text)
                if flush_timer_ref[0]:
                    flush_timer_ref[0].cancel()
                t = threading.Timer(SILENCE_SECONDS, _flush)
                t.daemon = True
                t.start()
                flush_timer_ref[0] = t
        else:
            partial = json.loads(recognizer.PartialResult()).get("partial", "")
            print(f"\r{partial:<80}", end="", flush=True)

    def _network_loop(self, on_transcript: Callable[[str], None], audio_url: str) -> None:
        recognizer = KaldiRecognizer(self._model, SAMPLE_RATE)
        buffer: list[str] = []
        flush_timer_ref: list = [None]
        chunks_received = 0

        try:
            with urllib.request.urlopen(audio_url) as resp:
                print(f"[Audio] Connected to {audio_url}")
                print(f"[Audio] Response headers: {dict(resp.headers)}")
                while self._running:
                    raw = resp.read(CHUNK)
                    if not raw:
                        print("[Audio] Stream ended (0 bytes).")
                        break
                    chunks_received += 1
                    arr = np.frombuffer(raw, dtype=np.int16)
                    peak = int(np.abs(arr).max()) if len(arr) else 0
                    if chunks_received % 20 == 0:  # print every ~20 chunks
                        print(f"[Audio] chunk={chunks_received}  bytes={len(raw)}  peak={peak}")
                    resampled = _resample(raw, DROIDCAM_AUDIO_RATE, SAMPLE_RATE)
                    self._process(recognizer, resampled, buffer, flush_timer_ref, on_transcript)
        except Exception as e:
            print(f"[Audio] Network error: {e}")
        finally:
            if flush_timer_ref[0]:
                flush_timer_ref[0].cancel()
            print(f"[Audio] Loop ended. Total chunks received: {chunks_received}")

    def _mic_loop(self, on_transcript: Callable[[str], None]) -> None:
        recognizer = KaldiRecognizer(self._model, SAMPLE_RATE)
        audio = pyaudio.PyAudio()
        stream = audio.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=SAMPLE_RATE,
            input=True,
            frames_per_buffer=CHUNK,
        )
        buffer: list[str] = []
        flush_timer_ref: list = [None]

        try:
            while self._running:
                data = stream.read(CHUNK, exception_on_overflow=False)
                self._process(recognizer, data, buffer, flush_timer_ref, on_transcript)
        finally:
            if flush_timer_ref[0]:
                flush_timer_ref[0].cancel()
            stream.stop_stream()
            stream.close()
            audio.terminate()


class ListenerServiceSingleton:
    _instance: ListenerService | None = None

    def __new__(cls) -> ListenerService:
        if cls._instance is None:
            cls._instance = ListenerService()
        return cls._instance
