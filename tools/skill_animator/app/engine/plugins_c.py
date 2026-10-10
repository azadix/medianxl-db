"""Missile plug-ins (batch C): srvhit / srvdo and cltdo / clthit handlers.

Missile-creation parameter struct (0x5c bytes; client create uses the same layout):
 +0x00 flags 1=source is (+0x14,+0x18) else unit +0x08 | 2=target = source + (+0x1c,+0x20)
 0x20=target is absolute (+0x1c,+0x20) | neither: target = source, nudged to (+1,+1) when vel!=0
 (so a missile created "without target" flies along subtile (+1,+1)) | 4=vel from +0x28
 (0x10: +0x28 already fixed point, else <<8) | 8=Range += (SubStop-SubStart)*(+0x34) if SubLoop
 0x200=start at anim frame (+0x40), Range -= it | 0x400=remaining frames = dist(target)/vel
 | 0x800=activate frame = (+0x44) | 0x1000=tohit (+0x48)
 0x8000=Range override (+0x4c) | 0x4000 (client) = no light
 +0x04 owner unit +0x08 source unit +0x0c target unit +0x10 missile id
 +0x14/+0x18 source x/y +0x1c/+0x20 target x/y (or offset) +0x28 velocity +0x2c skill +0x30 level
 +0x34 extra sub-loops (flag 8) +0x40 start frame +0x44 activate +0x48 tohit +0x4c range
 +0x54 post-create callback +0x58 callback arg
 Velocity (fixed point) = (Vel + VelLev*lvl/8) << 8, then *75/100. Range = Range + LevRange*lvl.
Create wrappers: flags 1, no target -> dir (+1,+1).
 flags 0x21, source = owner pos + (dx,dy), target (tx,ty) or the owner's current target if 0.
 flags 0x420 (source = owner unit, missile ends exactly at target point).

Missile data +0x28 / +0x2c (ord 11018/10637, 10818/10019) are kept in m.data['d28'] / m.data['d2c'].
Conventions added here (the emulator may honour them; harmless if it does not):
 m.frame animation frame to draw this tick (srvdo/cltdo 5); else draw by age.
 m.data['frame_offset'] start animation at this frame (create flag 0x200 / random start).
 m.data['wander'] charged-bolt random path (hit 45 with sHitPar2): call path_hook(m, sim) every tick.
 mhit_N returning 'pierce' = the game keeps the missile flying (hit return code 4); None = normal.
"""
import math

VS_DEFAULT = 1 / 32.0   # ASSUMED Vel -> subtiles/frame, same as emu.VSCALE. Code evidence (flag 0x400 math:
                        # frames = dist*65536/(vel_fp*16)) suggests Vel*0.75*256/4096 = Vel*3/64 instead.

# 64-dir tables (cos / sin, magnitude 30)
COS64 = [30, 29, 29, 28, 27, 26, 24, 23, 21, 19, 16, 14, 11, 8, 5, 2, 0, -2, -5, -8, -11, -14, -16, -19, -21,
         -23, -24, -26, -27, -28, -29, -29, -30, -29, -29, -28, -27, -26, -24, -23, -21, -19, -16, -14, -11,
         -8, -5, -2, 0, 2, 5, 8, 11, 14, 16, 19, 21, 23, 24, 26, 27, 28, 29, 29]
SIN64 = COS64[48:] + COS64[:48]
# 16-dir coarse ring used by srvhit 2
RING16_X = [0, 1, 2, 2, 2, 2, 2, 1, 0, -1, -2, -2, -2, -2, -2, -1]
RING16_Y = [2, 2, 2, 1, 0, -1, -2, -2, -2, -2, -2, -1, 0, 1, 2, 2]
# burst pattern of srvhit 45
B6D4 = [0, 0, 20, -20, 14, 14, -14, -14]
B6F4 = [20, -20, 0, 0, 14, -14, -14, 14]
B714 = [8, 2, 11, 4, 13, 6, 9]
B730 = [18, 20, 17, 20, 15, 19, 18]
B74C = [-1, -1, 1, 1]
B75C = [-1, 1, 1, -1]


