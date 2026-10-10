"""Skill srvdo plug-ins 8, 11, 17, 18, 27.

Missile-creation param struct (0x5c bytes):
 +0x00 flags 1 = source position is +0x14/+0x18 (otherwise the position of the unit at +0x08)
 2 = target is source + (+0x1c,+0x20) (an offset)
 0x20 = target is (+0x1c,+0x20) (absolute) (neither 2 nor 0x20: target = source)
 4 = velocity is taken from +0x28 (0x10: already in 8.8 fixed point, no <<8)
 8 = range += (SubStop-SubStart)*(+0x34)
 0x200 = range -= +0x40 (missile data +0x44 = +0x40<<8)
 0x400 = lifetime recomputed from the distance to the target (reaches the target and ends)
 0x800 = Activate (frames before the missile can collide) = +0x44 instead of missiles.txt Activate
 0x1000= set stat 0x13 from +0x48 (damage only)
 0x8000= range = +0x4c instead of Range + LevRange*level
 0x10000 = set missile-data flag 2 (read back only when building the hit's damage: damage flag 0x80)
 +0x04 owner unit +0x08 source unit +0x0c target unit (target = its position; if it stands on the source,
 target unit is dropped and target = source+(1,1)) +0x10 missile id +0x14/+0x18 source x/y
 +0x1c/+0x20 target x/y +0x28 velocity +0x2c skill id +0x30 skill level +0x34 see flag 8
 +0x40 see 0x200 +0x44 see 0x800 +0x48 see 0x1000 +0x4c see 0x8000
 +0x54 post-create callback +0x58 callback argument
 If velocity != 0 and target == source (no target unit), target = source + (1,1).
 Default velocity = ((Vel + VelLev*lvl/8) << 8) * 75/100.
 Default lifetime = Range + LevRange*lvl frames.
The engine srvmissile launch runs AFTER srvdo and uses the caster position at that moment
(flags 0x21, source = caster x/y, target = the skill target point), whether or not srvdo succeeded.

Target point: the target unit's position if the unit has a target other than itself,
else the path's target x/y.
"""
import math

# ---------------------------------------------------------------------------- helpers

def _calc(sim, sid, row, col, default):
    v = (row.get(col) or '').strip()
    if not v:
        return default            # empty calc column evaluates to 0 in the game; callers pass 0 where it matters
    try:
        return int(sim.calc(sid, v, default))
    except Exception:
        return default


def _mis(row, col):
    v = (row.get(col) or '').strip()
    return v or None


def _progressive_missile(sim, row):
    """If the skill is progressive (skills.txt flag bit 2) and aurastate/aurastat1
 are set, the caster's aurastat1 value in that state (= charges) picks srvmissile[min(max(c,1),3)], i.e.
 0-1 -> srvmissilea, 2 -> srvmissileb, >=3 -> srvmissilec. Otherwise srvmissilea.
 Charges come from sim.charges (ASSUMED 0 if the emulator does not set it)."""
    a = _mis(row, 'srvmissilea')
    if (row.get('progressive') or '0').strip() not in ('', '0') and _mis(row, 'aurastate') and _mis(row, 'aurastat1'):
        c = int(getattr(sim, 'charges', 0) or 0)
        c = 1 if c <= 1 else min(c, 3)
        return _mis(row, ('srvmissilea', 'srvmissileb', 'srvmissilec')[c - 1]) or a
    return a


def _tdiv(a, b):
    """C integer division (truncates toward zero)."""
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q


# 8-direction unit steps and the 5x5 coarse-direction table (first column)
_DIR8 = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]
_DIR25 = [5, 4, 4, 4, 3, 6, 5, 4, 3, 2, 6, 6, 6, 2, 2, 6, 7, 0, 1, 2, 7, 0, 0, 0, 1]
_WOBBLE = [-1, 0, 1] * 10 + [-1, 1]     # 32-entry path-wobble table


