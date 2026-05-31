"""
Convert a graph_nav_graph.json into a structured natural-language floor plan
suitable for injection into a Gemini system prompt.
"""

import json
from pathlib import Path


def _cardinal_zone(x: float, y: float) -> str:
    """Map normalized (0-1, top-left origin) coords to a readable zone."""
    ns = "north" if y < 0.33 else ("south" if y > 0.67 else "central")
    ew = "west"  if x < 0.33 else ("east"  if x > 0.67 else "center")
    if ew == "center":
        return ns
    if ns == "central":
        return ew
    return f"{ns}-{ew}"


def graph_to_text(graph: dict) -> str:
    building = graph.get("building", {})
    nodes    = {n["id"]: n for n in graph.get("nodes", [])}
    edges    = graph.get("edges", [])

    # ---------- adjacency index ----------
    adj: dict[str, list[dict]] = {}
    for e in edges:
        for src, dst in [(e["from"], e["to"]), (e["to"], e["from"])]:
            adj.setdefault(src, []).append({
                "to":          dst,
                "direction":   e.get("direction", {}).get("cardinal", ""),
                "distance":    e.get("distance",  {}).get("category",  ""),
                "type":        e.get("type", ""),
                "instruction": e.get("instruction", ""),
            })

    by_type: dict[str, list] = {}
    for n in nodes.values():
        by_type.setdefault(n["type"], []).append(n)

    lines: list[str] = []

    # ── Header ──────────────────────────────────────────────────────────
    name  = building.get("name", "")
    floor = building.get("floor", "1")
    lines.append(f"Floor {floor}" + (f" — {name}" if name else ""))
    lines.append("")

    # ── Rooms ────────────────────────────────────────────────────────────
    lines.append("ROOMS:")
    for room in sorted(by_type.get("room", []), key=lambda r: (r["y"], r["x"])):
        zone      = _cardinal_zone(room["x"], room["y"])
        landmarks = room.get("visual_landmarks") or []
        notes     = room.get("notes", "").strip()

        # doors directly connected to this room
        doors_out = []
        for link in adj.get(room["id"], []):
            nb = nodes.get(link["to"])
            if nb and nb["type"] == "door":
                doors_out.append(f"{nb['name']} (direction: {link['direction']})")

        lines.append(f"- {room['name']}  [{zone}]")
        if landmarks:
            lines.append(f"    Recognise by: {', '.join(landmarks)}")
        if doors_out:
            lines.append(f"    Exits: {'; '.join(doors_out)}")
        if notes:
            lines.append(f"    Notes: {notes}")

    lines.append("")

    # ── Stairs ───────────────────────────────────────────────────────────
    stairs = by_type.get("stairs", [])
    if stairs:
        lines.append("STAIRS:")
        for s in stairs:
            zone = _cardinal_zone(s["x"], s["y"])
            # find what hallway connects to it
            connected = [
                nodes[lk["to"]]["name"] or nodes[lk["to"]]["id"]
                for lk in adj.get(s["id"], [])
                if nodes.get(lk["to"], {}).get("type") == "hallway"
            ]
            desc = f"Stairwell [{zone}]"
            if connected:
                desc += f" — accessible from {', '.join(connected)}"
            lines.append(f"- {desc}")
        lines.append("")

    # ── Doors ────────────────────────────────────────────────────────────
    lines.append("DOORS (named landmarks you will physically see):")
    door_map: dict[str, list[str]] = {}
    for door in by_type.get("door", []):
        door_map.setdefault(door["name"], []).append(door["id"])

    for door_name, ids in sorted(door_map.items()):
        zone = _cardinal_zone(
            sum(nodes[i]["x"] for i in ids) / len(ids),
            sum(nodes[i]["y"] for i in ids) / len(ids),
        )
        # which rooms does this door lead to?
        rooms_linked = set()
        for did in ids:
            for lk in adj.get(did, []):
                nb = nodes.get(lk["to"])
                if nb and nb["type"] == "room":
                    rooms_linked.add(nb["name"])
        suffix = f" → {', '.join(sorted(rooms_linked))}" if rooms_linked else ""
        lines.append(f"- {door_name} [{zone}]{suffix}")
    lines.append("")

    # ── Navigation instructions (from edges) ─────────────────────────────
    lines.append("STEP-BY-STEP NAVIGATION INSTRUCTIONS:")
    seen_instr: set[str] = set()
    for e in edges:
        instr = e.get("instruction", "").strip()
        if not instr or instr in seen_instr:
            continue
        # skip generic unlabelled hallway hops
        if instr.startswith("Proceed from hallway"):
            continue
        seen_instr.add(instr)
        src_node = nodes.get(e["from"], {})
        dst_node = nodes.get(e["to"],   {})
        src_label = src_node.get("name") or src_node.get("id", e["from"])
        dst_label = dst_node.get("name") or dst_node.get("id", e["to"])
        cardinal  = e.get("direction", {}).get("cardinal", "")
        distance  = e.get("distance",  {}).get("category", "")
        detail    = f"({cardinal}, {distance})" if cardinal else ""
        lines.append(f"  [{src_label} → {dst_label}] {detail}: {instr}")

    lines.append("")

    # ── Hallway structure (human-readable spine) ──────────────────────────
    lines.append("HALLWAY NETWORK SUMMARY:")
    hallway_nodes = by_type.get("hallway", [])
    # group hallways by connectivity cluster — simplified: list what each connects to
    for hw in sorted(hallway_nodes, key=lambda h: (h["y"], h["x"])):
        zone = _cardinal_zone(hw["x"], hw["y"])
        label = hw.get("name") or hw["id"]
        neighbours = []
        for lk in adj.get(hw["id"], []):
            nb = nodes.get(lk["to"])
            if nb:
                nb_label = nb.get("name") or nb["id"]
                neighbours.append(f"{nb_label} ({lk['direction']})")
        if neighbours:
            lines.append(f"- {label} [{zone}]: connects to {', '.join(neighbours)}")

    return "\n".join(lines)


def load_floor_plan(path: str | Path) -> str:
    """Read a graph_nav_graph.json and return a floor plan text block."""
    return graph_to_text(json.loads(Path(path).read_text()))
