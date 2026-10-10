"""Re-render every unique skills.json display name into output/, then publish."""
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'app'))

from engine.gamedata import GameData
from engine import sim
from engine.gfx import safe
from publish_previews import DEST_DIR, catalog_by_safe_name, latest_skills_json, main as publish_main


def game_dir():
    local = os.path.join(os.path.dirname(HERE), 'tools.local.json')
    try:
        d = json.load(open(local, encoding='utf-8')).get('d2_game_dir')
        if d:
            return d
    except Exception:
        pass
    return r'C:\Games\median-xl'


BLANK_TAGS = {'buff', 'summon'}


def tags_by_skill_id(skills_path):
    out = {}
    for row in json.load(open(skills_path, encoding='utf-8')):
        sid = str(row.get('id') or '').strip()
        if sid:
            out[sid] = {str(t).casefold() for t in (row.get('tags') or [])}
    return out


def is_blank_kind(skill_id, tags):
    return bool(tags.get(skill_id, ()) & BLANK_TAGS)


def drop_gif(path):
    if os.path.isfile(path):
        os.remove(path)


def main():
    skills_path, folder = latest_skills_json()
    unique, duplicates = catalog_by_safe_name(skills_path)
    tags = tags_by_skill_id(skills_path)
    print('catalog', folder, 'unique names', len(unique), 'dupes', len(duplicates))
    gd = GameData(game_dir(), log=print)
    sim.init(gd)
    osk = {}
    try:
        for o in json.load(open(os.path.join(HERE, 'app', 'engine', 'oskills.json'))):
            osk[safe(o['name']).casefold()] = o['sid']
    except Exception:
        pass
    by_game = {}
    for sid, row in enumerate(gd.SK):
        name = safe(row.get('skill') or '').casefold()
        if name and name not in by_game:
            by_game[name] = sid
    out = os.path.join(HERE, 'output')
    os.makedirs(out, exist_ok=True)

    def say(*parts):
        msg = ' '.join(str(p) for p in parts)
        print(msg.encode('ascii', 'replace').decode('ascii'), flush=True)

    ok = skip = 0
    blank_only = '--blank-kinds' in sys.argv
    force = '--force' in sys.argv
    items = sorted(unique.items())
    for i, (key, skill_id) in enumerate(items, 1):
        blank_kind = is_blank_kind(skill_id, tags)
        if blank_only and not blank_kind:
            continue
        sid = osk.get(key, by_game.get(key))
        path = os.path.join(out, key + '.gif')
        old = DEST_DIR / ('%s.gif' % skill_id)
        if sid is None:
            skip += 1
            drop_gif(path)
            say('[%d/%d] no sid' % (i, len(items)), key)
            continue
        if blank_kind and not sim.has_graphics(sid):
            skip += 1
            drop_gif(path)
            say('[%d/%d] skip buff/summon' % (i, len(items)), key)
            continue
        if (not force and not blank_kind and os.path.isfile(path)
                and (not old.is_file() or os.path.getmtime(path) > os.path.getmtime(old) + 1)):
            ok += 1
            continue
        name = gd.SK[sid].get('skill') or key
        try:
            fr, sc, info = sim.render_skill(sid, lvl=20, max_frames=160)
        except Exception as e:
            skip += 1
            drop_gif(path)
            say('[%d/%d] error' % (i, len(items)), name, e)
            continue
        if fr is None:
            skip += 1
            drop_gif(path)
            say('[%d/%d] blank' % (i, len(items)), name, info.get('why', ''))
            continue
        size = sim.save_gif(fr, path, sc)
        ok += 1
        say('[%d/%d] ok' % (i, len(items)), name, 'kb', size // 1024)
    say('rendered', ok, 'blank/missing', skip)
    publish_main()


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    main()