def _dir25(dx, dy):
    """Coarse direction index 5*cx+cy+12, cx/cy in -2..2."""
    ax, ay = abs(dx), abs(dy)
    if ax >= 2 * ay:
        dy = -1 if dy < 0 else (dy & 1)
    elif 2 * ax <= ay:
        if dx < 0:
            dx = -1
        else:
            dx = dx & 1
    dx = max(-2, min(2, dx))
    dy = max(-2, min(2, dy))
    return 5 * dx + dy + 12


def charged_path(sx, sy, tx, ty, steps, seed):
    """Path type 10: a seeded random walk.
 base = coarse direction start->target; for steps>>1 waypoints: seed = lo*0x6ac690c5 + hi (64-bit LCG,
 lo/hi = low/high dword, initial hi = 0x29a), d = (WOBBLE[lo & 31] + base) & 7, point += 2*DIR8[d].
 Returns [start, p1,.., p_(steps>>1)] in subtiles."""
    sx, sy, tx, ty = int(round(sx)), int(round(sy)), int(round(tx)), int(round(ty))
    base = _DIR25[_dir25(tx - sx, ty - sy)]
    lo, hi = seed & 0xffffffff, 0x29a
    x, y = sx, sy
    pts = [(x, y)]
    for _ in range(steps >> 1):
        v = lo * 0x6ac690c5 + hi
        lo, hi = v & 0xffffffff, (v >> 32) & 0xffffffff
        d = (_WOBBLE[lo & 31] + base) & 7
        x += 2 * _DIR8[d][0]
        y += 2 * _DIR8[d][1]
        pts.append((x, y))
    return pts


def follow_waypoints(m, sim=None):
    """Mover for missiles carrying m.data['waypoints'] (path type 10). Advances m.vel subtiles along the
 polyline per frame and points m.dx/m.dy along the current leg. Returns 'nomove'.
 INTEGRATION: emu core should call m.data['mover'](m, sim) instead of the straight move when present.
 ASSUMED: at the end of the polyline the missile stops (it still dies at its lifetime)."""
    pts = m.data['waypoints']
    i = m.data.get('wp_i', 0)
    left = m.vel
    while left > 1e-9 and i < len(pts) - 1:
        nx, ny = pts[i + 1]
        ddx, ddy = nx - m.x, ny - m.y
        d = math.hypot(ddx, ddy)
        if d < 1e-9:
            i += 1
            continue
        m.dx, m.dy = ddx / d, ddy / d
        if d <= left:
            m.x, m.y = float(nx), float(ny)
            left -= d
            i += 1
        else:
            m.x += m.dx * left
            m.y += m.dy * left
            left = 0
    m.data['wp_i'] = i
    return 'nomove'


def _charged_bolt_setup(sim, m, idx):
    """Callback (passed in struct +0x54, +0x58 = loop index):
 total = missile lifetime; if total >= 78: lifetime := 77 (ord 10558/10970)
 seed(missile+0x20) := (path target X + idx, 0x29a) (ord 10614)
 path type := 10 (ord 10647), path step count := min(total,77) (ord 10168), then build the path (ord 10334).
 ASSUMED: emulator coordinates stand in for absolute game coordinates in the seed, so the exact walk differs
 from a given in-game cast (it is the right kind of walk, deterministic per bolt)."""
    total = min(int(m.range), 77)
    m.range = total
    tx, ty = m.target if m.target else (m.x + m.dx, m.y + m.dy)
    m.data['waypoints'] = charged_path(m.x, m.y, tx, ty, total, int(round(tx)) + idx)
    m.data['wp_i'] = 0
    m.data['mover'] = follow_waypoints
    m.data['pathtype'] = 10


# ---------------------------------------------------------------------------- srvdo 8