# ---------------------------------------------------------------- helpers
def _n(r, c, d=0):
    try:
        return int(float((r or {}).get(c) or d))
    except (ValueError, TypeError):
        return d


def _d(m):
    if getattr(m, 'data', None) is None:
        m.data = {}
    return m.data


def _sid(m):
    return getattr(m, 'sid', None)


def _lvl(m):
    return getattr(m, 'lvl', 1) or 1


def _vs(sim):
    return getattr(sim, 'vscale', None) or VS_DEFAULT


def _mrow(sim, mid):
    try:
        return sim.mis_row(mid) or {}
    except Exception:
        return {}


def _rand(sim, n):
    """0..n-1, and 0 when n <= 0."""
    return sim.rng.randrange(n) if n > 0 else 0


def _calc(sim, sid, col, default):
    try:
        row = sim.skill_row(sid) or {}
        return sim.calc(sid, row.get(col), default)
    except Exception:
        return default


def _range(sim, mid, lvl, loops=0):
    """Range + LevRange*lvl (+ (SubStop-SubStart)*loops when SubLoop, create flag 8)."""
    r = _mrow(sim, mid)
    v = _n(r, 'Range') + _n(r, 'LevRange') * lvl
    if loops > 0 and _n(r, 'SubLoop'):
        v += (_n(r, 'SubStop') - _n(r, 'SubStart')) * loops
    return max(v, 1)


def _spawn(sim, m, mid, x, y, dx=1.0, dy=1.0, **kw):
    """Create mid. dx,dy = (target - source); (0,0) -> (+1,+1) as the engine does."""
    if not mid:
        return None
    if dx == 0 and dy == 0:
        dx, dy = 1.0, 1.0
    kw.setdefault('sid', _sid(m))
    kw.setdefault('lvl', _lvl(m))
    try:
        return sim.spawn(mid, x, y, dx, dy, **kw)
    except Exception:
        return None


def _new_cell(m):
    """Path flag 8: set when the last path step crossed >= 1 subtile."""
    d = _d(m)
    c = (math.floor(m.x), math.floor(m.y))
    old = d.get('_cell')
    d['_cell'] = c
    return old is not None and old != c


def _force_explode(child, sim):
    """The child explodes (runs its own hit) right away. ASSUMED: it then dies."""
    if child is None:
        return
    h = getattr(child, 'hit', None)
    if callable(h):
        try:
            h()
        except Exception:
            pass
    child.dead = True


def _anim_ctl(m, sim):
    """Shared by srvdo 5 and cltdo 5: SubLoop animation control."""
    d = _d(m)
    ss, se = _n(m.r, 'SubStart'), _n(m.r, 'SubStop')
    f = d.get('af', 0)
    rem = m.range - m.age                       # ord 10737 = remaining frames (+0x10)
    if f == ss - 1:
        f = ss - 1 + _rand(sim, se - ss)        # jump randomly into the loop section
    elif rem == ss:
        f = max(ss - 3, 0)                      # start the outro
    elif rem < ss:
        f = max(f - 2, 0)                       # -2 here +1 by the animator: play intro backwards
    m.frame = f
    d['af'] = f + 1                             # ASSUMED: animator advances one frame per tick


def path_hook(m, sim):
    """Path type 10 (set by srvhit 45 callback, path dist = min(range,77)). ASSUMED shape:
 charged-bolt style random zig-zag - every 3 frames re-pick a heading within +-60 deg of the original."""
    w = _d(m).get('wander')
    if not w or m.age % 3:
        return
    a = w['base'] + math.radians(sim.rng.uniform(-60, 60))
    m.dx, m.dy = math.cos(a), math.sin(a)


# ================================================================ server hit functions
def mhit_36(m, sim, unit=None):
    """srvhit 36. Only when no unit was hit (arg3==0, else returns 0): creates
 HitSubMissile1 at the missile's x/y (same skill/level, no target -> flies (+1,+1)) and copies data +0x28
 (ord 11018 -> 10637). Users: 407 rows, e.g. ml385->ml386, ml757->ml753 (visual usually by clthit 44)."""
    if unit is not None:
        return None
    sub = m.r.get('HitSubMissile1')
    c = _spawn(sim, m, sub, m.x, m.y, 1, 1)
    if c is not None and 'd28' in _d(m):
        _d(c)['d28'] = m.data['d28']
    return None


