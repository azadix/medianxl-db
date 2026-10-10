"""Skill srvdo plug-ins 22, 124, 125, 68, 51, 19, 24, 14, 41, 73, 82, 63, 4.

Missile-creation struct (same layout as plugins_a.py):
 +0 flags: 1 = source is +0x14/+0x18 (else the position of unit +0x08); 2 = target = source + (+0x1c,+0x20);
 0x20 = target = (+0x1c,+0x20) absolute; neither = target = source (nudged +1,+1 if velocity != 0);
 4 = velocity from +0x28 (Vel units, <<8; with 0x10 already 8.8 fixed point);
 0x8000 = lifetime = +0x4c instead of Range + LevRange*lvl.
 +0x10 missile id, +0x2c skill, +0x30 level. Default velocity (Vel + VelLev*lvl/8)<<8 * 75/100.
Target point = target unit position, else the clicked x/y.
srvmissilea (or b/c by charges for progressive skills).
prgcalc1 (or prgcalc1/2/3 the same way) -- a missile COUNT for srvdo 41.
Missile data +0x28 / +0x2c (D2Common ord 10637/10019 set, 11018/10818 get) are stored in m.data['d28'] /
m.data['d2c']. Missile srvdo 31  and srvdo 15  show +0x28 is used as the X component
and +0x2c as Y (srvdo 31 spawns SubMissile1 toward src+(d28,d2c) and src-(d28,d2c)); srvdo 15 uses
(+0x28 & 63) as its 64-direction counter (= m.counter here).
"""
import math

VSCALE = 1 / 32.0     # ASSUMED, same as emu.py: Vel units -> subtiles per frame (the engine's *75/100 is folded in)


# ---------------------------------------------------------------------------- helpers

def _n(r, c, d=0):
    try:
        return int((r.get(c) or '').strip() or d)
    except (ValueError, AttributeError):
        return d


def _lvl(sim):
    return int(getattr(sim, 'lvl', 1) or 1)


def _calc(sim, sid, row, col, default=0):
    """Evaluate skills.txt column `col`. An empty calc is 0 in the game. A bare 'clcN' is resolved to calcN."""
    v = (row.get(col) or '').strip()
    for _ in range(3):
        if v.startswith('clc') and v[3:].isdigit():
            v = (row.get('calc' + v[3:]) or '').strip()
    if not v:
        return 0
    try:
        return int(sim.calc(sid, v, default))
    except Exception:
        return default


def _mis(row, col):
    v = (row.get(col) or '').strip()
    return v or None


def _srvmissile_a(sim, row):
    """srvmissilea, or b/c by charge count for progressive skills (sim.charges, ASSUMED 0)."""
    a = _mis(row, 'srvmissilea')
    if (row.get('progressive') or '0').strip() not in ('', '0') and _mis(row, 'aurastate') and _mis(row, 'aurastat1'):
        c = int(getattr(sim, 'charges', 0) or 0)
        c = 1 if c <= 1 else min(c, 3)
        return _mis(row, ('srvmissilea', 'srvmissileb', 'srvmissilec')[c - 1]) or a
    return a


def _prgcalc(sim, sid, row):
    """prgcalc1 (or prgcalc1/2/3 by charges for progressive skills)."""
    col = 'prgcalc1'
    if (row.get('progressive') or '0').strip() not in ('', '0') and _mis(row, 'aurastate') and _mis(row, 'aurastat1'):
        c = int(getattr(sim, 'charges', 0) or 0)
        col = 'prgcalc%d' % (1 if c <= 1 else min(c, 3))
    return _calc(sim, sid, row, col, 0)


def _range(sim, mid):
    r = sim.mis_row(mid)
    return max(_n(r, 'Range') + _n(r, 'LevRange') * _lvl(sim), 1)


def _default_vel_units(sim, mid):
    r = sim.mis_row(mid)
    return _n(r, 'Vel') + (_n(r, 'VelLev') * _lvl(sim)) // 8


def _make(sim, sid, mid, sx, sy, tx, ty, vel_units=None, rng=None):
    """Create missile `mid` at (sx,sy) aimed at (tx,ty)."""
    v = _default_vel_units(sim, mid) if vel_units is None else vel_units
    dx, dy = tx - sx, ty - sy
    if dx == 0 and dy == 0:
        dx, dy = 1, 1        # engine nudges target to source+(1,1) when velocity != 0; for 0 velocity ASSUMED same
        tx, ty = sx + 1, sy + 1
    kw = dict(target=(tx, ty), range=_range(sim, mid) if rng is None else rng, sid=sid, lvl=_lvl(sim))
    if vel_units is not None:
        kw['vel'] = v * VSCALE
    return sim.spawn(mid, sx, sy, dx, dy, **kw)