def skill_do_8(sim, sid, row, cx, cy, tx, ty):
    """srvdo 8 - Multiple-Shot style fan aimed at a line through the target.

 N = calc1 (rec+0x138) number of missiles
 A = calc2 (rec+0x13c) -> struct +0x44 with flag 0x800 = Activate override (collision delay only: the
 collision routine at skips hits while activateFrame < currentFrame). No visual effect.
 M = calc3 (rec+0x140); if 0 then M = N. The first (N-M)/2 and the last N-M-(N-M)/2 missiles get flags
 0x10820, the middle M get 0x820: the only difference is missile-data flag 2 -> damage flag 0x80
 (damage only, no visual effect).
 missile = srvmissilea; if D2Common 10076(caster) (a property of the item in hand slot 1) != 1 and
 srvmissileb >= 0, srvmissileb. ASSUMED srvmissilea (all inventory rows have b empty or == a).
 (dx,dy) = target - caster. If dx^2+dy^2 < 4 multiply by 4, then if
 < 16 multiply by 2. (u,v) = (-dx, dy), halve both (C truncation) until u^2+v^2 <= 3,
 step = (v, u) -> an integer perpendicular of length 1 or sqrt(2) (8-way quantised).
 aim point p0 = target - (step*N)/2 (each component C-truncated), p_k = p0 + k*step, k = 0.N-1.
 Each missile: source = caster position (struct +0x08 = caster, flag 1 clear), target = p_k (flag 0x20),
 default velocity/range from missiles.txt. All created in the same frame.
 So the missiles leave the caster together and spread so that they cross a 1-subtile-spaced line
 perpendicular to the cast direction at the target distance (wider fan the closer the target)."""
    mid = _mis(row, 'srvmissilea') or _mis(row, 'srvmissileb')
    if not mid:
        return
    n = _calc(sim, sid, row, 'calc1', 1)
    if n <= 0:
        return
    A = _calc(sim, sid, row, 'calc2', 0)
    m_mid = _calc(sim, sid, row, 'calc3', 0)
    if m_mid == 0:
        m_mid = n
    icx, icy, itx, ity = int(round(cx)), int(round(cy)), int(round(tx)), int(round(ty))
    dx, dy = itx - icx, ity - icy
    if dx * dx + dy * dy < 4:
        dx, dy = dx * 4, dy * 4
    if dx * dx + dy * dy < 16:
        dx, dy = dx * 2, dy * 2
    u, v = -dx, dy
    while u * u + v * v > 3:
        u, v = _tdiv(u, 2), _tdiv(v, 2)
    sx, sy = v, u
    px = itx - _tdiv(sx * n, 2)
    py = ity - _tdiv(sy * n, 2)
    outer1 = _tdiv(n - m_mid, 2)
    for k in range(n):
        ax, ay = px + k * sx, py + k * sy
        ddx, ddy = ax - cx, ay - cy
        if ddx == 0 and ddy == 0:
            ddx, ddy = 1, 1               # creation nudges target to source+(1,1)
        m = sim.spawn(mid, cx, cy, ddx, ddy, target=(ax, ay), sid=sid)
        if m is not None:
            m.data['outer'] = not (outer1 <= k < outer1 + m_mid)   # missile flag 2 (damage only)
            if A:
                m.data['activate'] = A


# ---------------------------------------------------------------------------- srvdo 11

