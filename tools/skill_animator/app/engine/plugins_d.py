"""Median XL Sigma skill srvdo 153-162/165-167/171 and missile srvhit 69/71/72/73/77.

Sigma uses its own srvdo/srvhit tables (extra ids 153..171 plus some vanilla overrides).

Missile-create params (dwords): [0] flags, [1] owner, [2] source unit (position when flag 1 is
clear), [3] target unit, [4] missile id, [5],[6] x,y (flag 1), [7],[8] target x,y (flag 0x20; with flag 2
they are an offset from the source position), [0xb] skill, [0xc] level, [0x11] Activate override
(flag 0x800), [0x13] range override (flag 0x8000), [0x15] init callback, [0x16] callback arg.
Flag 0x400: remaining frames = (dist << 16) / (speed << 4), where speed = ((Vel + VelLev*lvl/8) << 8)
* 75/100. The missile keeps its normal speed and its life is cut short so it dies at the target point.
Speed is speed/4096 = Vel*3/64 subtiles per frame.
"""
import math

MASK32 = 0xffffffff


def _i(r, c, d=0):
    try:
        return int(float((r or {}).get(c) or d))
    except (ValueError, TypeError):
        return d


def _calc(sim, sid, row, col, default=0):
    v = (row or {}).get(col)
    if v in (None, ''):
        return default
    try:
        return int(sim.calc(sid, v, default))
    except Exception:
        return default


def _lvl(sim, m=None):
    return getattr(m, 'lvl', None) or getattr(sim, 'lvl', 1) or 1


_RX = [30, 29, 29, 28, 27, 26, 24, 23, 21, 19, 16, 14, 11, 8, 5, 2, 0, -2, -5, -8, -11, -14, -16,
       -19, -21, -23, -24, -26, -27, -28, -29, -29, -30, -29, -29, -28, -27, -26, -24, -23, -21, -19,
       -16, -14, -11, -8, -5, -2, 0, 2, 5, 8, 11, 14, 16, 19, 21, 23, 24, 26, 27, 28, 29, 29]


def _ring_int(k):
    """The 64-entry X/Y offset tables (magnitude 30); Y[k] = X[k-16]."""
    return _RX[k % 64], _RX[(k - 16) % 64]


def _speed_fixed(row, lvl):
    """speed = (((VelLev*lvl) >> 3) + Vel) << 8, then *75/100 (C integer division)."""
    v = ((_i(row, 'VelLev') * lvl) >> 3) + _i(row, 'Vel')
    v <<= 8
    return int(v * 75 / 100)


def _trunc_div(a, b):
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q


