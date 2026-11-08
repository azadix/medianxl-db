"""Translate game skill formulas to medianxl-db syntax.

Covers truncdiv rewrite, skill() -> [[id]], ?: -> if(), stat()/parN/ln/bl/dm tokens,
and shared paths into skills_full.tsv / skills.json.
"""
import csv
import json
import re
import sys
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
REPO_ROOT = TOOLS_DIR.parent
CONFIG_PATH = TOOLS_DIR / "tools.local.json"
SKILLS_JSON = REPO_ROOT / "public" / "tree_data" / "2_14" / "skills.json"
CHAR_STATS = REPO_ROOT / "public" / "tree_data" / "2_14" / "character_stats.json"
ZERO = ("0", "0x0", "0x00000000")
ETYPE_STATKEY = {
    "fire": "fire_damage",
    "cold": "cold_damage",
    "ltng": "lightning_damage",
    "mag": "magic_damage",
    "pois": "poison_dot",
    "burn": "fire_dot",
    "frze": "cold_damage",
}


def tokenize(s):
    tokens = []
    i = 0
    n = len(s)
    while i < n:
        c = s[i]
        if c.isspace():
            i += 1
        elif c in '+-*/%()':
            tokens.append(c)
            i += 1
        elif c in '<>=':
            if i + 1 < n and s[i:i + 2] in ('<=', '>=', '==', '!='):
                tokens.append(s[i:i + 2])
                i += 2
            else:
                tokens.append(c)
                i += 1
        elif c == '!':
            if i + 1 < n and s[i + 1] == '=':
                tokens.append('!=')
                i += 2
            else:
                tokens.append(c)
                i += 1
        elif c == '{':
            j = s.index('}}', i) + 2
            tokens.append(s[i:j])
            i = j
        elif c.isalpha() or c == '_':
            j = i
            while j < n and (s[j].isalnum() or s[j] == '_'):
                j += 1
            tokens.append(s[i:j])
            i = j
        elif c.isdigit() or c == '.':
            j = i
            while j < n and (s[j].isdigit() or s[j] == '.'):
                j += 1
            tokens.append(s[i:j])
            i = j
        else:
            tokens.append(c)
            i += 1
    return tokens


class _Parser:
    def __init__(self, tokens):
        self.t = tokens
        self.i = 0

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else None

    def next(self):
        x = self.t[self.i]
        self.i += 1
        return x

    def parse(self):
        return self.parse_comparison()

    def parse_comparison(self):
        left = self.parse_additive()
        while self.peek() in ('<', '>', '<=', '>=', '==', '!='):
            op = self.next()
            right = self.parse_additive()
            left = f"({left}{op}{right})"
        return left

    def parse_additive(self):
        left = self.parse_multiplicative()
        while self.peek() in ('+', '-'):
            op = self.next()
            right = self.parse_multiplicative()
            left = f"({left}{op}{right})"
        return left

    def parse_multiplicative(self):
        left = self.parse_unary()
        while self.peek() in ('*', '/', '%'):
            op = self.next()
            right = self.parse_unary()
            if op == '/':
                left = f"truncdiv({left},{right})"
            elif op == '%':
                left = f"({left}%{right})"
            else:
                left = f"({left}*{right})"
        return left

    def parse_unary(self):
        if self.peek() == '-':
            self.next()
            return f"(-{self.parse_unary()})"
        if self.peek() == '+':
            self.next()
            return self.parse_unary()
        return self.parse_primary()

    def parse_primary(self):
        tok = self.peek()
        if tok is None:
            return '0'
        if tok == '(':
            self.next()
            e = self.parse_comparison()
            self.next()  # ')'
            return f"({e})"
        self.next()  # consume the atom (number / var / {{stat}} / func name)
        if self.peek() == '(':
            self.next()  # '('
            args = []
            if self.peek() != ')':
                args.append(self.parse_comparison())
                while self.peek() == ',':
                    self.next()
                    args.append(self.parse_comparison())
            self.next()  # ')'
            return f"{tok}({','.join(args)})"
        return tok


# Game export form, and the site form used in engine/synergy formulas.
SKILL_CALL_RE = re.compile(r'skill\("([^"]+)"#\d+\s*,\s*([a-zA-Z0-9_]+)\)')
SKILL_BRACKET_RE = re.compile(
    r'\[\[[a-zA-Z_][a-zA-Z0-9_]*\]\](?:\.\{\{[a-zA-Z0-9_]+\}\})?'
)