def mhit_45(m, sim, unit=None):
    """srvhit 45. If sHitPar1 > 0: bursts sHitPar1 HitSubMissile1 from the missile's
 x/y (struct flags 3: target = pos + offset). First offset (14,-14), then a fixed scatter table
 (7 rows of 4 pairs + 1, count <= 40). The outer loop only stops when the
 running count hits exactly 0, so even counts run all 7 rows (sHitPar1 4 -> 12 missiles).
 If sHitPar2 != 0 the create
 callback gives each child path type 10 with distance min(range,255) (charged-bolt wander).
 e.g. ml431 (sHitPar1 10, sHitPar2 1 -> ml433), ml734 (4 x ml1065)."""
    cnt = _n(m.r, 'sHitPar1')
    sub = m.r.get('HitSubMissile1')
    if cnt <= 0 or not sub:
        return None
    offs = [(14, -14)]
    n = cnt - 1
    for j in range(7):
        if n == 0:
            break
        for i in range(4):
            if n <= 0:
                break
            offs.append((B75C[i] * B730[j], B74C[i] * B714[j]))
            offs.append((B75C[i] * B714[j], B74C[i] * B730[j]))
            n -= 2
        offs.append((B6F4[j], B6D4[j]))
        n -= 1
    wander = _n(m.r, 'sHitPar2') != 0
    from . import plugins_a
    for i, (ox, oy) in enumerate(offs):
        c = _spawn(sim, m, sub, m.x, m.y, ox, oy, target=(m.x + ox, m.y + oy))
        if c is not None and wander:
            plugins_a._charged_bolt_setup(sim, c, i)
    return None


def mhit_1(m, sim, unit=None):
    """srvhit 1. Splash damage only: area search around the missile, radius
 sHitPar1 subtiles (if <= 0: skills.txt calc1 of the missile's skill, min 1), callback damage.
 No missiles spawned (the visual is clthit 1). e.g. ml62 (r 4), ml341 (r 8)."""
    _d(m)['splash_radius'] = _n(m.r, 'sHitPar1') or _calc(sim, _sid(m), 'calc1', 1)
    return None


def mhit_21(m, sim, unit=None):
    """srvhit 21. On a unit hit: applies the skill's auratargetstate (+0x82) for auralencalc
 (+0x60) frames. State only, no missiles. e.g. ml219, ml970."""
    return None


def mhit_13(m, sim, unit=None):
    """srvhit 13. Splash damage only: radius sHitPar1 (else skill aurarangecalc, min 1),
 sHitPar2 (else auralencalc) is the effect length. No spawns. e.g. ml96, ml336."""
    _d(m)['splash_radius'] = _n(m.r, 'sHitPar1') or _calc(sim, _sid(m), 'aurarangecalc', 1)
    return None


def mhit_18(m, sim, unit=None):
    """srvhit 18. On hitting an enemy: puts the skill's aurastate
 (+0x80) on it for auralencalc frames. State only, returns 0. e.g. ml149 (Vel 30, Accel -500)."""
    return None