# ---------------------------------------------------------------------------------------------
# skill srvdo
# ---------------------------------------------------------------------------------------------
def skill_do_157(sim, sid, row, cx, cy, tx, ty):
    """srvdo 157 'lobbed volley' (Catapult Shot, Diseased Cattle, Overkill).

 n = calc(prgcalc1) (skill record +0x38)
 spread = calc(aurarangecalc) (skill record +0x64)
 missile = srvmissilea (+0x48)
 if n > 1 and spread >= 2:
 repeat n times: point = target + (rand(2*spread) - spread, rand(2*spread) - spread)
 (two separate calls: x first, then y);
 skipped if dist^2(caster, point) < 4 (D2Common 10769 = squared distance)
 else: one missile at the target point.
 Each: flags 0x420 -> starts at the caster, aimed at the point (0x20), and with flag 0x400 its
 remaining life is set so it dies (AlwaysExplode) on the point: frames = dist*4096/speed.
 ASSUMED: rand(n) = 0..n-1 uniform (unit seed); distance in 0x400 = Euclidean subtiles (D2Common
 10080 uses the path's subtile coords; exact metric not read).
 """
    mid = row.get('srvmissilea')
    if not mid:
        return
    n = _calc(sim, sid, row, 'prgcalc1', 1)
    spread = _calc(sim, sid, row, 'aurarangecalc', 0)
    if n < 1:
        return
    pts = []
    if n > 1 and spread >= 2:
        for _ in range(n):
            px = sim.rng.randrange(2 * spread) - spread + tx
            py = sim.rng.randrange(2 * spread) - spread + ty
            if (px - cx) ** 2 + (py - cy) ** 2 >= 4:
                pts.append((px, py))
    else:
        pts.append((tx, ty))
    mrow = sim.mis_row(mid)
    lvl = _lvl(sim)
    spd = max(_speed_fixed(mrow, lvl), 1)
    for px, py in pts:
        dx, dy = px - cx, py - cy
        if dx == 0 and dy == 0:
            dx, dy = 1, 1
        dist = max(math.hypot(dx, dy), 1)
        frames = max(int(dist * 65536) // (spd * 16), 1)
        # keep the visual landing exact: move dist in `frames` frames (== real speed spd/4096)
        sim.spawn(mid, cx, cy, dx, dy, target=(px, py), range=frames, vel=dist / frames,
                  sid=sid, lvl=lvl)


def skill_do_158(sim, sid, row, cx, cy, tx, ty):
    """srvdo 158 'wall of missiles across the aim line' (14 oskills: ATMG Sentry, Flamefront, Death Ripple,
 Eldritch Storm, Crystalline Arsenal, Storm Crows, Stampede, Shuriken Flurry..).

 n = calc1 (+0x138)
 act = calc2 -> params[0x11] with flag 0x800 (overrides missiles.txt Activate)
 idx = clamp(calc3, 1, 3) -> srvmissile[idx] = srvmissilea / b / c (+0x46 + 2*idx)
 d = target - caster (ints). if |d|^2 < 4: d *= 4 (and |d|^2 is recomputed as dy^2 + 2*dx, a bug
 in the original that is kept). if that value < 16 the step is doubled.
 step = (dy, -dx) (perpendicular), halved with truncation toward 0 until step.x^2+step.y^2 <= 3
 (so each component ends up -1, 0 or 1).
 first point = target - (step*n)/2 (C truncating division), then n points, each + step.
 Each missile: flags 0x820: starts AT THE CASTER, aimed at its point (0x20); no target unit.
 ASSUMED: Activate (calc2) only delays collision (D2Common 10837 writes missile+0x14 -> +8, the
 'activate' frame) and does not change what is drawn; stored in m.data['activate'].
 """
    n = _calc(sim, sid, row, 'calc1', 0)
    if n <= 0:
        return
    act = _calc(sim, sid, row, 'calc2', 0)
    idx = min(max(_calc(sim, sid, row, 'calc3', 1), 1), 3)
    mid = row.get(('srvmissile', 'srvmissilea', 'srvmissileb', 'srvmissilec')[idx])
    if not mid:
        return
    tx_i, ty_i, cx_i, cy_i = int(round(tx)), int(round(ty)), int(round(cx)), int(round(cy))
    edx = tx_i - cx_i            # dx
    ecx = ty_i - cy_i            # dy
    d2 = ecx * ecx + edx * edx
    if d2 < 4:
        ecx <<= 2
        edx <<= 2
        d2 = ecx * ecx + edx * 2  # sic (lea edi,[eax+edx*2])
    esi = edx if d2 >= 16 else 2 * edx
    esi = -esi
    edi = ecx if d2 >= 16 else 2 * ecx
    while edi * edi + esi * esi > 3:
        edi = _trunc_div(edi, 2)
        esi = _trunc_div(esi, 2)
    x = tx_i - _trunc_div(edi * n, 2)
    y = ty_i - _trunc_div(esi * n, 2)
    lvl = _lvl(sim)
    for _ in range(n):
        dx, dy = x - cx, y - cy
        if dx == 0 and dy == 0:
            dx, dy = 1, 1        # : target == source -> +1,+1
        m = sim.spawn(mid, cx, cy, dx, dy, target=(x, y), sid=sid, lvl=lvl)
        if m is not None and hasattr(m, 'data'):
            m.data['activate'] = act
        x += edi
        y += esi


def _d2_seed_next(seed):
    lo, hi = seed
    v = lo * 0x6ac690c5 + hi
    return (v & MASK32, (v >> 32) & MASK32)


_DIR8 = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]


