import geomag

_CARDINALS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
              "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]

# Fallback declination if no GPS fix is available yet (Montreal)
_DEFAULT_DECLINATION = -14.5


def get_declination(lat: float, lon: float, alt_m: float = 0.0) -> float:
    return geomag.declination(lat, lon, alt_m)


def bearing_to_cardinal(magnetic_degrees: float, declination: float = _DEFAULT_DECLINATION) -> tuple[float, str]:
    """Return (true_bearing, cardinal) corrected for magnetic declination."""
    true_bearing = (magnetic_degrees + declination) % 360
    index = round(true_bearing / (360 / len(_CARDINALS))) % len(_CARDINALS)
    return true_bearing, _CARDINALS[index]
