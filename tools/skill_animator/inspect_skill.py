"""Print skill/missile fields for named skills."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'app'))
from engine.gamedata import GameData
from engine import sim

NAMES = sys.argv[1:] or ['Avalanche', 'Arcane Fury']


def game_dir():
    local = os.path.join(os.path.dirname(HERE), 'tools.local.json')
    return json.load(open(local, encoding='utf-8')).get('d2_game_dir')


def main():
    gd = GameData(game_dir(), log=lambda *a: None)
    sim.init(gd)
    want = {n.casefold() for n in NAMES}
    for sid, row in enumerate(gd.SK):
        name = (row.get('skill') or '').strip()
        if name.casefold() not in want:
            continue
        cols = ('srvdofunc', 'cltdofunc', 'srvmissile', 'srvmissilea', 'srvmissileb',
                'cltmissile', 'cltmissilea', 'castoverlay', 'tgtoverlay', 'aura', 'passive')
        print('===', sid, name, '===')
        for c in cols:
            print(' ', c, row.get(c))
        ch = sim.chain(sid)
        print(' chain', ch)
        print(' errors after sim:')
        lay = {'target': (8, -8)}
        s, snaps = sim.simulate(sid, lay, frames=40)
        print('  sim errors', s.errors)
        vis = sum(len(fr) for fr in snaps)
        print('  visible missile snapshots', vis, 'overlays', len(getattr(s, 'overlay_snaps', [[]])[0]) if getattr(s, 'overlay_snaps', None) else 0)
        for mid in ch[:8]:
            r = gd.MIS.get(mid) or {}
            print('  ', mid, 'cel', r.get('CelFile'), 'trans', r.get('Trans'),
                  'srvdo', r.get('pSrvDoFunc'), 'cltdo', r.get('pCltDoFunc'),
                  'path', bool(sim.SPR.mis_path(mid)))


if __name__ == '__main__':
    main()