def mhit_2(m, sim, unit=None):
    """srvhit 2. Flags 0x17 (+8 when sHitPar3 > 0, +0x34 =
 sHitPar3 extra sub-loops). Ring 1: 16-dir table indices 0, s, 2s... (s = max(sHitPar2,1)), speed = child
 Param1<<7 raw = Param1/2 Vel units. Ring 2 (only if sHitPar1 != 0): indices 1, 1+s1, ... <= 15, speed child
 Param2/2. Centre = hit unit, else missile. Returns 3. e.g. ml43 (1,2,3)->ml221 (Param1 2, Param2 4)."""
    sub = m.r.get('HitSubMissile1')
    if not sub:
        return None
    cr = _mrow(sim, sub)
    cx, cy = (unit if unit is not None else (m.x, m.y))
    s1, s2, s3 = _n(m.r, 'sHitPar1'), max(_n(m.r, 'sHitPar2'), 1), _n(m.r, 'sHitPar3')
    rng = _range(sim, sub, _lvl(m), s3 if s3 > 0 else 0)
    vs = _vs(sim)
    v1 = _n(cr, 'Param1') / 2.0 * vs
    for k in range(0, 16, s2):
        _spawn(sim, m, sub, cx, cy, RING16_X[k], RING16_Y[k], vel=v1, range=rng)
    if s1:
        v2 = _n(cr, 'Param2') / 2.0 * vs
        for k in range(1, 16, s1):
            _spawn(sim, m, sub, cx, cy, RING16_X[k], RING16_Y[k], vel=v2, range=rng)
    return None


def mhit_5(m, sim, unit=None):
    """srvhit 5. Ring of HitSubMissile1 from the missile (flags 2, source = missile unit):
 every max(sHitPar1,1)-th of the 64 directions (x / y, |v|=30); each child gets
 data +0x28 = x component, +0x2c = y component. Returns 3. e.g. ml4383 (13 -> 5 dirs of ml4384)."""
    sub = m.r.get('HitSubMissile1')
    if not sub:
        return None
    step = max(_n(m.r, 'sHitPar1'), 1)
    for k in range(0, 64, step):
        c = _spawn(sim, m, sub, m.x, m.y, COS64[k], SIN64[k])
        if c is not None:
            _d(c)['d28'], _d(c)['d2c'] = COS64[k], SIN64[k]
    return None


def mhit_12(m, sim, unit=None):
    """srvhit 12 (chain). Only on a unit hit and while data +0x28 (hits left) > 1: search
 radius sHitPar1 (else skill aurarangecalc, min 1) around the missile (callback
 picks the unit with the next-higher unit id after the hit one, wrapping to the lowest; the hit unit is
 excluded), then re-create the SAME missile id at the missile's x/y aimed at that unit's position (flags
 0x21, no homing) with +0x28 = count-1. Returns 3. e.g. ml93/ml267 (Vel 30, Range 25).
 ASSUMED: if the launching skill did not set +0x28, start from the skill's calc1."""
    if unit is None:
        return None
    d = _d(m)
    cnt = d.get('d28')
    if cnt is None:
        cnt = _calc(sim, _sid(m), 'calc1', 3)
    if cnt <= 1:
        return None
    rad = _n(m.r, 'sHitPar1') or max(_calc(sim, _sid(m), 'aurarangecalc', 10), 1)
    tg = list(getattr(sim, 'targets', []))
    try:
        hi = tg.index(tuple(unit))
    except ValueError:
        hi = -1
    cand = [i for i, (tx, ty) in enumerate(tg)
            if i != hi and (tx - m.x) ** 2 + (ty - m.y) ** 2 <= rad * rad]
    if not cand:
        return None
    nxt = [i for i in cand if i > hi]
    i = min(nxt) if nxt else min(cand)
    tx, ty = tg[i]
    c = _spawn(sim, m, m.id, m.x, m.y, tx - m.x, ty - m.y, target=(tx, ty))
    if c is not None:
        _d(c)['d28'] = cnt - 1
    return None


def mhit_6(m, sim, unit=None):
    """srvhit 6. Spawns MONSTER sHitPar1 (monstats row; ids >= monstats count are objects/
 special) at the missile's x/y in mode sHitPar2 (0..15, default 1). No missile.
 e.g. ml1004 (2143), ml1134 (1107)."""
    _d(m)['summon'] = (_n(m.r, 'sHitPar1'), _n(m.r, 'sHitPar2'))
    return None


def mhit_24(m, sim, unit=None):
    """srvhit 24. Splash damage like hit 1 (radius sHitPar1, else calc1).
 No spawns. e.g. ml238, ml4267 (r 12)."""
    _d(m)['splash_radius'] = _n(m.r, 'sHitPar1') or _calc(sim, _sid(m), 'calc1', 1)
    return None


