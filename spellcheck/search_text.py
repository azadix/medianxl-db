import sqlite3
import sys
import os
from pathlib import Path

search_text = sys.argv[1] if len(sys.argv) > 1 else 'bein'

# Find database file (could be in root or one level up from py/)
script_dir = Path(__file__).parent
db_path = script_dir.parent / 'skills.sqlite'
if not db_path.exists():
    db_path = script_dir / 'skills.sqlite'

conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

cursor.execute("""
    SELECT id, name, display_name, description, restriction, skill_effect 
    FROM skills 
    WHERE description LIKE ? OR restriction LIKE ? OR skill_effect LIKE ?
""", (f'%{search_text}%', f'%{search_text}%', f'%{search_text}%'))

results = cursor.fetchall()

if results:
    print(f"Found {len(results)} skill(s) containing '{search_text}':\n")
    for r in results:
        print(f"ID: {r[0]}")
        print(f"Name: {r[1]}")
        print(f"Display Name: {r[2]}")
        if r[3] and search_text.lower() in r[3].lower():
            print(f"Description: {r[3]}")
        if r[4] and search_text.lower() in r[4].lower():
            print(f"Restriction: {r[4]}")
        if r[5] and search_text.lower() in r[5].lower():
            print(f"Skill Effect: {r[5]}")
        print("---")
else:
    print(f"No skills found containing '{search_text}'")

conn.close()

