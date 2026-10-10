"""Dump a mid-frame of spot-check GIFs and print missile Trans for those skills."""
import json
import os
import sys

from PIL import Image, ImageSequence

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'app'))
from engine.gamedata import GameData
from engine import sim

OUT = os.path.join(HERE, 'output')


def main():
    for name in os.listdir(OUT):
        if not name.endswith('.gif'):
            continue
        path = os.path.join(OUT, name)
        im = Image.open(path)
        frames = [f.copy() for f in ImageSequence.Iterator(im)]
        mid = frames[min(8, len(frames) - 1)]
        dest = os.path.join(OUT, name.replace('.gif', '_f8.png'))
        mid.save(dest)
        print(name, 'nframes', len(frames), 'size', os.path.getsize(path), 'wrote', dest)

    local = os.path.join(os.path.dirname(HERE), 'tools.local.json')
    d = json.load(open(local, encoding='utf-8')).get('d2_game_dir')
    gd = GameData(d, log=lambda *a: None)
    sim.init(gd)
    for sid, row in enumerate(gd.SK):
        if (row.get('skill') or '') in ('Spike Nova', 'Phoenix Wave'):
            print('skill', sid, row.get('skill'), 'srvdo', row.get('srvdofunc'),
                  'castoverlay', row.get('castoverlay'),
                  'a', row.get('srvmissilea'))
            mid = row.get('srvmissilea')
            if mid:
                r = gd.MIS.get(mid) or {}
                print('  missile', mid, 'Cel', r.get('CelFile'), 'Trans', r.get('Trans'),
                      'Vel', r.get('Vel'), 'Range', r.get('Range'), 'srvdo', r.get('pSrvDoFunc'))


if __name__ == '__main__':
    main()
