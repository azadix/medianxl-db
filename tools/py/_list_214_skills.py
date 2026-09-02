import json
from pathlib import Path

skills_path = Path("public/tree_data/2_14/skills.json")
skills = json.loads(skills_path.read_text(encoding="utf-8"))
names = sorted({row["displayName"] for row in skills if row.get("displayName")})
for name in names:
    print(name)
print("---")
print(len(names))
