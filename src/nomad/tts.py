import os
import subprocess
import tempfile

from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs

load_dotenv()

_client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))


def speak(text: str) -> None:
    audio = _client.text_to_speech.convert(
        text=text,
        voice_id="JBFqnCBsd6RMkjVDRZzb",  # George — change as needed
        model_id="eleven_multilingual_v2",
    )
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        for chunk in audio:
            f.write(chunk)
        tmp_path = f.name
    subprocess.run(["afplay", tmp_path])
    os.unlink(tmp_path)