def _dir8(dx, dy):
    """8-way direction with a 2:1 rule (a component counts only if it is at least half the other)."""
    sx = (dx > 0) - (dx < 0)
    sy = (dy > 0) - (dy < 0)
    if abs(dx) >= 2 * abs(dy):
        sy = 0
    elif abs(dy) >= 2 * abs(dx):
        sx = 0
    return _DIR8.index((sx, sy)) if (sx, sy) != (0, 0) else 0


def charged_bolt_path(x, y, tx, ty, dist, seed_lo):
    """Path type 10: random walk of dist//2 steps of
 2 subtiles. Each step: seed = lo*0x6ac690c5 + hi; off = T[lo & 31] with T = (-1,0,1)*10 + (-1,1);
 direction = (dir8(start->target) + off) & 7."""
    T = [-1, 0, 1] * 10 + [-1, 1]
    d0 = _dir8(tx - x, ty - y)
    seed = (seed_lo & MASK32, 666)
    pts = []
    px, py = int(x), int(y)
    for _ in range(max(dist, 0) >> 1):
        seed = _d2_seed_next(seed)
        k = (T[seed[0] & 31] + d0) & 7
        pts.append((px, py))
        px += 2 * _DIR8[k][0]
        py += 2 * _DIR8[k][1]
    pts.append((px, py))
    return pts


def path_step(m, sim):
    """Movement helper for missiles that carry m.data['path'] (Charged Bolt type paths from srvdo 159).
 Call it from the generic move (srvdo 1 / any srvdo) instead of the straight move when
 m.data.get('path') is set; it moves m.vel subtiles toward the next waypoint and returns 'nomove'."""
    pts = m.data.get('path')
    if not pts:
        return None
    i = m.data.get('path_i', 0)
    step = m.vel
    while step > 0 and i < len(pts):
        px, py = pts[i]
        ddx, ddy = px - m.x, py - m.y
        L = math.hypot(ddx, ddy)
        if L <= step:
            m.x, m.y = px, py
            step -= L
            i += 1
            continue
        m.dx, m.dy = ddx / L, ddy / L
        m.x += m.dx * step
        m.y += m.dy * step
        step = 0
    m.data['path_i'] = i
    return 'nomove'