def _protect_cross_skill_refs(formula, transform):
    """Keep skill() / [[id]] tokens intact while rewriting the rest of a formula."""
    placeholders = []

    def protect(m):
        placeholders.append(m.group(0))
        return f"_SKILL{len(placeholders) - 1}_"

    s = SKILL_CALL_RE.sub(protect, formula)
    s = SKILL_BRACKET_RE.sub(protect, s)
    s = transform(s)
    for i, ph in enumerate(placeholders):
        s = s.replace(f"_SKILL{i}_", ph)
    return s


def resolve_skill_id(name, name_to_id):
    """Map a display name / id / slug to a catalog internal id when possible."""
    if not name:
        return None
    if name in name_to_id:
        return name_to_id[name]
    low = name.lower()
    if low in name_to_id:
        return name_to_id[low]
    slug = re.sub(r"[^a-z0-9]+", "_", low).strip("_")
    if slug in name_to_id:
        return name_to_id[slug]
    if slug and re.match(r"[a-zA-Z_][a-zA-Z0-9_]*$", slug):
        return slug
    return None


def translate_skill_refs(formula, name_to_id):
    """skill("Display"#n, stat) -> [[internal_id]] for blvl, else [[internal_id]].{{stat}}."""

    def resolve_id(name):
        return resolve_skill_id(name, name_to_id)

    def repl(m):
        name, stat = m.group(1), m.group(2)
        sid = resolve_id(name)
        if not sid:
            return m.group(0)
        if stat == "blvl":
            return f"[[{sid}]]"
        return f"[[{sid}]].{{{{{stat}}}}}"

    return SKILL_CALL_RE.sub(repl, formula)


def build_name_to_id(skills):
    """Map catalog id and displayName (exact + lower) -> internal id."""
    m = {}
    for s in skills:
        sid = s.get("id")
        if not sid:
            continue
        m[sid] = sid
        dn = (s.get("displayName") or "").strip()
        if dn:
            m[dn] = sid
            m[dn.lower()] = sid
    return m


def translate_division(formula):
    """Rewrite per-step `/` to truncdiv(a, b), matching the game's integer division.

    Cross-skill refs (`skill("Name"#id, stat)` or `[[id]].{{stat}}`) are protected so
    quotes/`#`/`[[` do not break the tokenizer.
    """
    return _protect_cross_skill_refs(
        formula, lambda s: _Parser(tokenize(s)).parse()
    )


def translate_damage_tokens(formula, damage_map):
    """Replace own-damage tokens (edmn/edmx/edln/pdmn/pdmx/enma/exma) with the skill's
    base damage formulas. Tokens inside cross-skill refs are left for the JS resolver."""

    def replace_own(s):
        for tok, repl in damage_map.items():
            s = re.sub(r'\b' + tok + r'\b', f"({repl})", s)
        return s

    return _protect_cross_skill_refs(formula, replace_own)


def _resolve_repo_path(raw):
    path = Path(raw)
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path.resolve()


def skills_full_path():
    if not CONFIG_PATH.is_file():
        print(f"Missing {CONFIG_PATH} (see tools/tools.local.json.example).", file=sys.stderr)
        raise SystemExit(2)
    try:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"Could not read {CONFIG_PATH}: {e}", file=sys.stderr)
        raise SystemExit(2)
    raw = config.get("skills_full_tsv") if isinstance(config, dict) else None
    if not isinstance(raw, str) or not raw.strip():
        print("Set skills_full_tsv in tools/tools.local.json.", file=sys.stderr)
        raise SystemExit(2)
    path = _resolve_repo_path(raw.strip())
    if not path.is_file():
        print(f"skills_full_tsv not found: {path}", file=sys.stderr)
        raise SystemExit(2)
    return path