def mhit_4(m, sim, unit=None):
    """srvhit 4. For each HitSubMissile1..4 that is set: create it from the missile (flags 0:
 source = missile unit, no target -> (+1,+1)); if sHitPar1 > 0 the child immediately explodes on the hit
 unit. Returns 3. e.g. ml41 -> ml656, ml4569 -> ml4570."""
    force = _n(m.r, 'sHitPar1') > 0
    for col in ('HitSubMissile1', 'HitSubMissile2', 'HitSubMissile3', 'HitSubMissile4'):
        sub = m.r.get(col)
        if sub:
            c = _spawn(sim, m, sub, m.x, m.y, 1, 1)
            if force:
                _force_explode(c, sim)
    return None


def mhit_10(m, sim, unit=None):
    """srvhit 10 (guided / bone-spirit style, srvdo 7 users ml86, ml329...). Flags in data
 +0x28: bit1 = locked target -> only dies on its path target unit, other units -> code 4 (fly on);
 bit2 = seeking -> while frames remain: die if bit4 else fly on; when none remain re-targets
 the next unit (id order) within Param2 subtiles and flies on. No bits -> normal hit (3).
 ASSUMED: without stored bits, bit1 when m.homing is set."""
    if unit is None:
        return None
    d = _d(m)
    bits = d.get('d28', 1 if getattr(m, 'homing', None) else 0)
    if bits & 1:
        h = getattr(m, 'homing', None)
        return None if (h is not None and tuple(h) == tuple(unit)) else 'pierce'
    if bits & 2:
        if m.range - m.age > 0:
            return None if bits & 4 else 'pierce'
        rad = _n(m.r, 'Param2')
        tg = [t for t in getattr(sim, 'targets', []) if tuple(t) != tuple(unit)
              and (t[0] - m.x) ** 2 + (t[1] - m.y) ** 2 <= rad * rad]
        if tg:
            m.homing = tuple(tg[0])
            return 'pierce'
    return None


# ================================================================ server do functions
def mdo_5(m, sim):
    """srvdo 5. Animation control for looping ground fires (ml67, ml69 firewall): when the anim
 frame (+0x44>>8) reaches SubStart-1 jump to SubStart-1+rand(SubStop-SubStart); when remaining frames ==
 SubStart jump to SubStart-3; while remaining < SubStart step back 2 (plays the intro in reverse). Then
 the normal move. Movement unchanged."""
    _anim_ctl(m, sim)


def mdo_31(m, sim):
    """srvdo 31. Whenever the path crossed a subtile (path flag 8) create SubMissile1 twice from
 the missile (flags 2): target offsets (+0x28,+0x2c) and (-(+0x28),-(+0x2c)). The launching skill
 (skill srvdo 139 / 125) stores +0x28 = -(ty-cy), +0x2c = tx-cx, i.e. the perpendicular of the
 aim -> a wave spraying sideways. e.g. ml517->ml518, Phoenix Wave ml1975. ASSUMED fallback when the skill
 did not store them: perpendicular of the current heading."""
    if not _new_cell(m):
        return None
    d = _d(m)
    a, b = d.get('d28'), d.get('d2c')
    if a is None or b is None:
        a, b = -m.dy * 10, m.dx * 10
    sub = m.r.get('SubMissile1')
    _spawn(sim, m, sub, m.x, m.y, a, b)
    _spawn(sim, m, sub, m.x, m.y, -a, -b)
    return None


def mdo_23(m, sim):
    """srvdo 23. Trail: whenever the path crossed a subtile create SubMissile1 at the missile's
 x/y (flags 1, no target); if Param1 > 0 also flag 8 -> child Range += (SubStop-SubStart)*Param1.
 e.g. ml441 (P1 3)->ml443, ml458->ml457."""
    if not _new_cell(m):
        return None
    sub = m.r.get('SubMissile1')
    p1 = _n(m.r, 'Param1')
    kw = {'range': _range(sim, sub, _lvl(m), p1)} if p1 > 0 else {}
    _spawn(sim, m, sub, m.x, m.y, 1, 1, **kw)
    return None


