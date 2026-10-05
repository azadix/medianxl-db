"""Generate skill-viz GIFs from patterns.json. Decodes DCC in memory; no public PNGs."""

from __future__ import annotations

import argparse
import json
import math
import pickle
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops

from dcc import DccError, load_dcc
from mpq import extract_palette, iter_extracted_cels, load_config, load_palette, require_path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
PATTERNS_PATH = REPO_ROOT / "src" / "skill-viz" / "patterns.json"
CACHE_DIR = SCRIPT_DIR / "_cache"
GIF_DIR = REPO_ROOT / "public" / "skill_viz"
FPS_DEFAULT = 25

# 8-way D2 heading sectors. Index 0 is south; 6 is east (screen right).
# For 16/32-dir cels the index is scaled: dir = round(sector * n / 8) % n
HEADING_SECTOR = {
    "down": 0,
    "down-left": 1,
    "left": 2,
    "up-left": 3,
    "up": 4,
    "up-right": 5,
    "right": 6,
    "down-right": 7,
}

NOVA_HEADINGS = (
    "down",
    "down-left",
    "left",
    "up-left",
    "up",
    "up-right",
    "right",
    "down-right",
)


def _cel_cache_key(cel: str) -> str:
    return cel.replace("\\", "_").replace("/", "_").replace(" ", "_")


def _png_bytes(img: Image.Image) -> bytes:
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _hydrate_cel(payload: dict) -> dict:
    dirs = []
    for dcc_dir in payload["dirs"]:
        frames = [Image.open(BytesIO(raw)).convert("RGBA") for raw in dcc_dir["frames_png"]]
        dirs.append({**dcc_dir, "frames": frames})
    return {"cel": payload["cel"], "dirs": dirs}


def _frame_to_rgba(
    pixel_data: bytes, width: int, height: int, palette: list[tuple[int, int, int]]
) -> Image.Image:
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    px = img.load()
    for y in range(height):
        row = y * width
        for x in range(width):
            index = pixel_data[row + x]
            if index == 0:
                continue
            r, g, b = palette[index]
            px[x, y] = (r, g, b, 255)
    return img


def _heading_dir(n_dirs: int, heading: str, override: int | None) -> int:
    if n_dirs < 1:
        return 0
    if override is not None:
        return override % n_dirs
    sector = HEADING_SECTOR.get(heading, 6)
    return int(round(sector * n_dirs / 8)) % n_dirs


def _heading_vector(heading: str) -> tuple[float, float]:
    sector = HEADING_SECTOR.get(heading, 6)
    ang = (sector * math.pi / 4) + math.pi / 2
    return math.cos(ang), math.sin(ang) * 0.55


def _dcc_dir_from_vector(dx: float, dy: float, n_dirs: int, override: int | None) -> int:
    if n_dirs < 1:
        return 0
    if override is not None:
        return override % n_dirs
    if dx == 0 and dy == 0:
        return 0
    # y-down atan2: south is +pi/2, D2 dir 0. Increasing atan2 is SW/W (D2 1, 2, ...).
    sector = (math.atan2(dy, dx) - math.pi / 2) / (2 * math.pi)
    return int(round(sector * n_dirs)) % n_dirs


def decode_cel_to_cache(
    cel: str, exe: Path, game_dir: Path, palette: list[tuple[int, int, int]]
) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{_cel_cache_key(cel)}.pkl"
    if cache_path.is_file():
        return _hydrate_cel(pickle.loads(cache_path.read_bytes()))

    last_error = None
    dcc = None
    for dcc_path in iter_extracted_cels(exe, game_dir, cel):
        if dcc_path.suffix.lower() != ".dcc":
            last_error = f"DC6 fallback is not implemented ({dcc_path.name})"
            continue
        try:
            dcc = load_dcc(dcc_path.read_bytes())
            break
        except DccError as e:
            last_error = f"Failed to decode {dcc_path.name}: {e}"
            print(last_error)
    if dcc is None:
        raise SystemExit(last_error or f"No DCC for {cel}")

    dirs = []
    for direction in dcc.directions:
        frames = [
            _frame_to_rgba(frame.pixel_data, direction.box_width, direction.box_height, palette)
            for frame in direction.frames
        ]
        dirs.append(
            {
                "width": direction.box_width,
                "height": direction.box_height,
                "originX": -direction.box_left,
                "originY": -direction.box_top,
                "frames_png": [_png_bytes(img) for img in frames],
            }
        )
    payload = {"cel": cel, "dirs": dirs}
    cache_path.write_bytes(pickle.dumps(payload, protocol=pickle.HIGHEST_PROTOCOL))
    print(f"Cached {cel} ({len(dirs)} dirs)")
    return _hydrate_cel(payload)