def skill_do_159(sim, sid, row, cx, cy, tx, ty):
    """srvdo 159 'spawn in front of caster, Charged-Bolt style' (Crucify, Earthquake, Heaven's Fury,
 Sandstorm, Divine Judgement, Medusa, Spiral Dance, Whirlpool).

 n = calc1 (+0x138); idx = clamp(calc2, 1, 3) -> srvmissilea/b/c
 A = caster position, B = target position (target unit or target xy)
 r = 2 + caster size (+0x104 of its size record) + target unit size (byte +8)
 if dist(A,B) >= r: B = A + r*(cos a, -sin a), with a = the angle A->B in degrees, so B ends up
 r subtiles in front of the caster. Otherwise B stays the target.
 Missile params: flags 0x21 -> created AT B, aimed at 2B - A (straight on, away from the caster);
 Charged Bolt init callback with arg i (0..n-1):
 life clamped to 77 frames, unit seed = (word path+0x10) + i, hi 666, path type 10 (random walk,
 see charged_bolt_path), path distance = life.
 Most users have Vel 0 (stationary spawners), so the random walk only matters for ones that move
 (e.g. Sandstorm ml5231, Vel 1).
 ASSUMED: r = 2 for a player with no target unit, 3 when the target point is a stand-in enemy;
 sign convention puts B toward the target; seed base word unknown (random);
 the path is followed by path_step, which emu.py must call (see its docstring).
 """
    n = _calc(sim, sid, row, 'calc1', 0)
    if n <= 0:
        return
    idx = min(max(_calc(sim, sid, row, 'calc2', 1), 1), 3)
    mid = row.get(('srvmissile', 'srvmissilea', 'srvmissileb', 'srvmissilec')[idx])
    if not mid:
        return
    tunit = any(abs(tx - ux) < 0.5 and abs(ty - uy) < 0.5 for ux, uy in getattr(sim, 'targets', []))
    r = 2 + (1 if tunit else 0)
    ax, ay = int(round(cx)), int(round(cy))
    bx, by = int(round(tx)), int(round(ty))
    if math.hypot(bx - ax, by - ay) >= r:
        a = math.atan2(by - ay, bx - ax)
        bx = ax + int(math.cos(a) * r)        # cvttsd2si: truncation toward zero
        by = ay + int(math.sin(a) * r)
    gx, gy = 2 * bx - ax, 2 * by - ay
    mrow = sim.mis_row(mid)
    lvl = _lvl(sim)
    rng_frames = _i(mrow, 'Range') + _i(mrow, 'LevRange') * lvl
    life = min(max(rng_frames, 1), 77)
    base = sim.rng.randrange(65536)
    for i in range(n):
        dx, dy = gx - bx, gy - by
        if dx == 0 and dy == 0:
            dx, dy = 1, 1
        m = sim.spawn(mid, bx, by, dx, dy, target=(gx, gy), range=life, sid=sid, lvl=lvl)
        if m is not None and hasattr(m, 'data'):
            m.data['path'] = charged_bolt_path(bx, by, gx, gy, life, base + i)
            m.data['path_i'] = 1


def skill_do_166(sim, sid, row, cx, cy, tx, ty):
    """srvdo 166 'one missile placed on the target spot' (Flamestrike).

 idx = clamp(calc3, 1, 3) -> srvmissilea/b/c (aborts if that column is empty)
 aborts if the target spot is blocked for the missile's size (missiles.txt byte +0x18a, D2Common
 collision check mask 5) or the target is more than 100 subtiles away.
 One missile, flags 1: created AT the target xy, no target point (create then aims it at
 position+(1,1) if it has a speed).
 ASSUMED: the stand-in target spot is never blocked.
 """
    idx = min(max(_calc(sim, sid, row, 'calc3', 1), 1), 3)
    mid = row.get(('srvmissile', 'srvmissilea', 'srvmissileb', 'srvmissilec')[idx])
    if not mid:
        return
    if math.hypot(tx - cx, ty - cy) > 100:
        return
    sim.spawn(mid, tx, ty, 1, 1, target=(tx + 1, ty + 1), sid=sid, lvl=_lvl(sim))


def _pick_abc(sim, sid, row, calc='calc3'):
    idx = min(max(_calc(sim, sid, row, calc, 1), 1), 3)
    return row.get(('srvmissile', 'srvmissilea', 'srvmissileb', 'srvmissilec')[idx])


def _hammerize(m):
    if m is not None and hasattr(m, 'data'):
        m.data['pathtype'] = 14
        m.data['hammer'] = True
    return m


