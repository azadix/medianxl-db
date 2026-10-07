"""Reads everything the animator needs straight from a Median XL install:
the MPQ archives (sprites, palette), Median's compiled tables (skills.bin, missiles.bin, skilldesc.bin,
skillscode.bin from medianxl-YmludGJsdHh0.mpq) and the string tables for skill names."""
import os, glob, json, struct
from . import mpq as _mpq

HERE = os.path.dirname(os.path.abspath(__file__))


class GameData:
    def __init__(self, game_dir, log=print):
        self.dir = game_dir
        names = sorted(glob.glob(os.path.join(game_dir, 'medianxl-*.mpq')))
        names += [os.path.join(game_dir, n) for n in ('patch_d2.mpq', 'd2exp.mpq', 'd2char.mpq', 'd2data.mpq')]
        self.arch = []
        for p in names:
            if os.path.exists(p):
                try:
                    self.arch.append(_mpq.MPQ(p))
                except Exception as e:
                    log('skipped %s: %s' % (os.path.basename(p), e))
        if not any(os.path.basename(a._fh.name).lower().startswith('medianxl-ymludgjsdhh0') for a in self.arch):
            raise RuntimeError('medianxl-YmludGJsdHh0.mpq (the game tables) was not found in %s' % game_dir)
        self._cache = {}
        log('opened %d MPQ archives' % len(self.arch))
        self.load_tables()

    def read(self, path):
        path = path.replace('/', '\\')
        if path in self._cache:
            return self._cache[path]
        r = None
        for a in self.arch:
            try:
                r = a.read(path)
            except Exception:
                r = None
            if r:
                break
        if len(self._cache) < 4000:
            self._cache[path] = r
        return r

    def excel(self, name):
        d = self.read('data\\global\\excel\\' + name)
        if d is None:
            raise RuntimeError('missing table ' + name)
        return d

    # ------------------------------------------------------------------ tables
    def load_tables(self):
        self.skillcode = self.excel('skillscode.bin')
        self.MIS = self._missiles()
        self.SK = self._skills()
        self.names = self._skill_names()
        for sid, r in enumerate(self.SK):
            r['skill'] = self.names.get(sid) or 'sk%d' % sid

    def _missiles(self):
        d = self.excel('missiles.bin')
        n = struct.unpack_from('<I', d)[0]
        rs = (len(d) - 4) // n
        off = json.load(open(os.path.join(HERE, 'mis_off.json')))
        off.setdefault('SubMissile2', 26)
        off.setdefault('pCltHitFunc', 10)
        words = {'pCltDoFunc', 'pCltHitFunc', 'pSrvDoFunc', 'pSrvHitFunc', 'pSrvDmgFunc', 'Range', 'LevRange',
                 'MaxVel', 'Accel', 'animrate', 'Skill', 'TravelSound', 'ProgSound', 'ProgOverlay'}
        refs = {k for k in off if 'Missile' in k}
        signed_words = {'xoffset', 'yoffset', 'zoffset', 'Accel'}
        dwords = {k for k in off if k.startswith(('Param', 'CltParam', 'sHitPar', 'cHitPar', 'dParam', 'MinDam', 'MaxDam',
                                                    'MinLev', 'MaxLev', 'EMin', 'EMax', 'MinE', 'MaxE', 'ELen', 'ELev'))}
        dwords |= {'AnimLen', 'RandStart', 'ResultFlags', 'HitFlags', 'DmgSymPerCalc', 'EDmgSymPerCalc', 'EType'}
        out = {}
        for i in range(n):
            b = 4 + i * rs
            r = {'Missile': 'ml%d' % i}
            for k, o in off.items():
                p = b + o
                if k == 'CelFile':
                    s = d[p:p + 64].split(b'\0')[0].decode('latin-1')
                    r[k] = s
                elif k in refs:
                    v = struct.unpack_from('<H', d, p)[0]
                    r[k] = '' if v == 0xFFFF else 'ml%d' % v
                elif k in signed_words:
                    r[k] = str(struct.unpack_from('<h', d, p)[0])
                elif k in words:
                    r[k] = str(struct.unpack_from('<H', d, p)[0])
                elif k in dwords:
                    r[k] = str(struct.unpack_from('<i', d, p)[0])
                else:
                    r[k] = str(d[p])
            r['AnimRate'] = r.get('animrate', '')
            out[r['Missile']] = r
        return out

    def _skills(self):
        d = self.excel('skills.bin')
        n = struct.unpack_from('<I', d)[0]
        rs = (len(d) - 4) // n
        F = json.load(open(os.path.join(HERE, 'skill_fields.json')))
        rows = []
        for i in range(n):
            b = 4 + i * rs
            r = {'Id': str(i)}
            for k, (t, bit, o, _lk) in F.items():
                if t is None or o is None or not o[0].isdigit():
                    continue
                o = int(o, 0)
                p = b + o
                if p + 4 > b + rs:
                    continue
                if t == '2':
                    v = str(struct.unpack_from('<i', d, p)[0])
                elif t == '3':
                    v = str(struct.unpack_from('<h', d, p)[0])
                elif t in ('4', '0xd'):
                    v = str(d[p])
                elif t == '0x1a':
                    v = '1' if struct.unpack_from('<I', d, p)[0] >> int(bit, 0) & 1 else ''
                elif t == '0x14':
                    w = struct.unpack_from('<H', d, p)[0]
                    if 'missile' in k:
                        v = '' if w == 0xFFFF else 'ml%d' % w
                    else:
                        v = '' if w == 0xFFFF else str(w)
                elif t == '0x19':
                    w = struct.unpack_from('<i', d, p)[0]
                    v = '#c%d' % w if 0 <= w < len(self.skillcode) else ''
                else:
                    continue
                r[k] = v
            rows.append(r)
        return rows

    # ------------------------------------------------------------------ strings
    def _tbl(self, path):
        d = self.read(path)
        if not d:
            return []
        crc, num, hsize = struct.unpack_from('<HHI', d, 0)
        idx = struct.unpack_from('<%dH' % num, d, 21)
        base = 21 + num * 2
        out = []
        for i in idx:
            nb = base + i * 17
            used, _, _, koff, soff, ln = struct.unpack_from('<BHIIIH', d, nb)
            out.append(d[soff:soff + ln].split(b'\0')[0].decode('latin-1') if used else '')
        return out

    def string(self, idx):
        if not hasattr(self, '_str'):
            L = 'data\\local\\lng\\eng\\'
            self._str = (self._tbl(L + 'string.tbl'), self._tbl(L + 'patchstring.tbl'), self._tbl(L + 'expansionstring.tbl'))
        t, i = (2, idx - 20000) if idx >= 20000 else (1, idx - 10000) if idx >= 10000 else (0, idx)
        tb = self._str[t]
        return tb[i] if 0 <= i < len(tb) else ''

    def _skill_names(self):
        d = self.excel('skilldesc.bin')
        n = struct.unpack_from('<I', d)[0]
        rs = (len(d) - 4) // n
        names = {}
        sd_name = {}
        for i in range(n):
            w = struct.unpack_from('<H', d, 4 + i * rs + 8)[0]   # 'str name' (skilldesc +8)
            sd_name[i] = w
        for sid, r in enumerate(self.SK):
            sd = r.get('skilldesc')
            if sd and sd.isdigit() and int(sd) in sd_name:
                s = self.string(sd_name[int(sd)]).strip()
                if s:
                    names[sid] = s.replace('\\n', ' ').split('\n')[0]
        return names
