"""
Scan repo JS for exported symbols and count rough usage (word-boundary matches).
Excludes icons/ per project rules. Run from repo root: python py/analyze_export_usage.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# export function foo / async function foo
RE_EXPORT_FN = re.compile(
    r"^export\s+(?:async\s+)?function\s+(\w+)\s*\(",
    re.MULTILINE,
)
RE_EXPORT_CONST_FN = re.compile(
    r"^export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(",
    re.MULTILINE,
)
RE_EXPORT_CONST = re.compile(r"^export\s+const\s+(\w+)\s*=", re.MULTILINE)
RE_EXPORT_CLASS = re.compile(r"^export\s+class\s+(\w+)", re.MULTILINE)
RE_EXPORT_DEFAULT_FN = re.compile(
    r"^export\s+default\s+(?:async\s+)?function\s+(\w+)", re.MULTILINE
)


def skip_path(p: Path) -> bool:
    parts = set(p.parts)
    if "icons" in parts:
        return True
    if "node_modules" in parts:
        return True
    return False


def parse_brace_exports(line: str) -> list[str]:
    """export { a, b as c } from 'x' or export { a, b }"""
    m = re.search(r"export\s*\{([^}]+)\}", line)
    if not m:
        return []
    out = []
    for chunk in m.group(1).split(","):
        chunk = chunk.strip()
        if not chunk or chunk.startswith("//"):
            continue
        if " as " in chunk:
            chunk = chunk.split(" as ")[-1].strip()
        else:
            chunk = chunk.split()[0].strip()
        if chunk and re.match(r"^\w+$", chunk):
            out.append(chunk)
    return out


def collect_exports() -> dict[str, str]:
    """symbol -> defining file relative path"""
    defined: dict[str, str] = {}
    js_files = [p for p in ROOT.rglob("*.js") if not skip_path(p)]

    for path in sorted(js_files):
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()

        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith("//"):
                continue
            if "export {" in stripped and "}" in stripped:
                for name in parse_brace_exports(stripped):
                    if name not in defined:
                        defined[name] = rel

        for pattern in (
            RE_EXPORT_FN,
            RE_EXPORT_CONST_FN,
            RE_EXPORT_CLASS,
            RE_EXPORT_DEFAULT_FN,
        ):
            for m in pattern.finditer(text):
                name = m.group(1)
                if name not in defined:
                    defined[name] = rel

        for m in RE_EXPORT_CONST.finditer(text):
            name = m.group(1)
            if name in ("SkillDB",):  # script.js object, not a function
                pass
            if name not in defined:
                defined[name] = rel

    return defined


def count_symbol_refs(symbol: str, files: list[Path]) -> int:
    """Word-boundary count of symbol across files (rough)."""
    boundary = re.compile(rf"\b{re.escape(symbol)}\b")
    total = 0
    for path in files:
        text = path.read_text(encoding="utf-8", errors="replace")
        total += len(boundary.findall(text))
    return total


def main() -> None:
    defined = collect_exports()
    js_files = [p for p in ROOT.rglob("*.js") if not skip_path(p)]

    # Ignore very short / noisy export names
    noise = {
        "default",
        "null",
        "true",
        "false",
        "window",
        "document",
        "console",
        "Object",
        "Array",
        "Map",
        "Set",
        "Promise",
        "Error",
        "Event",
    }

    rows: list[tuple[int, str, str]] = []
    for sym, src in sorted(defined.items(), key=lambda x: x[0].lower()):
        if len(sym) < 3 or sym in noise:
            continue
        n = count_symbol_refs(sym, js_files)
        rows.append((n, sym, src))

    rows.sort(key=lambda x: (x[0], x[1].lower()))

    print("Least-used exports (word-boundary occurrence count across *.js, icons/ excluded)")
    print("Count includes definition site(s); low count often means internal-only or dead export.\n")
    print(f"{'count':>6}  {'symbol':<40}  defined_in")
    print("-" * 90)

    for n, sym, src in rows[:80]:
        print(f"{n:6}  {sym:<40}  {src}")

    if len(rows) > 80:
        print(f"\n... {len(rows) - 80} more symbols (all {len(rows)} exports analyzed)")

    # Summary buckets
    print("\n-- Buckets --")
    for label, lo, hi in (
        ("1 (definition only?)", 1, 1),
        ("2", 2, 2),
        ("3-5", 3, 5),
        ("6-10", 6, 10),
        ("11+", 11, 10**9),
    ):
        c = sum(1 for n, _, _ in rows if lo <= n <= hi)
        print(f"  {label}: {c} symbols")

    return 0


if __name__ == "__main__":
    sys.exit(main())