def skill_do_153(sim, sid, row, cx, cy, tx, ty):
    """n = skill-level count; n srvmissilea from the caster
 with flags 3, target = caster + (rand(40)-20, rand(40)-20). Packed +0x2c like srvdo 41."""
    mid = row.get('srvmissilea')
    if not mid:
        return
    n = _calc(sim, sid, row, 'calc1', 0) or _calc(sim, sid, row, 'prgcalc1', 4)
    n = max(int(n), 1)
    rnd = sim.rng
    for _ in range(n):
        dx = rnd.randrange(40) - 20
        dy = rnd.randrange(40) - 20
        a = rnd.randrange(40)
        b = rnd.randrange(40)
        if a == 20 and b == 20:
            dy = 20
        if dx == 0 and dy == 0:
            dx = 20
        m = sim.spawn(mid, cx, cy, dx, dy, target=(cx + dx, cy + dy), sid=sid, lvl=_lvl(sim))
        if m is not None and hasattr(m, 'data'):
            m.data['d28'] = rnd.getrandbits(32)
            m.data['d2c'] = ((b & 0xffff) << 16) | (a & 0xffff)


def skill_do_154(sim, sid, row, cx, cy, tx, ty):
    """Sigma srvdo 154: buff/state only, no server missile. Client missiles may still fire."""
    return None


def skill_do_155(sim, sid, row, cx, cy, tx, ty):
    return None


def skill_do_156(sim, sid, row, cx, cy, tx, ty):
    """Generic Sigma srvdo: one srvmissilea caster -> target when the row has one."""
    mid = row.get('srvmissilea')
    if mid:
        sim.spawn(mid, cx, cy, tx - cx, ty - cy, target=(tx, ty), sid=sid, lvl=_lvl(sim))


def skill_do_160(sim, sid, row, cx, cy, tx, ty):
    """srvdo 160: srvdo 159 spawn in front of the caster, then path type 0xe (hammer spiral)."""
    skill_do_159(sim, sid, row, cx, cy, tx, ty)
    for m in list(getattr(sim, 'new', [])):
        _hammerize(m)


def skill_do_161(sim, sid, row, cx, cy, tx, ty):
    mid = _pick_abc(sim, sid, row, 'calc2') or row.get('srvmissilea')
    if mid:
        sim.spawn(mid, cx, cy, tx - cx, ty - cy, target=(tx, ty), sid=sid, lvl=_lvl(sim))


def skill_do_162(sim, sid, row, cx, cy, tx, ty):
    skill_do_161(sim, sid, row, cx, cy, tx, ty)


def skill_do_165(sim, sid, row, cx, cy, tx, ty):
    """srvdo 165: flamestrike (166) then path type 0xe on the missile."""
    skill_do_166(sim, sid, row, cx, cy, tx, ty)
    for m in list(getattr(sim, 'new', [])):
        _hammerize(m)


def skill_do_171(sim, sid, row, cx, cy, tx, ty):
    """srvdo 171: one srvmissilea from caster, path type 0xe (hammer)."""
    mid = row.get('srvmissilea') or _pick_abc(sim, sid, row)
    if not mid:
        return
    m = sim.spawn(mid, cx, cy, tx - cx, ty - cy, target=(tx, ty), sid=sid, lvl=_lvl(sim))
    _hammerize(m)


def skill_do_167(sim, sid, row, cx, cy, tx, ty):
    """srvdo 167 Resurrect: revives the target corpse as a pet. It never
 creates a missile, so the server spawns none. The visible part is the client skill
 missile (cltmissilea ml996), drawn on the corpse by the client skill do."""
    return None


# ---------------------------------------------------------------------------------------------
# missile srvhit
# ---------------------------------------------------------------------------------------------
def mhit_69(m, sim, unit=None):
    """srvhit 69: area damage around the missile,
 radius sHitPar1 (or the skill's calc1), through the area callback. No missiles."""
    return None


def mhit_71(m, sim, unit=None):
    """srvhit 71: puts state Param4 on the OWNER, with stats
 from SrvCalc1/CltCalc1/SHitCalc1/CHitCalc1 and sHitPar1.3 (stat ids). Buff only; no missiles.
 (State overlays are not drawn.)"""
    return None


