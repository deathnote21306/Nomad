import json
import pyaudio
from vosk import Model, KaldiRecognizer

from nomad.tts import speak

# ── Point this at your unzipped vosk model folder ────────────────────────────
MODEL_PATH = "models/vosk-model-en-us-0.42-gigaspeech"
SAMPLE_RATE = 16000
# ─────────────────────────────────────────────────────────────────────────────

CHUNK = 4096
WAKE_WORD = "nomad"


def listen():
    model = Model(MODEL_PATH)
    recognizer = KaldiRecognizer(model, SAMPLE_RATE)

    audio = pyaudio.PyAudio()
    stream = audio.open(
        format=pyaudio.paInt16,
        channels=1,
        rate=SAMPLE_RATE,
        input=True,
        frames_per_buffer=CHUNK,
    )

    print("Listening... (say 'nomad' to trigger)")
    try:
        while True:
            data = stream.read(CHUNK, exception_on_overflow=False)
            if recognizer.AcceptWaveform(data):
                text = json.loads(recognizer.Result()).get("text", "")
                print()  # newline after the partial line
                if not text:
                    continue
                print(f"Heard: {text}")
                speak(text)
                if WAKE_WORD in text.lower():
                    print("Asking Gemini...")
                    # TODO: call Gemini here
            else:
                partial = json.loads(recognizer.PartialResult()).get("partial", "")
                print(f"\r{partial:<80}", end="", flush=True)
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        stream.stop_stream()
        stream.close()
        audio.terminate()


if __name__ == "__main__":
    listen()