def mdo_3(m, sim):
    """srvdo 3. If the path has no target unit (path+0x7c) it ORs collision bit 0x40 into the
 room collision map at the missile's subtile (ord 10468), then moves normally. No visual change."""
    return None


def mdo_25(m, sim):
    """srvdo 25. Every calc2 frames (age % calc2 == 0, skills.txt calc2 of the
 missile's skill) create SubMissile1 at x+rand(2(r-1))-(r-1), y+same, r = calc1, unless that subtile
 collides with mask 0x45 (flags 3, no target). e.g. ml461 (Armageddon-style control) -> ml462."""
    sid = _sid(m)
    per = _calc(sim, sid, 'calc2', 0)
    r = _calc(sim, sid, 'calc1', 1)
    _rain(m, sim, per, r, m.r.get('SubMissile1'))
    return None


def _rain(m, sim, per, r, sub):
    if not per or not sub or m.age % per:
        return
    k = r - 1
    ox = _rand(sim, 2 * k) - k
    oy = _rand(sim, 2 * k) - k
    _spawn(sim, m, sub, m.x + ox, m.y + oy, 1, 1)


def mdo_6(m, sim):
    """srvdo 6. Firewall maker: whenever the path crossed a subtile create SubMissile1 at the
 missile's x/y (flags 0x21, target = same point -> (+1,+1)). e.g. ml68->ml69, ml130->ml131."""
    if _new_cell(m):
        _spawn(sim, m, m.r.get('SubMissile1'), m.x, m.y, 1, 1)
    return None


def mdo_8(m, sim):
    """srvdo 8 (Blizzard). k = lvl / max(Param3,1); radius = Param1 + max(k,2);
 period = max(Param2 - k, 3); then as srvdo 25 (collision mask 5): every period frames a
 SubMissile1 at a random point within +-(radius-1). e.g. ml106 (5,8,4) -> ml107 shards."""
    k = _lvl(m) // max(_n(m.r, 'Param3'), 1)
    rad = _n(m.r, 'Param1') + max(k, 2)
    per = max(_n(m.r, 'Param2') - k, 3)
    _rain(m, sim, per, rad, m.r.get('SubMissile1'))
    return None


def mdo_22(m, sim):
    """srvdo 22. While age < 2 store +0x28 = -(pathTargetY - y), +0x2c = pathTargetX - x
 (ord 10983/10764, perpendicular of the flight). Whenever the path crossed a subtile create SubMissile1
 at x/y toward offsets (+0x28,+0x2c) and the negation (flags 0xb; flag 8 with +0x34 = Param1 extra
 sub-loops). e.g. ml431 (P1 3) -> ml432 sideways, ml805."""
    d = _d(m)
    if m.age < 2:
        t = getattr(m, 'target', None)
        if t is None:
            t = (m.x + m.dx * 10, m.y + m.dy * 10)
        d['d28'], d['d2c'] = -(t[1] - m.y), t[0] - m.x
    if not _new_cell(m):
        return None
    sub = m.r.get('SubMissile1')
    a, b = d.get('d28', 0), d.get('d2c', 0)
    p1 = _n(m.r, 'Param1')
    kw = {'range': _range(sim, sub, _lvl(m), p1)} if p1 > 0 else {}
    _spawn(sim, m, sub, m.x, m.y, a, b, **kw)
    _spawn(sim, m, sub, m.x, m.y, -a, -b, **kw)
    return None


def mdo_34(m, sim):
    """srvdo 34. n = number of leading pairs (SubMissile i set and Param i+1 > 0), i=1..3.
 Once age >= Param1: pick i = rand(n); if age % Param(i+1) == 0 create SubMissile i from the missile
 (flags 0) and make it explode at once. Then srvdo 3.
 e.g. ml546 (P1 25; ml654 every 3, ml655 every 45)."""
    pairs = []
    for i in range(1, 4):
        sub = m.r.get('SubMissile%d' % i)
        p = _n(m.r, 'Param%d' % (i + 1))
        if not sub or p <= 0:
            break
        pairs.append((sub, p))
    if not pairs or m.age < _n(m.r, 'Param1'):
        return None
    sub, p = pairs[_rand(sim, len(pairs))]
    if m.age % p == 0:
        _force_explode(_spawn(sim, m, sub, m.x, m.y, 1, 1), sim)
    return None