def load_skills_full():
    by_name = {}
    with open(skills_full_path(), encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            name = (row.get("skill") or "").strip()
            if name:
                by_name[name] = row
    return by_name


def load_stat_id_to_key():
    stats = json.loads(CHAR_STATS.read_text(encoding="utf-8"))
    return {int(s["id"]): str(s["key"]).strip().lower() for s in stats if s.get("key")}


def row_params(row):
    params = {}
    for i in range(1, 9):
        v = (row.get(f"param{i}") or "").strip()
        params[i] = int(v) if v.lstrip("-").isdigit() else None
    return params


def translate_ternary(s):
    """Right-associative ?: -> nested if(cond, a, b)."""
    depth = 0
    qpos = -1
    for i, ch in enumerate(s):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "?" and depth == 0:
            qpos = i
    if qpos < 0:
        return s
    depth = 0
    cpos = -1
    for i in range(qpos + 1, len(s)):
        ch = s[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == ":" and depth == 0:
            cpos = i
            break
    if cpos < 0:
        return s
    cond = s[:qpos].strip()
    a = s[qpos + 1 : cpos].strip()
    b = s[cpos + 1 :].strip()
    return f"if({translate_ternary(cond)},{translate_ternary(a)},{translate_ternary(b)})"


def translate_scaled_tokens(s, params):
    """ln/dn (by lvl), bl/bd (by blvl)."""

    def pv(i):
        v = params.get(i)
        return str(v) if v is not None else "0"

    linear = {
        "ln12": (1, 2, "lvl"), "ln34": (3, 4, "lvl"), "ln56": (5, 6, "lvl"), "ln78": (7, 8, "lvl"),
        "bl12": (1, 2, "blvl"), "bl34": (3, 4, "blvl"), "bl56": (5, 6, "blvl"), "bl78": (7, 8, "blvl"),
        "blz1": (1, 2, "blvl"), "blz2": (3, 4, "blvl"), "blz3": (5, 6, "blvl"), "blz4": (7, 8, "blvl"),
    }
    for tok, (a, b, lv) in linear.items():
        s = re.sub(r"\b" + tok + r"\b", f"({pv(a)}+({lv}-1)*{pv(b)})", s)
    for tok, (a, b) in {"bd12": (1, 2), "bd34": (3, 4), "bd56": (5, 6), "bd78": (7, 8)}.items():
        s = re.sub(
            r"\b" + tok + r"\b",
            f"({pv(a)}+floor(floor(110*blvl/(blvl+6))*({pv(b)}-{pv(a)})/100))",
            s,
        )
    for tok, (a, b) in {"dm12": (1, 2), "dm34": (3, 4), "dm56": (5, 6), "dm78": (7, 8)}.items():
        s = re.sub(
            r"\b" + tok + r"\b",
            f"min({pv(a)}+floor(floor(({pv(b)}-{pv(a)})*110*lvl/(lvl+6))/100),{pv(b)})",
            s,
        )
    return s


def translate_formula(formula, params, stat_id_to_key, damage_map=None, name_to_id=None):
    s = str(formula)
    s = translate_ternary(s)

    def stat_repl(m):
        n = int(m.group(1))
        if n == 12:
            return "ulvl"
        key = stat_id_to_key.get(n)
        return "{{" + key + "}}" if key else "0"

    s = re.sub(r"stat\(\s*(-?\d+)\s*,\s*\d+\s*\)", stat_repl, s)

    def par_repl(m):
        v = params.get(int(m.group(1)))
        return str(v) if v is not None else m.group(0)

    s = re.sub(r"\bpar(\d+)\b", par_repl, s)
    s = translate_scaled_tokens(s, params)
    if damage_map:
        s = translate_damage_tokens(s, damage_map)
    s = translate_division(s)
    if name_to_id:
        s = translate_skill_refs(s, name_to_id)
    return s


def build_damage_map(skill, row):
    """Map edmn/edmx/enma/exma/pdmn/pdmx to this skill's base damage formulas."""
    etype = (row.get("EType") or "").strip().lower()
    ekey = ETYPE_STATKEY.get(etype)
    sc = {c["statKey"]: c for c in skill.get("scalingConstants", [])}
    m = {"edmn": "0", "edmx": "0", "edln": "0", "enma": "0", "exma": "0", "pdmn": "0", "pdmx": "0"}
    if ekey and ekey in sc:
        v0 = sc[ekey].get("value0") or "0"
        v1 = sc[ekey].get("value1") or "0"
        m["edmn"] = v0
        m["edmx"] = v1
        m["enma"] = v0
        m["exma"] = v1
    if "physical_damage" in sc:
        m["pdmn"] = sc["physical_damage"].get("value0") or "0"
        m["pdmx"] = sc["physical_damage"].get("value1") or "0"
    elen = (row.get("ELen") or "").strip()
    if elen.lstrip("-").isdigit():
        m["edln"] = elen
    return m


def write_skills_json(data, backup=True):
    if backup:
        bak = SKILLS_JSON.with_suffix(".json.bak")
        bak.write_text(SKILLS_JSON.read_text(encoding="utf-8"), encoding="utf-8")
    SKILLS_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {SKILLS_JSON}")
