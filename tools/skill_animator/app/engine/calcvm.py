"""Evaluates Median XL's compiled skill formulas (skillscode.bin bytecode, a small stack machine).

For animations: skills referenced by a formula are taken at the same level as the cast skill, and
character stats count as 100 (a mid-game character); things a GIF can't know (synergies, pets...) are 0."""
import json, os, struct

VARS = {int(k): v for k, v in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'calc_vars.json'))).items()}
CALC_COL = {'clc1': 'calc1', 'clc2': 'calc2', 'clc3': 'calc3', 'clc4': 'calc4',
            'ast1': 'aurastatcalc1', 'ast2': 'aurastatcalc2', 'ast3': 'aurastatcalc3',
            'ast4': 'aurastatcalc4', 'ast5': 'aurastatcalc5', 'ast6': 'aurastatcalc6',
            'pst1': 'passivecalc1', 'pst2': 'passivecalc2', 'pst3': 'passivecalc3',
            'pst4': 'passivecalc4', 'pst5': 'passivecalc5', 'len': 'auralencalc', 'rng': 'aurarangecalc'}
STAT_VALUE = 100
ULVL = 120


def tdiv(a, b):
    if b == 0:
        return 0
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b >= 0) else -q


class Calc:
    def __init__(self, gd):
        self.gd = gd

    def _par(self, sid, n):
        try:
            return int(self.gd.SK[sid].get('Param%d' % n) or 0)
        except ValueError:
            return 0

    def var(self, sid, name, lvl, depth):
        p = lambda n: self._par(sid, n)
        if name.startswith('par'):
            return p(int(name[3]))
        if name.startswith('ln'):
            a, b = int(name[2]), int(name[3])
            return p(a) + (lvl - 1) * p(b)
        if name.startswith('dm'):
            a, b = p(int(name[2])), p(int(name[3]))
            return a + tdiv((110 * lvl) * (b - a), 100 * (lvl + 6))
        if name in ('lvl', 'blvl'):
            return lvl
        if name == 'ulvl':
            return ULVL
        if name in CALC_COL:
            return self.column(sid, CALC_COL[name], lvl, 0, depth + 1)
        if name == 'wdm':
            try:
                return tdiv(int(self.gd.SK[sid].get('SrcDam') or 0) * 100, 128)
            except ValueError:
                return 0
        if name in ('edmn', 'edmx'):
            return self.edmg(sid, 'EMin' if name == 'edmn' else 'EMax', lvl, depth)
        if name in ('edln', 'eln'):
            return self.elen(sid, lvl)
        if name == 'toht':
            r = self.gd.SK[sid]
            return int(r.get('ToHit') or 0) + (lvl - 1) * int(r.get('LevToHit') or 0)
        return 0

    def _i(self, r, c):
        try:
            return int(r.get(c) or 0)
        except ValueError:
            return 0

    def elen(self, sid, lvl):
        r = self.gd.SK[sid]
        base = self._i(r, 'ELen')
        steps = [self._i(r, 'ELevLen%d' % i) for i in (1, 2, 3)]
        for L in range(2, lvl + 1):
            base += steps[0] if L <= 8 else steps[1] if L <= 16 else steps[2]
        return base

    def edmg(self, sid, col, lvl, depth):
        r = self.gd.SK[sid]
        v = self._i(r, col)
        lev = 'EMinLev' if col == 'EMin' else 'EMaxLev'
        steps = [self._i(r, '%s%d' % (lev, i)) for i in range(1, 6)]
        for L in range(2, lvl + 1):
            v += steps[0] if L <= 8 else steps[1] if L <= 16 else steps[2] if L <= 22 else steps[3] if L <= 28 else steps[4]
        sym = r.get('EDmgSymPerCalc', '')
        if sym:
            v = tdiv(v * (100 + self.value(sid, sym, lvl, 0, depth + 1)), 100)
        hs = self._i(r, 'HitShift') or 8
        return (v << hs) >> 8

    def column(self, sid, col, lvl, default=0, depth=0):
        """Value of a skills.txt calc column (stored as '#c<offset>') for skill sid at level lvl."""
        v = self.gd.SK[sid].get(col, '')
        return self.value(sid, v, lvl, default, depth)

    def value(self, sid, v, lvl, default=0, depth=0):
        if v is None or v == '':
            return default
        v = str(v)
        if v.startswith('#c'):
            try:
                return self.run(sid, int(v[2:]), lvl, depth)
            except Exception:
                return default
        try:
            return int(v)
        except ValueError:
            return default

    def run(self, sid, off, lvl, depth=0):
        if depth > 8:
            return 0
        code = self.gd.skillcode
        st = []
        i = off
        while i < len(code):
            o = code[i]
            if o == 0:
                break
            if o == 7:
                st.append(code[i + 1]); i += 2; continue
            if o == 8:
                st.append(struct.unpack_from('<H', code, i + 1)[0]); i += 3; continue
            if o == 9:
                st.append(struct.unpack_from('<i', code, i + 1)[0]); i += 5; continue
            if o == 4:
                st.append(self.var(sid, VARS.get(code[i + 1], '?'), lvl, depth)); i += 2; continue
            if o == 1:
                f = code[i + 1]; i += 2
                if f in (0, 1, 2):
                    b, a = st.pop(), st.pop()
                    st.append(min(a, b) if f == 0 else max(a, b) if f == 1 else (a + b) // 2)
                elif f == 3:
                    attr, osid = st.pop(), st.pop()
                    name = VARS.get(attr, '?')
                    if 0 <= osid < len(self.gd.SK) and depth < 6:
                        st.append(self.var(osid, name, lvl, depth + 1))
                    else:
                        st.append(0)
                elif f == 5:
                    st.pop(); st.pop(); st.append(STAT_VALUE)
                elif f == 11:
                    st.pop(); st.pop()           # 3 args, first kept
                elif f == 13:
                    st.pop(); st.pop(); st.append(0)
                else:                            # fn7 / fn10 and other Sigma one-argument lookups
                    st.pop(); st.append(0)
                continue
            if 10 <= o <= 15:
                b, a = st.pop(), st.pop()
                st.append(int([a < b, a > b, a <= b, a >= b, a == b, a != b][o - 10])); i += 1; continue
            if 16 <= o <= 19:
                b, a = st.pop(), st.pop()
                st.append([a + b, a - b, a * b, tdiv(a, b)][o - 16]); i += 1; continue
            if o == 20:
                b, a = st.pop(), st.pop(); st.append(a ** b if 0 <= b < 32 else 0); i += 1; continue
            if o == 21:
                st.append(-st.pop()); i += 1; continue
            if o == 22:
                b, a, c = st.pop(), st.pop(), st.pop()
                st.append(a if c else b); i += 1; continue
            raise ValueError('opcode %d' % o)
        return int(st[-1]) if st else 0
