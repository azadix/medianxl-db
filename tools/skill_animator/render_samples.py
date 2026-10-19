"""Render the plan's sample skills into output/samples/."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'app'))

from engine.gamedata import GameData
from engine import sim
from engine.gfx import safe

NAMES = (
    'Eviscerate',
    'Arcane Torrent',
    'Frozen Orb',
    'Psionic Storm',
    'Mind Flay',
    'Tremor',
    'Firewall',
    'Meteor Shower',
    'Phoenix Wave',
    'Spike Nova',
)


def game_dir():
    local = os.path.join(os.path.dirname(HERE), 'tools.local.json')
    try:
        d = json.load(open(local, encoding='utf-8')).get('d2_game_dir')
        if d:
            return d
    except Exception:
        pass
    return r'C:\Games\median-xl'


def main():
    gd = GameData(game_dir(), log=print)
    sim.init(gd)
    out = os.path.join(HERE, 'output', 'samples')
    os.makedirs(out, exist_ok=True)
    want = {n.casefold(): n for n in NAMES}
    found = {}
    for sid, row in enumerate(gd.SK):
        name = (row.get('skill') or '').strip()
        key = name.casefold()
        if key in want and key not in found:
            found[key] = (sid, name)
    ok = fail = 0
    for label in NAMES:
        hit = found.get(label.casefold())
        if not hit:
            print('missing', label)
            fail += 1
            continue
        sid, name = hit
        fr, sc, info = sim.render_skill(sid, lvl=20, max_frames=120)
        if fr is None:
            print('blank', name, info)
            fail += 1
            continue
        path = os.path.join(out, safe(name) + '.gif')
        size = sim.save_gif(fr, path, sc)
        print('ok', name, 'sid', sid, 'kb', size // 1024, 'frames', info.get('frames'), 'err', info.get('errors'))
        ok += 1
    print('done ok=%d fail=%d' % (ok, fail))


if __name__ == '__main__':
    main()