def _after(sim, frames, fn):
    """Run fn `frames` game frames from now. Uses sim.after / sim.schedule when the emulator has one;
 otherwise queues (frames, fn) on sim.pending -- INTEGRATION: the core should drain sim.pending each tick."""
    for name in ('after', 'schedule', 'later'):
        f = getattr(sim, name, None)
        if callable(f):
            return f(frames, fn)
    if frames <= 0:
        return fn()
    if not hasattr(sim, 'pending'):
        sim.pending = []
    sim.pending.append([frames, fn])


def _set_d28(m, x, y=None):
    """Write missile +0x28 / +0x2c using the emulator string keys."""
    if m is None:
        return
    m.data['d28'] = x
    if y is not None:
        m.data['d2c'] = y


def _nova(sim, sid, mid, cx, cy, vel_units):
    """For k in 0..63 create `mid` with flags 3 at the caster position,
 target = caster + (cos[k], sin[k]) (magnitude 30, = ring_vec(k)); if vel_units != 0
 flags |= 4 and +0x28 = vel_units. Always exactly 64 missiles, one per 64-direction slot."""
    out = []
    for k in range(64):
        vx, vy = sim.ring_vec(k)
        out.append(_make(sim, sid, mid, cx, cy, cx + vx, cy + vy,
                         vel_units=vel_units if vel_units else None))
    return out


# ---------------------------------------------------------------------------- plug-ins

def skill_do_22(sim, sid, row, cx, cy, tx, ty):
    """srvdo 22 'nova'.
 mid = srvmissilea; v = Vel + VelLev*lvl/8 (missile Vel/VelLev)
 + skills.txt calc1. 64 missiles, one per 64-dir slot,
 from the caster, velocity override v when v != 0. The count is ALWAYS 64 -- Param1/Param2 (Glacial Nova 9/3,
 Spike Nova 12/4) are not read here. None of the real users (Glacial Nova ml818, Ice Bolt Nova ml1316,
 Ring of Light ml724, Spike Nova ml4708, Time Wave ml1985) has calc1, so v = the default velocity."""
    mid = _srvmissile_a(sim, row)
    if not mid:
        return
    v = _default_vel_units(sim, mid) + _calc(sim, sid, row, 'calc1', 0)
    _nova(sim, sid, mid, cx, cy, v)


def skill_do_124(sim, sid, row, cx, cy, tx, ty):
    """srvdo 124 (aura activation): creates NO missiles.
 It (re)creates the aurastate on the caster with aurastat1-6, and schedules unit event 5 at
 now + Param4 (skill+0x154; Lex Talionis 40, Pestilence 5, Liche Form 1, Vessels 8/4) -- the periodic aura
 tick. srvmissilea of Lex Talionis / Vessels is not referenced here (only an engine srvmissile, if set,
 is launched). Nothing to emulate."""
    return


def skill_do_125(sim, sid, row, cx, cy, tx, ty):
    """srvdo 125.
 One srvmissilea, flags 2: source = caster (unit +0x08), target = caster + (tx-cx, ty-cy); default velocity
 and range. Then missile data +0x28 = -(ty-cy) (ord 10637) and +0x2c = (tx-cx) (ord 10019): the
 perpendicular of the aim vector, unnormalised, in subtiles. Missile srvdo 31 ( used by
 Avalanche ml1979, Electrobolt ml1491, Phoenix Wave ml1975) spawns SubMissile1 toward src+(d28,d2c) and
 src-(d28,d2c) -- i.e. the sideways sub-missiles. calc1/Param1 are not read by this function."""
    mid = _srvmissile_a(sim, row)
    if not mid:
        return
    m = _make(sim, sid, mid, cx, cy, tx, ty)
    if m is not None:
        _set_d28(m, -int(round(ty - cy)), int(round(tx - cx)))


def skill_do_68(sim, sid, row, cx, cy, tx, ty):
    """srvdo 68 (War Cry, Dark Power).
 Nova with count/velocity 0: 64 srvmissilea (War Cry ml3146, Dark Power ml760) from the caster,
 one per 64-dir slot, default velocity/range. Then applies the aura state/stun (no missiles).
 Param1-4 are not used for missile placement."""
    mid = _srvmissile_a(sim, row)
    if not mid:
        return
    _nova(sim, sid, mid, cx, cy, 0)


