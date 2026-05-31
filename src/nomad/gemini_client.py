import os

import cv2
import numpy as np
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

GEMINI_MODEL = "gemini-2.5-flash"

DESCRIBE_PROMPT = (
    "You are assisting a blind person. Describe what you see in this image clearly and helpfully. "
    "Mention important objects, people, text, and spatial relationships. "
    "If the user asked a specific question, answer it directly first. "
    "Keep the description concise and avoid necessary details. I am blind and trying to navigate through envrioment."
    "CRITICAL: Do not mention the watermark droidcam.app. Just describe the scene as if you were there."
)


class GeminiClient:
    def __init__(self) -> None:
        self._client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    def describe(self, frame: np.ndarray, user_text: str = "") -> str:
        """Send an annotated frame to Gemini and get a scene description."""
        frame = cv2.resize(frame, (1280, 960))
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        image_part = types.Part(
            inline_data=types.Blob(data=buf.tobytes(), mime_type="image/jpeg")
        )
        prompt = DESCRIBE_PROMPT
        if user_text:
            prompt = f'The user said: "{user_text}"\n\n{DESCRIBE_PROMPT}'
        response = self._client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[image_part, types.Part(text=prompt)],
        )
        return response.text or ""


class GeminiClientSingleton:
    _instance: GeminiClient | None = None

    def __new__(cls) -> GeminiClient:
        if cls._instance is None:
            cls._instance = GeminiClient()
        return cls._instance
