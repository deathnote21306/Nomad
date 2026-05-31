"""nomad-record — live GPS map recorder.

Usage:
    nomad-record              # record relative to existing origin
    nomad-record --origin     # wipe map, treat first fix as (0, 0)
    nomad-record --url http://192.168.x.x:8000   # non-default server
"""

import argparse
import math
import sys
import time
import urllib.error
import urllib.request


def _get(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=3) as r:
        import json
        return json.loads(r.read())


def _post(url: str) -> dict:
    req = urllib.request.Request(url, data=b"{}", method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=3) as r:
        import json
        return json.loads(r.read())


def record():
    parser = argparse.ArgumentParser(prog="nomad-record")
    parser.add_argument("--origin", action="store_true",
                        help="Wipe the map and treat the next GPS fix as (0, 0)")
    parser.add_argument("--url", default="http://localhost:8000",
                        help="Server base URL (default: http://localhost:8000)")
    args = parser.parse_args()

    base = args.url.rstrip("/")

    if args.origin:
        try:
            _post(f"{base}/map/reset")
        except Exception as e:
            print(f"[error] Could not reset map: {e}", file=sys.stderr)
            sys.exit(1)
        print("[map] Origin cleared — walk to your starting point, next GPS fix = (0, 0)")
    else:
        print("[map] Recording relative to existing origin (use --origin to restart)")

    print("[map] Listening for GPS fixes…  Ctrl+C to stop\n")

    seen = 0  # waypoints already printed

    try:
        while True:
            try:
                status = _get(f"{base}/map/status")
            except urllib.error.URLError as e:
                print(f"\r[error] Server unreachable: {e}  (retrying…)", end="", flush=True)
                time.sleep(2)
                continue

            waypoints = status.get("waypoints", [])
            origin = status.get("origin")

            if origin and not seen:
                print(f"Origin  lat={origin[0]:.6f}  lon={origin[1]:.6f}")

            for i, w in enumerate(waypoints[seen:], start=seen):
                dist = math.hypot(w["x"], w["y"])
                label = f"  [{w['label']}]" if w.get("label") else ""
                tag = " ← origin" if i == 0 else ""
                print(f"  #{i:<3} ({w['x']:+6.2f}m E, {w['y']:+6.2f}m N)  dist={dist:.2f}m{label}{tag}")

            seen = len(waypoints)
            time.sleep(1)

    except KeyboardInterrupt:
        print(f"\n[map] Done.  {seen} waypoints recorded.")