def skill_do_51(sim, sid, row, cx, cy, tx, ty):
    """srvdo 51 (Dominate, Mind Control): creates NO missiles.
 Area search around the target point with callback, which only applies
 damage/conversion; srvmissilea is not read (and both oskills leave it empty -- their visuals are
 cltmissilea/c ml181/ml996, client side)."""
    return


SRVDO19_INTERVAL = 2      # ASSUMED frames between repeats (monster path re-arms an event at now+2; players
                          # rewind the animation to frame 11 (unit+0x44 = 0xb00), real period = seq do-frame - 11)


def skill_do_19(sim, sid, row, cx, cy, tx, ty):
    """srvdo 19 (inferno-style channel, paired with srvstfunc 11).
 Each call that fires: one srvmissilea, flags 0x8020: source = caster, target = the target point (absolute),
 lifetime = max(calc1, 1) frames (+0x4c). Default velocity.
 Repeating: srvst 11 sets the end frame = now + max(calc2, 1) (players); while frame < end and state 0xc
 is on, srvdo re-arms itself (event at now+2) and rewinds the animation, so one missile per repeat.
 On the very first cast (no state 0xc yet) srvst zeroes the skill flag and the first do creates nothing;
 from the second sequence on srvst itself also fires one (ignored here: ASSUMED steady channel).
 Hurricane: calc1 empty -> lifetime 1 (ml5321 range 1, explodes at once at the caster: its srvdo 15 /
 hit do the visible part); calc2 attack-speed formula. Virulence: calc1 = ln12/2, calc2 = 20."""
    mid = _srvmissile_a(sim, row)
    if not mid:
        return
    life = max(_calc(sim, sid, row, 'calc1', 0), 1)
    dur = max(_calc(sim, sid, row, 'calc2', 20), 1)

    def fire(t):
        _make(sim, sid, mid, cx, cy, tx, ty, rng=life)
        if t < dur:
            _after(sim, SRVDO19_INTERVAL, lambda: fire(t + SRVDO19_INTERVAL))

    fire(0)


def skill_do_24(sim, sid, row, cx, cy, tx, ty):
    """srvdo 24 (Lightning Wall, Phalanx) - fire-wall layout.
 Requires the target subtile to be free (ord 10057). With d = (tx-cx, ty-cy):
 srvmissilea flags 0x21 at the target point, target = T + (dy, -dx)
 srvmissilea flags 0x21 at the target point, target = T + (-dy, dx)
 srvmissileb (if set) flags 1 at the target point, target = itself (stationary).
 So two walls running perpendicular to the cast direction, both ways from the clicked point.
 Lightning Wall: 2x ml723 (srvdo 15 drops ml722 each frame) + ml722 at the centre. Phalanx: 2x ml844."""
    a = _srvmissile_a(sim, row)
    if not a:
        return
    dx, dy = tx - cx, ty - cy
    _make(sim, sid, a, tx, ty, tx + dy, ty - dx)
    _make(sim, sid, a, tx, ty, tx - dy, ty + dx)
    b = _mis(row, 'srvmissileb')
    if b:
        _make(sim, sid, b, tx, ty, tx, ty)


def skill_do_14(sim, sid, row, cx, cy, tx, ty):
    """srvdo 14 (Rock Shock, Parasite) - bounce from the target to a neighbour.
 Needs a target unit. Area search (mask 0xa783) of radius calc1 around the target; callback
 picks the unit with the smallest GUID above the target's, else the smallest GUID <= it (may be the
 target itself). One srvmissilea, flags 0x20: source = the TARGET unit, target = that unit's position;
 missile data +0x28 = calc2 (remaining bounces, read by the missile hit func). Default velocity/range.
 GUID order emulated as sim.targets list order (ASSUMED); the clicked target is the stand-in nearest (tx,ty).
 Rock Shock: calc1 16, calc2 ln12/4+syn1, ml1739. Parasite: calc1 12, srvmissilea ml5509."""
    mid = _srvmissile_a(sim, row)
    if not mid:
        return
    rad = _calc(sim, sid, row, 'calc1', 0)
    tg = list(getattr(sim, 'targets', []) or [])
    if tg:
        i0 = min(range(len(tg)), key=lambda i: math.hypot(tg[i][0] - tx, tg[i][1] - ty))
        sx, sy = tg[i0]
    else:
        i0, (sx, sy) = -1, (tx, ty)
    near = [i for i, (x, y) in enumerate(tg) if math.hypot(x - sx, y - sy) <= rad]
    above = [i for i in near if i > i0]
    pick = above[0] if above else (min(near) if near else i0)
    ex, ey = tg[pick] if pick >= 0 else (sx, sy)
    m = _make(sim, sid, mid, sx, sy, ex, ey)
    if m is not None:
        _set_d28(m, _calc(sim, sid, row, 'calc2', 0))