def skill_do_11(sim, sid, row, cx, cy, tx, ty):
    """srvdo 11 - Charged-Strike style bolts bursting out of the target.

 Requires a target unit (not the caster), else returns 0 and creates nothing
 (the engine srvmissile launch still happens). Facing/attack bookkeeping only; no missiles.
 N = calc1 (rec+0x138). missile = progressive charges pick srvmissilea/b/c, else a.
 struct: flags 0x21; source (+0x14/+0x18) = target unit position T; target (+0x1c/+0x20) = 2*T - caster
 (the point as far beyond the target as the caster is before it); +0x2c skill, +0x30 level;
 Charged Bolt init callback with arg i (loop index 0.N-1). Default velocity/range.
 All N created in the same frame at the same point with the same aim; they separate only through the
 callback: lifetime clamped to 77, path type 10 (seeded random walk in 2-subtile 8-way steps that wobbles
 -1/0/+1 direction slots around the start->aim direction), seed = aim X + i. See charged_path.
 Emulator stand-in: target unit at (tx, ty)."""
    mid = _progressive_missile(sim, row)
    if not mid:
        return
    n = _calc(sim, sid, row, 'calc1', 1)
    icx, icy, itx, ity = int(round(cx)), int(round(cy)), int(round(tx)), int(round(ty))
    if (itx, ity) == (icx, icy):
        return                                     # target unit == caster -> function returns 0
    ax, ay = 2 * itx - icx, 2 * ity - icy
    for i in range(max(n, 0)):
        m = sim.spawn(mid, itx, ity, ax - itx, ay - ity, target=(ax, ay), sid=sid)
        if m is not None:
            _charged_bolt_setup(sim, m, i)


# ---------------------------------------------------------------------------- srvdo 17

def skill_do_17(sim, sid, row, cx, cy, tx, ty):
    """srvdo 17 - Charged-Bolt style: N random-walk bolts from the caster.

 missile = progressive: charges 0-1 -> srvmissilea, 2 -> b, >=3 -> c; else a.
 N = calc1 (rec+0x138).
 struct: flags 0x21; source = caster x/y; +0x2c skill, +0x30 level;
 Charged Bolt init callback, arg i. For each i: target (+0x1c/+0x20) = skill target point,
 missile created only if both target coords are non-zero.
 Same frame, same start, same aim; the callback gives each bolt its own seeded type-10 random-walk path
 (seed = target X + i) and clamps its lifetime to 77 frames. See charged_path/_charged_bolt_setup.
 Note: calc3/Param columns in the 17-rows (e.g. Forked Lightning calc3) are not read by this function."""
    mid = _progressive_missile(sim, row)
    if not mid:
        return
    n = _calc(sim, sid, row, 'calc1', 1)
    for i in range(max(n, 0)):
        ddx, ddy = tx - cx, ty - cy
        if ddx == 0 and ddy == 0:
            ddx, ddy = 1, 1
        m = sim.spawn(mid, cx, cy, ddx, ddy, target=(tx, ty), sid=sid)
        if m is not None:
            _charged_bolt_setup(sim, m, i)


# ---------------------------------------------------------------------------- srvdo 18

def skill_do_18(sim, sid, row, cx, cy, tx, ty):
    """srvdo 18 - timed self-buff; creates NO missiles.

 Requires aurastate (rec+0x80) valid; duration = auralencalc (rec+0x60); state is created on the
 caster; aurastat1-6/aurastatcalc apply; stats 0x15e/0x15f = skill id / state; up to 3 aura events
 (rec+0x84.) are registered. None of that creates a missile.
 Visible part = the engine srvmissile, launched afterwards from the caster toward the target.
 Periodic buff effects (calc1/calc3/Param in these rows) come from state/event handlers, not srvdo 18."""
    return None


# ---------------------------------------------------------------------------- srvdo 27

def skill_do_27(sim, sid, row, cx, cy, tx, ty):
    """srvdo 27 - Teleport; creates NO missiles.

 Target = skill target point; room/level check (level byte +4 == 0 -> fail; == 2 -> collision test
 0x804 at the target, blocked -> fail); then the caster moves at once (nearest free spot).
 Because the engine srvmissile launch runs after srvdo and uses the caster position then,
 the srvmissile appears at the DESTINATION. If that leaves source == target point, creation nudges the
 target to source+(1,1), so the srvmissile faces +x+y (screen-down).
 Emulator: moves sim.caster to the target so that the subsequent srvmissile launch starts there."""
    try:
        sim.caster = (tx, ty)
    except Exception:
        pass
    return None
