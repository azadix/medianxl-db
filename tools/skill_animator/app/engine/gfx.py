"""Sprites, palette and drawing helpers (DCC missile sprites read from the game's MPQs)."""
import math, re
import numpy as np
from .dcc import decode, info as dcc_info

BG = np.array([22, 21, 20], dtype=np.int32)
# D2 direction index -> screen angle (degrees, y down). Measured from IceBolt/Javelin sprites.
A16 = {0: 157, 1: -156, 2: -24, 3: 21, 4: 90, 5: 180, 6: -90, 7: 0, 8: 133, 9: 170, 10: -170, 11: -135,
       12: -43, 13: -9, 14: 9, 15: 45}
RING16 = [4, 8, 0, 9, 5, 10, 1, 11, 6, 12, 2, 13, 7, 14, 3, 15]
JUNK = re.compile(r'debris|indicator|targetmark|nothing|blank', re.I)


def dir_angles(n):
    if n == 1:
        return {0: None}
    if n <= 16:
        return {i: A16[i] for i in range(n) if i in A16}
    a = dict(A16)
    for k in range(16):
        p, q = A16[RING16[k]], A16[RING16[(k + 1) % 16]]
        d = ((q - p + 540) % 360) - 180
        a[16 + k] = p + d / 2
    return a


def angdiff(a, b):
    return abs(((a - b + 540) % 360) - 180)


def nearest_dir(n, ang):
    if n <= 1:
        return 0
    A = dir_angles(n)
    return min(A, key=lambda i: angdiff(A[i], ang))


class Sprites:
    def __init__(self, gd):
        self.gd = gd
        pal = gd.read('data\\global\\palette\\act1\\pal.dat')
        self.PAL = np.array([(pal[i * 3 + 2], pal[i * 3 + 1], pal[i * 3]) for i in range(256)], dtype=np.int32)
        self._spr = {}
        self._path = {}
        self._ndir = {}
        self._unit = {}
        self._ovl = {}

    def mis_path(self, mid):
        if mid in self._path:
            return self._path[mid]
        self._path[mid] = None
        r = self.gd.MIS.get(mid)
        p = None
        cel = (r or {}).get('CelFile', '')
        if cel and cel.lower() != 'null':
            p = 'data\\global\\missiles\\%s.dcc' % cel
            if not self.gd.read(p):
                p = None
        # HitClass 80 is the poison-nova impact class. Median often leaves CelFile
        # null on those bolts (e.g. Angel of Death ml5593); the client still uses
        # the poisonNova missile art, not ProgOverlay (that's the on-hit flash).
        if not p and str((r or {}).get('HitClass') or '') == '80':
            cand = 'data\\global\\missiles\\poisonNova.dcc'
            if self.gd.read(cand):
                p = cand
        # Invisible carriers (Arrowside/Broadside) draw their hit-sub cel.
        if not p:
            for col in ('HitSubMissile1', 'CltHitSubMissile1'):
                sub = (r or {}).get(col)
                if sub and sub != mid:
                    p = self.mis_path(sub)
                    if p:
                        break
        self._path[mid] = p
        return p

    def ndir(self, path):
        if path not in self._ndir:
            self._ndir[path] = dcc_info(self.gd.read(path))[0]
        return self._ndir[path]

    def sprite(self, path, d):
        key = (path, d)
        if key in self._spr:
            return self._spr[key]
        dd = decode(self.gd.read(path), only={d})
        fr = []
        for f in dd[d] or []:
            idx = np.frombuffer(f['pix'], dtype=np.uint8).reshape(f['h'], f['w'])
            fr.append((f['x'], f['y'], self.PAL[idx] * (idx[..., None] > 0), idx > 0))
        if len(self._spr) > 3000:
            self._spr.clear()
        self._spr[key] = fr
        return fr

    def ovl_path(self, oid):
        """Return (dcc path, overlay row) or (None, {})."""
        key = oid
        if key in self._ovl:
            return self._ovl[key]
        rec = {}
        ovl = getattr(self.gd, 'OVL', None) or {}
        if oid in ovl:
            rec = ovl[oid]
        else:
            try:
                rec = ovl.get(int(oid), {})
            except (TypeError, ValueError):
                rec = {}
        p = None
        fn = (rec.get('Filename') or '').replace('/', '\\').strip()
        if fn and fn.lower() != 'null':
            for cand in (
                'data\\global\\overlays\\%s.dcc' % fn,
                'data\\global\\overlays\\%s.dc6' % fn,
            ):
                if self.gd.read(cand):
                    p = cand
                    break
        rec = dict(rec)
        rec['Trans'] = int(rec.get('Trans') or 3)
        rec['Xoffset'] = int(rec.get('Xoffset') or 0)
        rec['Yoffset'] = int(rec.get('Yoffset') or 0)
        rec['AnimRate'] = int(rec.get('AnimRate') or 16)
        self._ovl[key] = (p, rec)
        return p, rec

    def unit(self, kind, token, mode, wclass=None):
        key = (kind, token, mode, wclass)
        if key in self._unit:
            return self._unit[key]
        from .actor import load_unit
        anim = load_unit(self.gd, self.PAL, kind, token, mode, wclass)
        self._unit[key] = anim
        if anim and wclass is None:
            self._unit[(kind, token, mode, anim['wclass'])] = anim
        return anim


def safe(name):
    return re.sub(r'[^A-Za-z0-9 \'\-]', '', name).strip()