def skill_do_41(sim, sid, row, cx, cy, tx, ty):
    """srvdo 41 (Deathgaze).
 count = prgcalc1 (; Deathgaze prgcalc1 = clc4 = 4+lvl/par2, Param2 40). For each:
 dx = rnd%40-20, dy = rnd%40-20 (unit seed LCG 0x6ac690c5; if both 0 then dx = 20); srvmissilea flags 3 at
 the TARGET point, target = T + (dx,dy) -> random direction, default velocity/range.
 Missile data +0x28 = current seed low dword (random) -> srvdo 15's 64-dir counter starts at (seed & 63);
 +0x2c = (dy<<16)|(dx&0xffff)."""
    mid = _srvmissile_a(sim, row)
    if not mid:
        return
    n = _prgcalc(sim, sid, row)
    rnd = sim.rng
    for _ in range(max(n, 0)):
        dx = rnd.randrange(40) - 20
        dy = rnd.randrange(40) - 20
        if dx == 0 and dy == 0:
            dx = 20
        m = _make(sim, sid, mid, tx, ty, tx + dx, ty + dy)
        if m is not None:
            seed = rnd.getrandbits(32)
            _set_d28(m, seed, ((dy & 0xffff) << 16) | (dx & 0xffff))
            m.counter = seed & 63


def skill_do_73(sim, sid, row, cx, cy, tx, ty):
    """srvdo 73 (Hammer of Zerae).
 One srvmissilea (ml2586; ml5502 = srvmissilec with 3+ charges if progressive), flags 0x20: source = caster,
 target = target point (absolute); default velocity/range. Afterwards the path type is set to 0xe
 (ord 10647) -- movement effect not ported (ASSUMED straight line) -- and damage stats are scaled."""
    mid = _srvmissile_a(sim, row)
    if not mid:
        return
    m = _make(sim, sid, mid, cx, cy, tx, ty)
    if m is not None:
        m.data['pathtype'] = 14
        m.data['hammer'] = True


def skill_do_82(sim, sid, row, cx, cy, tx, ty):
    """srvdo 82 (Pagan Rites): creates NO missiles.
 Applies aurastate + aurastats to the caster and, via area search (callback) of radius
 aurarangecalc, to allies; neither callback creates missiles. ml173 is cltmissilea (client only)."""
    return


def skill_do_63(sim, sid, row, cx, cy, tx, ty):
    """srvdo 63 (Shatter the Flesh / corpse explosion).
 Needs a corpse target; marks it (state 0x76) and spawns with flags 0x17 = source = corpse x/y, target = corpse + offset from the 16-point ring
 tables ((0,2),(1,2),(2,2),(2,1),(2,0)...; radius-2 square), taking every 2nd entry
 -> 8 missiles toward the 8 compass offsets; velocity = missile Param1<<7 in 8.8 (= Param1/2 Vel units).
 ml695 has Param1 0 -> 8 stationary missiles at the corpse (range 1, AlwaysExplode, ExplosionMissile ml88).
 Corpse position = the target point."""
    mid = _srvmissile_a(sim, row)
    if not mid:
        return
    tbx = [0, 1, 2, 2, 2, 2, 2, 1, 0, -1, -2, -2, -2, -2, -2, -1]
    tby = [2, 2, 2, 1, 0, -1, -2, -2, -2, -2, -2, -1, 0, 1, 2, 2]
    p1 = _n(sim.mis_row(mid), 'Param1')
    for i in range(0, 16, 2):
        _make(sim, sid, mid, tx, ty, tx + tbx[i], ty + tby[i], vel_units=p1 / 2.0)


def skill_do_4(sim, sid, row, cx, cy, tx, ty):
    """srvdo 4 (Soulshatter): creates NO missiles.
 Reads the caster's current skill +0x18 (player-data list / packet work; no missile
 create). Soulshatter's visuals come from the engine srvmissile ml1484 launch."""
    return
