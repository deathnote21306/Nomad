import io
import os
import wave

import pyaudio
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs

from nomad.ip_webcam import push_audio

load_dotenv()

VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"  # George — change as needed


class TTSService:
    def __init__(self) -> None:
        self._client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

    def speak(self, text: str) -> None:
        # Get raw PCM (16-bit mono 44100Hz) from ElevenLabs
        pcm_iter = self._client.text_to_speech.convert(
            text=text,
            voice_id=VOICE_ID,
            model_id="eleven_multilingual_v2",
            output_format="pcm_44100",
        )
        pcm_bytes = b"".join(pcm_iter)

        # Wrap PCM in a WAV container
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)   # 16-bit
            wf.setframerate(44100)
            wf.writeframes(pcm_bytes)

        push_audio(buf.getvalue())

    def speak_local(self, text: str) -> None:
        """Generate speech via ElevenLabs and play through laptop speakers."""
        pcm_iter = self._client.text_to_speech.convert(
            text=text,
            voice_id=VOICE_ID,
            model_id="eleven_multilingual_v2",
            output_format="pcm_44100",
        )
        pcm_bytes = b"".join(pcm_iter)
        pa = pyaudio.PyAudio()
        stream = pa.open(format=pyaudio.paInt16, channels=1, rate=44100, output=True)
        stream.write(pcm_bytes)
        stream.stop_stream()
        stream.close()
        pa.terminate()


class TTSServiceSingleton:
    _instance: TTSService | None = None

    def __new__(cls) -> TTSService:
        if cls._instance is None:
            cls._instance = TTSService()
        return cls._instance