def _blit(canvas: Image.Image, sprite: Image.Image, x: int, y: int, additive: bool) -> Image.Image:
    if additive:
        overlay = Image.new("RGB", canvas.size, (0, 0, 0))
        overlay.paste(sprite.convert("RGB"), (x, y), sprite.split()[-1])
        return ImageChops.add(canvas, overlay)
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    layer.paste(sprite, (x, y), sprite)
    out = canvas.convert("RGBA")
    out.alpha_composite(layer)
    return out.convert("RGB")


def _write_gif(frames: list[Image.Image], path: Path, fps: int) -> None:
    duration_ms = round(1000 / max(fps, 1))
    path.parent.mkdir(parents=True, exist_ok=True)
    base = frames[0].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    converted = [base]
    for frame in frames[1:]:
        converted.append(frame.quantize(palette=base, dither=Image.Dither.NONE))
    converted[0].save(
        path,
        save_all=True,
        append_images=converted[1:],
        duration=[duration_ms] * len(converted),
        loop=0,
        disposal=2,
        optimize=False,
    )


def _events_burst(pattern: dict, cels: list[dict]) -> tuple[list[dict], int, int]:
    width, height = pattern.get("canvas") or [320, 200]
    cx, cy = width // 2, height // 2
    use_all = bool(pattern.get("useAllDirections"))
    events = []
    for cel in cels:
        dirs = range(len(cel["dirs"])) if use_all else [0]
        for d in dirs:
            events.append({"t": 0, "cel": cel, "dir": d, "x": cx, "y": cy})
    return events, width, height


def _events_directional(pattern: dict, cels: list[dict]) -> tuple[list[dict], int, int]:
    width, height = pattern.get("canvas") or [520, 240]
    heading = pattern.get("heading") or "right"
    emit = pattern.get("emit") or {}
    steps = int(emit.get("steps") or 4)
    spacing = int(emit.get("spacing") or 48)
    stagger = int(emit.get("stagger") or 2)
    override = pattern.get("dccDir")
    dx, dy = _heading_vector(heading)
    origin_x = 90 if heading == "right" else width // 2
    origin_y = height // 2
    events = []
    for cel_i, cel in enumerate(cels):
        d = _heading_dir(len(cel["dirs"]), heading, cel.get("dccDir", override))
        for step in range(steps):
            dist = step * spacing
            events.append(
                {
                    "t": cel_i * stagger + step * stagger,
                    "cel": cel,
                    "dir": d,
                    "x": round(origin_x + dx * dist),
                    "y": round(origin_y + dy * dist),
                }
            )
    return events, width, height


def _events_nova(pattern: dict, cels: list[dict]) -> tuple[list[dict], int, int]:
    width, height = pattern.get("canvas") or [480, 360]
    emit = pattern.get("emit") or {}
    steps = int(emit.get("steps") or 3)
    spacing = int(emit.get("spacing") or 40)
    stagger = int(emit.get("stagger") or 2)
    override = pattern.get("dccDir")
    cx, cy = width // 2, height // 2
    events = []
    for cel_i, cel in enumerate(cels):
        for heading in NOVA_HEADINGS:
            d = _heading_dir(len(cel["dirs"]), heading, cel.get("dccDir", override))
            dx, dy = _heading_vector(heading)
            for step in range(steps):
                dist = (step + 1) * spacing
                events.append(
                    {
                        "t": cel_i + step * stagger,
                        "cel": cel,
                        "dir": d,
                        "x": round(cx + dx * dist),
                        "y": round(cy + dy * dist),
                    }
                )
    return events, width, height


