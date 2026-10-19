"""Extra srvdo plug-ins ported from mxlplanner castFunctions.js (missile / visible only).

Aura / state / summon-only slots are no-ops so launch() does not report 'missing'
and the client cast path still runs.
"""
import math

from .plugins_a import _calc, _mis, _progressive_missile, _tdiv


def _noop(sim, sid, row, cx, cy, tx, ty):
    """Aura / state / damage-only: nothing for the GIF."""
    return None


# Aura / curse / toggle / summon (no missile art in the animator)
skill_do_2 = _noop
skill_do_10 = _noop
skill_do_15 = _noop
skill_do_18 = _noop
skill_do_20 = _noop
skill_do_21 = _noop
skill_do_23 = _noop
skill_do_25 = _noop
skill_do_26 = _noop
skill_do_30 = _noop
skill_do_33 = _noop
skill_do_37 = _noop
skill_do_39 = _noop
skill_do_45 = _noop
skill_do_48 = _noop
skill_do_54 = _noop
skill_do_61 = _noop
skill_do_77 = _noop
skill_do_109 = _noop
skill_do_112 = _noop
skill_do_114 = _noop
skill_do_116 = _noop
skill_do_118 = _noop
skill_do_120 = _noop
skill_do_130 = _noop
skill_do_144 = _noop
skill_do_145 = _noop


def skill_do_28(sim, sid, row, cx, cy, tx, ty):
    """srvdo 28: one srvmissilea AT the target (flags 1), within 100 cells."""
    mid = _mis(row, 'srvmissilea')
    if not mid or (tx == 0 and ty == 0):
        return
    dist = max(abs(tx - cx), abs(ty - cy)) + min(abs(tx - cx), abs(ty - cy)) // 2
    if dist > 100:
        return
    sim.spawn(mid, tx, ty, 1, 1, target=(tx, ty), sid=sid, vel=0)


def skill_do_80(sim, sid, row, cx, cy, tx, ty):
    """srvdo 80: progressive missile AT the target unit cell (flags 1)."""
    mid = _progressive_missile(sim, row)
    if not mid:
        return
    m = sim.spawn(mid, tx, ty, 1, 1, target=(tx, ty), sid=sid, vel=0)
    if m is not None:
        m.data['d28'] = 1
        m.data['d2c'] = 0


def skill_do_101(sim, sid, row, cx, cy, tx, ty):
    """srvdo 101 - Venomous Spirit: one srvmissilea flags 3 from caster toward T."""
    mid = _mis(row, 'srvmissilea')
    if not mid:
        return
    sim.spawn(mid, cx, cy, tx - cx, ty - cy, target=(tx, ty), sid=sid)


def skill_do_139(sim, sid, row, cx, cy, tx, ty):
    """srvdo 139 - Absolution: srvmissilea flags 0x21, data28=-dy, data2c=dx."""
    mid = _mis(row, 'srvmissilea')
    if not mid or (tx == 0 and ty == 0):
        return
    dx, dy = tx - cx, ty - cy
    m = sim.spawn(mid, cx, cy, dx, dy, target=(tx, ty), sid=sid)
    if m is not None:
        m.data['d28'] = -dy
        m.data['d2c'] = dx


def skill_do_29(sim, sid, row, cx, cy, tx, ty):
    """srvdo 29 - Discharge / Sentence: strike + clientSkillMessage (cltprgfunc).

    GIF stand-in: fire the progressive / clt path via clientSkillMessage once.
    """
    cw = getattr(sim, 'client', None)
    if not cw:
        return
    from . import client as CLT
    msg = {
        'skillId': sid,
        'level': sim.lvl,
        'caster': cw.get('player'),
        'target': [int(math.floor(tx)), int(math.floor(ty))],
        'targetUnit': {'id': 'enemy0', 'cell': [int(math.floor(tx)), int(math.floor(ty))],
                       'alive': True, 'hostile': True} if sim.targets else None,
        'value': 0,
        'ctx': CLT.skill_ctx(sim.client_skills.get(sid) or {}, sim.lvl),
    }
    try:
        CLT.clientSkillMessage(cw, msg)
    except Exception:
        pass


def skill_do_121(sim, sid, row, cx, cy, tx, ty):
    """srvdo 121 - contagion strike family: srvmissile toward target if present."""
    mid = _mis(row, 'srvmissile') or _mis(row, 'srvmissilea')
    if mid:
        sim.spawn(mid, cx, cy, tx - cx or 1, ty - cy or 1, target=(tx, ty), sid=sid)


def skill_do_146(sim, sid, row, cx, cy, tx, ty):
    """srvdo 146 - periodic missile: one standing missile near caster + clientSkillMessage."""
    mid = _progressive_missile(sim, row) or _mis(row, 'srvmissilea')
    radius = max(_calc(sim, sid, row, 'aurarangecalc', 0), 1)
    if not mid:
        return
    # One deterministic cell (seeded) instead of five tries.
    rx = (sim.rng.randrange(2 * radius + 1) - radius)
    ry = (sim.rng.randrange(2 * radius + 1) - radius)
    x, y = cx + rx, cy + ry
    sim.spawn(mid, x, y, 1, 1, target=(x, y), sid=sid, vel=0)
    cw = getattr(sim, 'client', None)
    if cw:
        from . import client as CLT
        try:
            CLT.clientSkillMessage(cw, {
                'skillId': sid, 'level': sim.lvl, 'caster': cw.get('player'),
                'target': [int(math.floor(x)), int(math.floor(y))],
                'targetUnit': None, 'value': 0,
                'ctx': CLT.skill_ctx(sim.client_skills.get(sid) or {}, sim.lvl),
            })
        except Exception:
            pass


def skill_do_36(sim, sid, row, cx, cy, tx, ty):
    """srvdo 36 - wall / line: srvmissilea along the aim if present."""
    mid = _mis(row, 'srvmissilea')
    if not mid:
        return
    sim.spawn(mid, cx, cy, tx - cx or 1, ty - cy or 1, target=(tx, ty), sid=sid)


def skill_do_47(sim, sid, row, cx, cy, tx, ty):
    """srvdo 47 - area filter setup; spawn srvmissilea at target when present."""
    mid = _mis(row, 'srvmissilea')
    if mid:
        sim.spawn(mid, tx, ty, 1, 1, target=(tx, ty), sid=sid, vel=0)


def skill_do_62(sim, sid, row, cx, cy, tx, ty):
    """srvdo 62 - Bone Prison style offsets around target."""
    mid = _mis(row, 'srvmissilea')
    if not mid:
        return
    # PRISON offsets from castFunctions.js
    ox = [-1, 1, 3, 4, 4, 3, -1, 1, -3, -4, -4, -3]
    oy = [-4, -4, -3, -1, 1, 3, 4, 4, 3, -1, 1, -3]
    for i in range(len(ox)):
        x, y = tx + ox[i], ty + oy[i]
        sim.spawn(mid, x, y, 1, 1, target=(x, y), sid=sid, vel=0)