def mhit_72(m, sim, unit=None):
    """srvhit 72 'owner casts skill sHitPar1'.
 skill = sHitPar1 (a skills.txt Id), level = sHitPar2 if > 0 else the missile's skill level.
 if it hit a unit: the owner casts on that unit;
 else: the owner casts at the missile's position (path x/y).
 Chance-to-cast path, so the caster is the OWNER: the skill's
 srvdofunc runs with caster = owner and target = hit unit / missile spot, and the engine then also
 fires its srvmissile from the owner toward that target.
 Only runs if the missile unit has flag 0x400 in +0xC8 (otherwise returns 1 doing nothing).
 ASSUMED: that flag is set for player missiles. If sim has cast_skill(sid, lvl, cx, cy, tx, ty)
 it is used; otherwise this falls back to that skill's srvdo plug-in in this module, plus srvmissile
 from the caster.
 """
    r = m.r or {}
    try:
        sk = int(r.get('sHitPar1') or 0)
    except ValueError:
        return None
    if sk <= 0:
        return None
    lvl = _i(r, 'sHitPar2') or _lvl(sim, m)
    tx, ty = unit if unit is not None else (m.x, m.y)
    cx, cy = getattr(sim, 'caster', (0, 0))
    cast = getattr(sim, 'cast_skill', None)
    if cast:
        return cast(sk, lvl, cx, cy, tx, ty)
    try:
        row = sim.skill_row(sk)
    except Exception:
        row = None
    if not row:
        return None
    f = globals().get('skill_do_%s' % row.get('srvdofunc'))
    if f:
        f(sim, sk, row, cx, cy, tx, ty)
    mid = row.get('srvmissile')
    if mid:
        dx, dy = tx - cx, ty - cy
        if dx == 0 and dy == 0:
            dx, dy = 1, 1
        sim.spawn(mid, cx, cy, dx, dy, target=(tx, ty), sid=sk, lvl=lvl)
    return None


def mhit_73(m, sim, unit=None):
    """srvhit 73: spawns a monster/object at the missile:
 class = owner stat 88 if Param4 > 0, else sHitPar1; mode = sHitPar2 (0.15, else 1).
 No missiles (ml5298, Habeas Corpus)."""
    return None


def mhit_77(m, sim, unit=None):
    """srvhit 77 'offset ring'.
 sub = HitSubMissile1 (record +0x24); step = sHitPar1 (64-dir slots)
 range = sHitPar2 if > 0, else the owning skill's calc3 (>= 1); passed as params[0x13] with flag 0x8000
 flags 0x8002: created at the dying missile (source unit = the missile), target = its position +
 (X[k], Y[k]) from the 64-entry tables at. (cos/sin * 30, same as D2Game's ring).
 for k = 0, step, 2*step,.. < 64: spawn, then D2Common 10637(sub, X[k]) (+0x28) and
 10019(sub, Y[k]) (+0x2c).
 Unlike hit 29 the slots are absolute (slot 0 = +x), not turned to the missile's heading.
 Returns early (2) if D2Common 10737(missile) is set, and does nothing unless the unit has flag
 0x400 in +0xC8. ASSUMED: both pass. The +0x28/+0x2c values are stored in m.data['d28'/'d2c'].
 """
    r = m.r or {}
    sub = r.get('HitSubMissile1')
    if not sub:
        return None
    step = max(_i(r, 'sHitPar1'), 1)
    rng = _i(r, 'sHitPar2')
    if rng <= 0:
        try:
            srow = sim.skill_row(m.sid)
        except Exception:
            srow = None
        rng = max(_calc(sim, m.sid, srow, 'calc3', 1), 1)
    for k in range(0, 64, step):
        ox, oy = _ring_int(k)
        c = sim.spawn(sub, m.x, m.y, ox, oy, target=(m.x + ox, m.y + oy), range=rng,
                      sid=getattr(m, 'sid', None), lvl=_lvl(sim, m))
        if c is not None and hasattr(c, 'data'):
            c.data['d28'] = ox
            c.data['d2c'] = oy
    return None