def _events_spiral(pattern: dict, cels: list[dict]) -> tuple[list[dict], int, int]:
    width, height = pattern.get("canvas") or [480, 360]
    emit = pattern.get("emit") or {}
    count = max(1, int(emit.get("count") or 8))
    duration = max(2, int(emit.get("duration") or 16))
    radius = float(emit.get("radius") or 12)
    expand = float(emit.get("expand") or 8)
    spin = float(emit.get("spin") or 0.22)
    squash = 0.55
    override = pattern.get("dccDir")
    cx, cy = width // 2, height // 2
    events = []
    for cel_i, cel in enumerate(cels):
        n_dirs = len(cel["dirs"])
        for i in range(count):
            theta0 = i * (2 * math.pi / count) + cel_i * 0.2
            for t in range(duration):
                theta = theta0 + spin * t
                r = radius + expand * t
                x = cx + r * math.cos(theta)
                y = cy + r * math.sin(theta) * squash
                theta_n = theta0 + spin * (t + 1)
                r_n = radius + expand * (t + 1)
                dx = r_n * math.cos(theta_n) - r * math.cos(theta)
                dy = (r_n * math.sin(theta_n) - r * math.sin(theta)) * squash
                events.append(
                    {
                        "t": t + cel_i,
                        "cel": cel,
                        "dir": _dcc_dir_from_vector(dx, dy, n_dirs, cel.get("dccDir", override)),
                        "frame": t % max(len(cel["dirs"][0]["frames"]), 1),
                        "hold": max(1, int(emit.get("hold") or 3)),
                        "x": round(x),
                        "y": round(y),
                    }
                )
    return events, width, height


