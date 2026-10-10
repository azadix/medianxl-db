"""Render named skills into output/ and copy into public/skill-previews."""
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'app'))
from engine.gamedata import GameData
from engine import sim
from engine.gfx import safe
from publish_previews import DEST_DIR, catalog_by_safe_name, latest_skills_json


def game_dir():
    local = os.path.join(os.path.dirname(HERE), 'tools.local.json')
    return json.load(open(local, encoding='utf-8'))['d2_game_dir']


def main():
    names = [n.casefold() for n in sys.argv[1:]]
    if not names:
        raise SystemExit('usage: render_one.py Skill Name')
    gd = GameData(game_dir(), log=print)
    sim.init(gd)
    skills_path, _folder = latest_skills_json()
    unique, _dup = catalog_by_safe_name(skills_path)
    out = os.path.join(HERE, 'output')
    os.makedirs(out, exist_ok=True)
    DEST_DIR.mkdir(parents=True, exist_ok=True)
    for sid, row in enumerate(gd.SK):
        name = (row.get('skill') or '').strip()
        if name.casefold() not in names:
            continue
        key = safe(name).casefold()
        fr, sc, info = sim.render_skill(sid, lvl=20, max_frames=160)
        if fr is None:
            print('blank', sid, name, info)
            continue
        path = os.path.join(out, key + '.gif')
        size = sim.save_gif(fr, path, sc)
        skill_id = unique.get(key)
        if skill_id:
            shutil.copy2(path, DEST_DIR / ('%s.gif' % skill_id))
        print('ok', sid, name, 'kb', size // 1024, 'frames', info.get('frames'))


if __name__ == '__main__':
    main()
