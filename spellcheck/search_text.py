import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
if str(_REPO / "py") not in sys.path:
    sys.path.insert(0, str(_REPO / "py"))

from tree_data_loader import resolve_data_dir, load_merged_skills

search_text = sys.argv[1] if len(sys.argv) > 1 else "bein"
data_dir_arg = sys.argv[2] if len(sys.argv) > 2 else None

data_dir = resolve_data_dir(data_dir_arg)
rows = load_merged_skills(data_dir)

needle = search_text.lower()
matches = []

for r in rows:
    desc = (r.get("description") or "").lower()
    rest = (r.get("restriction") or "").lower()
    eff = (r.get("skill_effect") or "").lower()
    if needle in desc or needle in rest or needle in eff:
        matches.append(r)

if matches:
    print(f"Found {len(matches)} skill(s) containing '{search_text}':\n")
    for r in matches:
        nid = r.get("numeric_id")
        name = r.get("name")
        dname = r.get("display_name")
        print(f"ID: {nid}")
        print(f"Name: {name}")
        print(f"Display Name: {dname}")
        full_desc = r.get("description") or ""
        full_rest = r.get("restriction") or ""
        full_eff = r.get("skill_effect") or ""
        if full_desc and needle in full_desc.lower():
            print(f"Description: {full_desc}")
        if full_rest and needle in full_rest.lower():
            print(f"Restriction: {full_rest}")
        if full_eff and needle in full_eff.lower():
            print(f"Skill Effect: {full_eff}")
        print("---")
else:
    print(f"No skills found containing '{search_text}'")