def _events_fall(pattern: dict, cels: list[dict]) -> tuple[list[dict], int, int]:
    width, height = pattern.get("canvas") or [400, 360]
    emit = pattern.get("emit") or {}
    count = max(1, int(emit.get("count") or 8))
    duration = max(2, int(emit.get("duration") or 12))
    spread = float(emit.get("spread") or 180)
    start_y = int(emit.get("startY") or 24)
    ground_y = int(emit.get("groundY") or height - 70)
    stagger = int(emit.get("stagger") or 2)
    override = pattern.get("dccDir")
    cx = width // 2
    rocks = [c for c in cels if c.get("role") != "dust"]
    dust = [c for c in cels if c.get("role") == "dust"]
    if not rocks:
        rocks = list(cels)
    events = []
    for i in range(count):
        phase = i * 2.399
        x = cx + math.cos(phase) * (spread * 0.5)
        t0 = (i % 4) * stagger
        y0 = start_y - (i % 3) * 22
        rock = rocks[i % len(rocks)]
        n_dirs = len(rock["dirs"])
        d = rock.get("dccDir", override)
        d = 0 if d is None else int(d) % max(n_dirs, 1)
        n_frames = len(rock["dirs"][d]["frames"])
        for t in range(duration):
            u = t / (duration - 1)
            y = y0 + (ground_y - y0) * (u * u)
            events.append(
                {
                    "t": t0 + t,
                    "cel": rock,
                    "dir": d,
                    "frame": t % max(n_frames, 1),
                    "x": round(x),
                    "y": round(y),
                }
            )
    t_dust = (count // 2) * stagger + duration - 1
    for dust_cel in dust:
        events.append(
            {
                "t": t_dust,
                "cel": dust_cel,
                "dir": 0,
                "x": cx,
                "y": ground_y,
            }
        )
    return events, width, height


def _anchor_event(
    cel: dict, t: int, x: int, y: int, duration: int, dcc_dir: int, loop_start: int = 0
) -> dict:
    return {
        "t": t,
        "cel": cel,
        "dir": dcc_dir % max(len(cel["dirs"]), 1),
        "x": x,
        "y": y,
        "loop": True,
        "duration": duration,
        "loopStart": loop_start,
    }


def _moving_shot_events(
    cel: dict,
    t0: int,
    x0: int,
    y0: int,
    dx: float,
    dy: float,
    steps: int,
    spacing: int,
    stagger: int,
    hold: int,
    heading: str,
    override: int | None,
) -> list[dict]:
    n_dirs = len(cel["dirs"])
    d = _heading_dir(n_dirs, heading, cel.get("dccDir", override))
    n_frames = len(cel["dirs"][d]["frames"])
    events = []
    for step in range(steps):
        dist = (step + 1) * spacing
        events.append(
            {
                "t": t0 + step * stagger,
                "cel": cel,
                "dir": d,
                "frame": step % max(n_frames, 1),
                "hold": hold,
                "x": round(x0 + dx * dist),
                "y": round(y0 + dy * dist),
            }
        )
    return events


def _events_ring(pattern: dict, cels: list[dict]) -> tuple[list[dict], int, int]:
    width, height = pattern.get("canvas") or [560, 380]
    emit = pattern.get("emit") or {}
    count = max(1, int(emit.get("count") or 8))
    radius = float(emit.get("radius") or 90)
    duration = max(4, int(emit.get("duration") or 24))
    steps = int(emit.get("steps") or 4)
    spacing = int(emit.get("spacing") or 28)
    stagger = int(emit.get("stagger") or 2)
    shot_delay = int(emit.get("shotDelay") or 3)
    hold = max(1, int(emit.get("hold") or 2))
    loop_start = int(emit.get("loopStart") or 0)
    override = pattern.get("dccDir")
    cx, cy = width // 2, height // 2
    anchors = [c for c in cels if c.get("role") == "anchor"]
    shots = [c for c in cels if c.get("role") == "shot"]
    if not anchors:
        anchors = cels[:1]
    events = []
    headings = [NOVA_HEADINGS[round(i * 8 / count) % 8] for i in range(count)]
    for i, heading in enumerate(headings):
        dx, dy = _heading_vector(heading)
        x = round(cx + dx * radius)
        y = round(cy + dy * radius)
        anchor = anchors[i % len(anchors)]
        adir = _heading_dir(len(anchor["dirs"]), heading, anchor.get("dccDir", override))
        events.append(_anchor_event(anchor, 0, x, y, duration, adir, loop_start))
        for shot in shots:
            events.extend(
                _moving_shot_events(
                    shot, shot_delay, x, y, dx, dy, steps, spacing, stagger, hold, heading, override
                )
            )
    return events, width, height


def _events_volcano(pattern: dict, cels: list[dict]) -> tuple[list[dict], int, int]:
    width, height = pattern.get("canvas") or [480, 360]
    emit = pattern.get("emit") or {}
    duration = max(4, int(emit.get("duration") or 24))
    count = max(1, int(emit.get("count") or 8))
    steps = int(emit.get("steps") or 3)
    spacing = int(emit.get("spacing") or 28)
    stagger = int(emit.get("stagger") or 2)
    shot_delay = int(emit.get("shotDelay") or 2)
    hold = max(1, int(emit.get("hold") or 2))
    loop_start = int(emit.get("loopStart") or 0)
    override = pattern.get("dccDir")
    cx, cy = width // 2, height // 2
    anchors = [c for c in cels if c.get("role") == "anchor"]
    shots = [c for c in cels if c.get("role") == "shot"]
    dust = [c for c in cels if c.get("role") == "dust"]
    if not anchors:
        anchors = cels[:1]
    events = []
    for anchor in anchors:
        events.append(_anchor_event(anchor, 0, cx, cy, duration, 0, loop_start))
    headings = [NOVA_HEADINGS[round(i * 8 / count) % 8] for i in range(count)]
    for shot in shots:
        for heading in headings:
            dx, dy = _heading_vector(heading)
            events.extend(
                _moving_shot_events(
                    shot, shot_delay, cx, cy, dx, dy, steps, spacing, stagger, hold, heading, override
                )
            )
    for dust_cel in dust:
        events.append(
            {
                "t": shot_delay + steps * stagger,
                "cel": dust_cel,
                "dir": 0,
                "x": cx,
                "y": cy,
            }
        )
    return events, width, height


def _render(pattern: dict, cels: list[dict]) -> list[Image.Image]:
    kind = pattern.get("kind") or "burst"
    if kind == "directional":
        events, width, height = _events_directional(pattern, cels)
    elif kind == "nova":
        events, width, height = _events_nova(pattern, cels)
    elif kind == "spiral":
        events, width, height = _events_spiral(pattern, cels)
    elif kind == "fall":
        events, width, height = _events_fall(pattern, cels)
    elif kind == "ring":
        events, width, height = _events_ring(pattern, cels)
    elif kind == "volcano":
        events, width, height = _events_volcano(pattern, cels)
    else:
        events, width, height = _events_burst(pattern, cels)
    additive = pattern.get("blend") in ("add", "lighter")
    duration = 1
    for event in events:
        n = len(event["cel"]["dirs"][event["dir"]]["frames"])
        if event.get("loop"):
            duration = max(duration, event["t"] + int(event.get("duration") or n))
        elif "frame" in event:
            duration = max(duration, event["t"] + max(1, int(event.get("hold") or 1)))
        else:
            duration = max(duration, event["t"] + n)
    duration = max(duration, 1)
    frames = []
    for t in range(duration):
        canvas = Image.new("RGB", (width, height), (0, 0, 0))
        for event in events:
            age = t - event["t"]
            dcc_dir = event["cel"]["dirs"][event["dir"]]
            n_frames = len(dcc_dir["frames"])
            if event.get("loop"):
                loop_for = int(event.get("duration") or n_frames)
                if age < 0 or age >= loop_for:
                    continue
                local = (age + int(event.get("loopStart") or 0)) % max(n_frames, 1)
            elif "frame" in event:
                hold = max(1, int(event.get("hold") or 1))
                if age < 0 or age >= hold:
                    continue
                local = event["frame"]
            else:
                local = age
            if local < 0 or local >= n_frames:
                continue
            sprite = dcc_dir["frames"][local]
            canvas = _blit(
                canvas,
                sprite,
                event["x"] - dcc_dir["originX"],
                event["y"] - dcc_dir["originY"],
                additive,
            )
        frames.append(canvas)
    return frames


def load_patterns() -> list[dict]:
    data = json.loads(PATTERNS_PATH.read_text(encoding="utf-8"))
    skills = data.get("skills") if isinstance(data, dict) else data
    if not isinstance(skills, list):
        raise SystemExit(f"{PATTERNS_PATH} must contain a skills array")
    return skills


def select_patterns(skills: list[dict], skill_id: str | None, class_name: str | None) -> list[dict]:
    if skill_id:
        picked = [row for row in skills if row.get("id") == skill_id]
        if not picked:
            print(f"No pattern for skill {skill_id}", file=sys.stderr)
            raise SystemExit(1)
        return picked
    if class_name:
        return [row for row in skills if str(row.get("class", "")).lower() == class_name.lower()]
    return list(skills)


def generate_one(pattern: dict, exe: Path, game_dir: Path, palette: list[tuple[int, int, int]]) -> int:
    skill_id = pattern.get("id")
    if not skill_id:
        print("Pattern missing id", file=sys.stderr)
        return 1
    cel_rows = pattern.get("cels") or []
    if not cel_rows:
        print(f"{skill_id}: no cels", file=sys.stderr)
        return 1
    decoded = []
    for row in cel_rows:
        cel = row.get("file") if isinstance(row, dict) else row
        if not cel:
            print(f"{skill_id}: cel missing file", file=sys.stderr)
            return 1
        try:
            payload = decode_cel_to_cache(str(cel), exe, game_dir, palette)
            if isinstance(row, dict):
                extra = {}
                if row.get("dccDir") is not None:
                    extra["dccDir"] = int(row["dccDir"])
                if row.get("role"):
                    extra["role"] = row["role"]
                if extra:
                    payload = {**payload, **extra}
            decoded.append(payload)
        except SystemExit as e:
            print(f"{skill_id}: skip, missing cel {cel} ({e})", file=sys.stderr)
            return 1
    frames = _render(pattern, decoded)
    fps = int(pattern.get("fps") or FPS_DEFAULT)
    out = GIF_DIR / f"{skill_id}.gif"
    _write_gif(frames, out, fps)
    print(f"Wrote {out} ({len(frames)} frames)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate skill-viz GIFs from patterns.json.")
    parser.add_argument("--skill", help="Generate one skill id.")
    parser.add_argument("--class", dest="class_name", help="Generate every pattern for this class.")
    parser.add_argument("--all", action="store_true", help="Generate every pattern.")
    args = parser.parse_args()
    if not args.skill and not args.class_name and not args.all:
        args.class_name = "Barbarian"

    skills = load_patterns()
    picked = select_patterns(skills, args.skill, None if args.all else args.class_name)
    if not picked:
        print("No matching patterns.", file=sys.stderr)
        return 1

    config = load_config()
    exe = require_path(config, "mpq_editor")
    game_dir = require_path(config, "d2_game_dir")
    pal_path = extract_palette(exe, game_dir)
    palette = load_palette(pal_path)

    failed = 0
    for pattern in picked:
        failed += generate_one(pattern, exe, game_dir, palette)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
