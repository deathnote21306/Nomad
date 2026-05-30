import asyncio
import json
import os
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

GEMINI_MODEL = "gemini-3.1-flash-live-preview"

SYSTEM_PROMPT = """You are Nomad, an AI navigation assistant helping a user travel from point A to point B.

You will receive periodic camera snapshots and voice messages from the user, always accompanied by the current navigation context (goal, current step, recent observations).

Your job:
- Assess the user's current environment from the image and confirm they are on the right path.
- Give brief, clear directional guidance (1-3 sentences max).
- When the user has clearly completed the current step, begin your response with exactly "STEP COMPLETE" followed by a confirmation message.
- If the user seems lost or off-track, give corrective guidance.
- Keep responses concise — the user is moving and listening, not reading.
"""


@dataclass
class Observation:
    summary: str
    response: str
    timestamp: float


class NavigationContext:
    def __init__(self) -> None:
        self.goal: str = ""
        self.steps: list[str] = []
        self.current_step: int = 0
        self._log: deque[Observation] = deque(maxlen=10)
        self._building_map: str = ""

    def load_graph(self, path: str) -> None:
        """Load graph_nav_graph.json and build a compact building map for Gemini context."""
        data = json.loads(Path(path).read_text())
        building = data.get("building", {})
        floor = building.get("floor", "?")

        rooms, doors, landmarks, waypoint_count = [], [], [], 0
        for node in data.get("nodes", []):
            lm = ", ".join(node.get("visual_landmarks", [])) or "no landmarks"
            name = node.get("name", node["id"])
            match node.get("type"):
                case "room":
                    rooms.append(f"{name} (landmarks: {lm})")
                case "door":
                    doors.append(name)
                case "landmark":
                    landmarks.append(f"{name} at ({node['x']:.2f}, {node['y']:.2f})")
                case _:
                    waypoint_count += 1

        lines = [f"[Building Map — Floor {floor}]"]
        if rooms:
            lines.append("Rooms: " + "; ".join(rooms))
        if doors:
            lines.append("Doors: " + ", ".join(set(doors)))
        if landmarks:
            lines.append("Landmarks: " + "; ".join(landmarks))
        if waypoint_count:
            lines.append(f"Waypoints: {waypoint_count} hallway/stair nodes")

        self._building_map = "\n".join(lines)
        print(f"Building map loaded: {len(data.get('nodes', []))} nodes, floor {floor}")

    def set_navigation(self, goal: str, steps: list[str]) -> None:
        self.goal = goal
        self.steps = steps
        self.current_step = 0
        self._log.clear()

    def advance_step(self) -> str | None:
        self.current_step += 1
        if self.current_step < len(self.steps):
            return self.steps[self.current_step]
        return None

    def log_observation(self, summary: str, response: str) -> None:
        self._log.append(Observation(summary=summary, response=response, timestamp=time.time()))

    @property
    def is_complete(self) -> bool:
        return self.current_step >= len(self.steps)

    @property
    def current_instruction(self) -> str:
        if self.steps and self.current_step < len(self.steps):
            return self.steps[self.current_step]
        return ""

    def get_context_header(self) -> str:
        parts = []
        if self._building_map:
            parts.append(self._building_map)
        if self.goal:
            parts += [
                "[Navigation Context]",
                f"Goal: {self.goal}",
                f"Step {self.current_step + 1}/{len(self.steps)}: {self.current_instruction}",
            ]
            if self._log:
                recent = "; ".join(o.summary for o in list(self._log)[-3:] if o.summary)
                if recent:
                    parts.append(f"Recent observations: {recent}")
        return "\n".join(parts)


class GeminiClient:
    def __init__(
        self,
        on_text: Callable[[str], None] | None = None,
        on_turn_complete: Callable[[], None] | None = None,
    ) -> None:
        self._genai = genai.Client(
            api_key=os.getenv("GEMINI_API_KEY"),
            http_options={"api_version": "v1beta"},
        )
        self.on_text = on_text
        self.on_turn_complete = on_turn_complete
        self.nav = NavigationContext()

        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._queue: asyncio.Queue | None = None
        self._connected = False

    def set_callbacks(
        self,
        on_text: Callable[[str], None],
        on_turn_complete: Callable[[], None],
    ) -> None:
        self.on_text = on_text
        self.on_turn_complete = on_turn_complete

    def connect(self) -> None:
        self._loop = asyncio.new_event_loop()
        self._queue = asyncio.Queue()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def _run_loop(self) -> None:
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self._session_loop())

    async def _session_loop(self) -> None:
        config = types.LiveConnectConfig(
            system_instruction=SYSTEM_PROMPT,
        )
        try:
            async with self._genai.aio.live.connect(model=GEMINI_MODEL, config=config) as session:
                self._connected = True
                print("Gemini Live session connected.")
                await asyncio.gather(self._sender(session), self._receiver(session))
        except Exception as e:
            print(f"Gemini session error: {e}")
        finally:
            self._connected = False

    async def _sender(self, session) -> None:
        while self._connected:
            try:
                item = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                await session.send(**item)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"Gemini send error: {e}")

    async def _receiver(self, session) -> None:
        try:
            async for response in session.receive():
                if response.text and self.on_text:
                    self.on_text(response.text)
                if (
                    response.server_content
                    and response.server_content.turn_complete
                    and self.on_turn_complete
                ):
                    self.on_turn_complete()
        except Exception as e:
            print(f"Gemini receive error: {e}")

    def _enqueue(self, **kwargs) -> None:
        if self._loop and self._queue and self._connected:
            asyncio.run_coroutine_threadsafe(self._queue.put(kwargs), self._loop)

    def send_text(self, text: str, inject_context: bool = True) -> None:
        header = self.nav.get_context_header()
        full = f"{header}\n\n{text}" if (inject_context and header) else text
        self._enqueue(input=full, end_of_turn=True)

    def send_image(self, frame: np.ndarray, prompt: str = "") -> None:
        _, buf = cv2.imencode(".jpg", frame)
        image_part = types.Part.from_bytes(data=buf.tobytes(), mime_type="image/jpeg")
        header = self.nav.get_context_header()
        text = prompt or "Assess the user's current position. Are they on track for the current step? Is the step complete?"
        full_text = f"{header}\n\n{text}" if header else text
        self._enqueue(input=[image_part, full_text], end_of_turn=True)

    def disconnect(self) -> None:
        self._connected = False

    def is_connected(self) -> bool:
        return self._connected


class GeminiClientSingleton:
    _instance: GeminiClient | None = None

    def __new__(cls) -> GeminiClient:
        if cls._instance is None:
            cls._instance = GeminiClient()
        return cls._instance