# ================================================================ client do functions
def cdo_8(m, sim):
    """cltdo 8. After InitSteps frames, whenever the path crossed a subtile create
 CltSubMissile1 at x/y (flags 1). Create callback: child heading = parent heading
 (ord 10042 -> 10706), random start frame rand(child AnimLen), and if the child's CltParam2 > 0 a
 vertical offset rand(P2)-P2/2 (stored <<11 in gfx info +0x30/+0xc; px scale ASSUMED 0.5/unit).
 e.g. ml93 chain lightning -> ml99 (CltParam2 16)."""
    if m.age < _n(m.r, 'InitSteps') or not _new_cell(m):
        return None
    sub = m.r.get('CltSubMissile1')
    c = _spawn(sim, m, sub, m.x, m.y, m.dx, m.dy)
    if c is None:
        return None
    cr = _mrow(sim, sub)
    _d(c)['frame_offset'] = _rand(sim, _n(cr, 'AnimLen'))
    p2 = _n(cr, 'CltParam2')
    if p2 > 0:
        c.z = getattr(c, 'z', 0) + (_rand(sim, p2) - int(p2 / 2)) * 0.5
    return None


def cdo_5(m, sim):
    """cltdo 5. Client copy of srvdo 5's SubLoop animation control (clamped at 0)."""
    _anim_ctl(m, sim)


def cdo_52(m, sim):
    """cltdo 52. Client copy of srvdo 31: on each subtile crossed, CltSubMissile1 toward
 (+0x28,+0x2c) and the negation (sideways wave). e.g. ml517->ml518, ml1102->ml1104."""
    if not _new_cell(m):
        return None
    d = _d(m)
    a, b = d.get('d28'), d.get('d2c')
    if a is None or b is None:
        a, b = -m.dy * 10, m.dx * 10
    sub = m.r.get('CltSubMissile1')
    _spawn(sim, m, sub, m.x, m.y, a, b)
    _spawn(sim, m, sub, m.x, m.y, -a, -b)
    return None


def cdo_6(m, sim):
    """cltdo 6. Client firewall maker: on each subtile crossed create one of CltSubMissile1/2/3
 at x/y (flags 0x21|0x8000: Range forced to CltSubMissile1's Range): with Clt2 and Clt3 rand(3) -> 0:Clt2
 1:Clt3 2:Clt1; with only Clt2 rand(2) -> 0:Clt2 else Clt1. Only 1 in CltParam1 pieces keeps its light
 (flag 0x4000 = no light). e.g. ml68 (4) -> ml69 / ml104 / ml105."""
    if not _new_cell(m):
        return None
    c1, c2, c3 = (m.r.get('CltSubMissile%d' % i) for i in (1, 2, 3))
    if not c1:
        return None
    pick = c1
    if c2:
        if c3:
            pick = (c2, c3, c1)[_rand(sim, 3)]
        elif _rand(sim, 2) == 0:
            pick = c2
    rng = _n(_mrow(sim, c1), 'Range')
    kw = {'range': rng} if rng else {}
    _spawn(sim, m, pick, m.x, m.y, 1, 1, **kw)
    return None


def cdo_18(m, sim):
    """cltdo 18. After InitSteps, on each subtile crossed create CltSubMissile1 at x/y (flags 1)
 and give it the parent's heading (ord 10042 -> 10706); attached to the parent's light list.
 e.g. ml192 -> ml248, ml2618 -> ml2619 (Vel 4, drifts forward)."""
    if m.age < _n(m.r, 'InitSteps') or not _new_cell(m):
        return None
    _spawn(sim, m, m.r.get('CltSubMissile1'), m.x, m.y, m.dx, m.dy)
    return None


