import json
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path

_MIN_MOVE_M = 0.3  # ignore updates smaller than this (meters)


@dataclass
class Waypoint:
    x: float   # meters east  of origin
    y: float   # meters north of origin
    lat: float
    lon: float
    label: str | None = None


@dataclass
class LocalMap:
    path: Path = field(default_factory=lambda: Path("nomad_map.json"))
    origin: tuple[float, float] | None = None   # (lat, lon)
    waypoints: list[Waypoint] = field(default_factory=list)

    def __post_init__(self):
        self._load()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _load(self):
        if not self.path.exists():
            return
        raw = json.loads(self.path.read_text())
        if raw.get("origin"):
            self.origin = tuple(raw["origin"])
        self.waypoints = [Waypoint(**w) for w in raw.get("waypoints", [])]

    def save(self):
        data = {
            "origin": list(self.origin) if self.origin else None,
            "waypoints": [asdict(w) for w in self.waypoints],
        }
        self.path.write_text(json.dumps(data, indent=2))

    # ------------------------------------------------------------------
    # Coordinate math
    # ------------------------------------------------------------------

    def gps_to_xy(self, lat: float, lon: float) -> tuple[float, float]:
        """Convert absolute GPS to meters (east, north) relative to origin."""
        if self.origin is None:
            return 0.0, 0.0
        olat, olon = self.origin
        x = (lon - olon) * math.cos(math.radians(olat)) * 111_320
        y = (lat - olat) * 111_320
        return x, y

    # ------------------------------------------------------------------
    # Live update
    # ------------------------------------------------------------------

    def update(self, lat: float, lon: float) -> tuple[float, float]:
        """
        Record a new GPS fix. Sets the origin on the first call.
        Returns (x, y) relative to origin in metres.
        """
        if self.origin is None:
            self.origin = (lat, lon)

        x, y = self.gps_to_xy(lat, lon)

        # Only append a waypoint when we've moved meaningfully
        if self.waypoints:
            last = self.waypoints[-1]
            dist = math.hypot(x - last.x, y - last.y)
            if dist < _MIN_MOVE_M:
                return x, y

        self.waypoints.append(Waypoint(x=x, y=y, lat=lat, lon=lon))
        self.save()
        return x, y

    # ------------------------------------------------------------------
    # Annotation
    # ------------------------------------------------------------------

    def annotate(self, label: str, x: float | None = None, y: float | None = None):
        """Label the nearest waypoint to (x, y), or the most recent one."""
        if not self.waypoints:
            return
        if x is None or y is None:
            wp = self.waypoints[-1]
        else:
            wp = min(self.waypoints, key=lambda w: math.hypot(w.x - x, w.y - y))
        wp.label = label
        self.save()

    def find_nearest(self, x: float, y: float) -> Waypoint | None:
        if not self.waypoints:
            return None
        return min(self.waypoints, key=lambda w: math.hypot(w.x - x, w.y - y))

    def locate(self, lat: float, lon: float) -> str | None:
        """Return the label of the closest labeled waypoint, if any."""
        x, y = self.gps_to_xy(lat, lon)
        labeled = [w for w in self.waypoints if w.label]
        if not labeled:
            return None
        nearest = min(labeled, key=lambda w: math.hypot(w.x - x, w.y - y))
        return nearest.label

    # ------------------------------------------------------------------
    # Display
    # ------------------------------------------------------------------

    def summary(self) -> str:
        n = len(self.waypoints)
        labeled = sum(1 for w in self.waypoints if w.label)
        return f"{n} waypoints, {labeled} labeled"
