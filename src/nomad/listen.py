import json
import threading
from collections.abc import Callable

import pyaudio
from vosk import KaldiRecognizer, Model

MODEL_PATH = "models/vosk-model-en-us-0.42-gigaspeech"
SAMPLE_RATE = 16000
CHUNK = 4096
WAKE_WORD = "nomad"


class ListenerService:
    def __init__(self) -> None:
        print("Loading Vosk model...")
        self._model = Model(MODEL_PATH)
        self._thread: threading.Thread | None = None
        self._running = False

    def start(self, on_transcript: Callable[[str], None]) -> None:
        self._running = True
        self._thread = threading.Thread(
            target=self._loop, args=(on_transcript,), daemon=True
        )
        self._thread.start()
        print("Listener started.")

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)

    def _loop(self, on_transcript: Callable[[str], None]) -> None:
        recognizer = KaldiRecognizer(self._model, SAMPLE_RATE)
        audio = pyaudio.PyAudio()
        stream = audio.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=SAMPLE_RATE,
            input=True,
            frames_per_buffer=CHUNK,
        )
        try:
            while self._running:
                data = stream.read(CHUNK, exception_on_overflow=False)
                if recognizer.AcceptWaveform(data):
                    text = json.loads(recognizer.Result()).get("text", "")
                    print()
                    if text:
                        print(f"Heard: {text}")
                        on_transcript(text)
                else:
                    partial = json.loads(recognizer.PartialResult()).get("partial", "")
                    print(f"\r{partial:<80}", end="", flush=True)
        finally:
            stream.stop_stream()
            stream.close()
            audio.terminate()


class ListenerServiceSingleton:
    _instance: ListenerService | None = None

    def __new__(cls) -> ListenerService:
        if cls._instance is None:
            cls._instance = ListenerService()
        return cls._instance