def cdo_2(m, sim):
    """cltdo 2. While the missile is inside the visible screen rect its remaining frames are
 reset to 128 every tick (never expires); off screen it is removed. e.g. ml18-ml21 (Vel 3-4, Range 128).
 ASSUMED always on screen."""
    m.range = m.age + 128


def cdo_4(m, sim):
    """cltdo 4. On the last
 frame (remaining == 0), else with chance 1/CltParam1 per frame: create CltParam2 CltSubMissile1 from the
 missile (flags 0x20) aimed at x+ox, y+oy where o = rand(2S)-S then pushed out by S (|o| in S..2S),
 S = CltParam3. e.g. ml39 (24,1,6) -> ml141 sparks (Vel 1). ASSUMED last frame = age == range-1."""
    p1, cnt, s = _n(m.r, 'CltParam1'), _n(m.r, 'CltParam2'), _n(m.r, 'CltParam3')
    sub = m.r.get('CltSubMissile1')
    if not sub:
        return None
    if (m.range - m.age) > 1 and _rand(sim, p1) != 0:
        return None
    for _ in range(max(cnt, 0)):
        ox = _rand(sim, 2 * s) - s
        oy = _rand(sim, 2 * s) - s
        ox += s if ox >= 0 else -s
        oy += s if oy >= 0 else -s
        _spawn(sim, m, sub, m.x, m.y, ox, oy, target=(m.x + ox, m.y + oy))
    return None


# ================================================================ client hit functions
def chit_14(m, sim, unit=None):
    """clthit 14. Ice/explode pair used with silent srvhit 13 (Avalanche ml1980, Frozen Orb).
 Creates CltHitSubMissile1 and CltHitSubMissile2 at the missile (FreezeExplodeCenter + Ejecta)."""
    for col in ('CltHitSubMissile1', 'CltHitSubMissile2', 'CltHitSubMissile3', 'CltHitSubMissile4'):
        sub = m.r.get(col)
        if sub:
            _spawn(sim, m, sub, m.x, m.y, m.dx, m.dy)
    return None


def chit_10(m, sim, unit=None):
    """clthit 10. On a unit hit, if ProgOverlay is set, plays that overlay on the hit unit.
 No missile. e.g. ml56, ml90, ml99."""
    if unit is not None and m.r.get('ProgOverlay'):
        _d(m)['overlay_on_hit'] = (m.r.get('ProgOverlay'), tuple(unit))
    return None


def chit_44(m, sim, unit=None):
    """clthit 44. Only when no unit was hit: create CltHitSubMissile1 at the missile (flags 0x20),
 then give it the parent's heading (ord 10042 -> 10706) and copy data +0x28.
 Client side of srvhit 36 (e.g. ml385 -> ml386)."""
    if unit is not None:
        return None
    c = _spawn(sim, m, m.r.get('CltHitSubMissile1'), m.x, m.y, m.dx, m.dy)
    if c is not None and 'd28' in _d(m):
        _d(c)['d28'] = m.data['d28']
    return None


def chit_1(m, sim, unit=None):
    """clthit 1. If CltHitSubMissile1 is set (only checked), fill a disc of radius
 cHitPar1 subtiles around the missile with the HARD-CODED missile 0x109 = ml265: for dy, dx in -r.r
 (step 1) with dx*dx+dy*dy <= r*r, keep a cell only if rand(cHitPar2) == 0 (cHitPar2 <= 0: always),
 flags 0x201: start frame rand(child RandStart), Range reduced by it. e.g. ml62 (3,1): 29 flames."""
    if not m.r.get('CltHitSubMissile1'):
        return None
    r, skip = _n(m.r, 'cHitPar1'), _n(m.r, 'cHitPar2')
    rs = _n(_mrow(sim, 'ml265'), 'RandStart')
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r:
                continue
            if skip > 0 and _rand(sim, skip) != 0:
                continue
            off = _rand(sim, rs) if rs else 0
            kw = {'range': max(_range(sim, 'ml265', _lvl(m)) - off, 1)} if off else {}
            c = _spawn(sim, m, 'ml265', m.x + dx, m.y + dy, 1, 1, **kw)
            if c is not None and off:
                _d(c)['frame_offset'] = off
    return None
