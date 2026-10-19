"""The client's draw-only visuals (port of clientVisuals.js): the missiles D2Client makes on its own
(a skill's cltmissile, cltdofunc / cltstfunc, every client missile's CltSubMissile / CltHitSubMissile,
the ExplosionMissile) and the overlays they put on units.

Draw-only: nothing here deals damage. Positions are sub-tiles in 16.16 fixed point. Worlds, missiles,
units, casts and rows are plain dicts keyed like the JS objects (camelCase). Missile ids are ints
(gamedata's 'ml123' is converted by the adapters). world['paths'] may be None (wander / spiral then fly
straight) or a dict / object with wanderStep(m), wanderWaypoints(cell, target, steps, seed{low,high}) and
spiralWaypoints(x, y)."""
import json
import math
import os
import re
from types import MappingProxyType

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, 'client_tables.json')) as f:
    CLIENT_TABLES = json.load(f)

# Tables client_tables.json does not carry yet (D2Client 0x6fb83db0 / 0x6fb83d70: the 16-step ring).
# Spray offsets: srvhit 45 / clthit 51 (D2Client SKILLS_Skills_6fb525c0).
_EXTRA_TABLES = {
    'ring16X': [0, 1, 2, 2, 2, 2, 2, 1, 0, -1, -2, -2, -2, -2, -2, -1],
    'ring16Y': [2, 2, 2, 1, 0, -1, -2, -2, -2, -2, -2, -1, 0, 1, 2, 2],
    'sprayA': [-1, 1, 1, -1],
    'sprayB': [-1, -1, 1, 1],
    'sprayP': [18, 20, 17, 20, 15, 19, 18],
    'sprayQ': [8, 2, 11, 4, 13, 6, 9],
    'sprayAxisX': [20, -20, 0, 0, 14, -14, -14, 14],
    'sprayAxisY': [0, 0, 20, -20, 14, 14, -14, -14],
}
DEFAULT_TABLES = {**_EXTRA_TABLES, **CLIENT_TABLES}

# Filled by the caller (build_client_rows); states: id -> {'active': slot}.
CLIENT_MISSILES = {}
CLIENT_SKILLS = {}
CLIENT_STATES = CLIENT_TABLES.get('states', {})

SUBTILE = 0x10000
HALF_SUBTILE = 0x8000
MASK32 = 0xffffffff
MULTIPLIER = 0x6ac690c5
MAX_CLIENT_MISSILES = 1500
CLIENT_TICK_MS = 40
MAX_SOUND_EVENTS = 512
STAND_IN_GRACE = 4
ARENA_MAP_ORIGIN = (15000, 6510)

# Optional hook for '#cN' (compiled skills.bin formula) strings: fn(text, level, params) -> number.
CALC_EVALUATOR = None


def set_calc_evaluator(fn):
    global CALC_EVALUATOR
    CALC_EVALUATOR = fn


# -- small helpers ----------------------------------------------------------------------------------

trunc = math.trunc


def i32(v):
    """JS `v | 0`."""
    if v is None:
        return 0
    if isinstance(v, float):
        if v != v or v in (math.inf, -math.inf):
            return 0
        v = trunc(v)
    v &= MASK32
    return v - 0x100000000 if v & 0x80000000 else v


def u32(v):
    """JS `v >>> 0`."""
    return i32(v) & MASK32


def _mod(a, b):
    """JS `%`: the sign follows the dividend."""
    r = abs(a) % abs(b)
    return -r if a < 0 else r


def _a(lst, i):
    return lst[i] if lst is not None and 0 <= i < len(lst) else None


def _z(lst, i):
    """lst[i] || 0"""
    return _a(lst, i) or 0


def _bad(v):
    """An id that is null or negative."""
    return v is None or v < 0


def _ge0(v):
    return v is not None and v >= 0


def _tonum(v):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return 0
    if n != n:
        return 0
    return int(n) if n == int(n) else n


def _is_int_text(v):
    return re.fullmatch(r'-?\d+', '' if v is None else str(v)) is not None


def cellOf(fixed):
    return fixed // SUBTILE


def cellCentre(cell):
    return cell * SUBTILE + HALF_SUBTILE


def _cm(world, *bases, **kw):
    """createClientMissile from merged create-struct dicts (the JS spread)."""
    s = {}
    for b in bases:
        s.update(b)
    s.update(kw)
    return createClientMissile(world, s)


def _inherit(m):
    return {'owner': m['owner'], 'skill': m['skill'], 'level': m['level'], 'ctx': m['ctx']}


def _path_fn(world, name):
    paths = world.get('paths')
    if paths is None:
        return None
    if isinstance(paths, dict):
        return paths.get(name)
    return getattr(paths, name, None)


# -- the unit seed (D2Client sub_6fab1330 / 6fab1380) -------------------------------------------------
# seed = lo * 0x6ac690c5 + hi (64-bit) -> {'lo': low 32, 'hi': high 32}

def seedOf(lo, hi=666):
    return {'lo': int(lo) & MASK32, 'hi': int(hi) & MASK32}


def seedRand(seed, n):
    """0 for n <= 0, lo & (n - 1) for a power of two, else lo % n (unsigned)."""
    nxt = seed['lo'] * MULTIPLIER + seed['hi']
    seed['lo'] = nxt & MASK32
    seed['hi'] = (nxt >> 32) & MASK32
    if n is None or not n > 0:
        return 0
    n = int(n)
    lo = seed['lo']
    return (lo & (n - 1)) if (n & (n - 1)) == 0 else lo % n


# -- paths (D2Common) ---------------------------------------------------------------------------------
DIRECTION = CLIENT_TABLES.get('direction') or []


def directionVector(x, y, targetX, targetY):
    """D2Common sub_6fd5cf40: the 4096-length direction from one 16.16 point toward another."""
    adx = abs(targetX - x)
    ady = abs(targetY - y)
    x_major = adx > ady
    major = adx if x_major else ady
    minor = ady if x_major else adx
    ratio = 0 if major == 0 else trunc(minor * 127 / major)
    short = DIRECTION[ratio * 2] if 0 <= ratio * 2 < len(DIRECTION) else 0
    long_ = DIRECTION[ratio * 2 + 1] if 0 <= ratio * 2 + 1 < len(DIRECTION) else 4096
    dx = long_ if x_major else short
    dy = short if x_major else long_
    if targetX < x:
        dx = -dx
    if targetY < y:
        dy = -dy
    return [dx, dy]


def stepPath(m):
    """One frame of path velocity and the cells the step crosses (sub_6fd5ceb0, sub_6fd5d580)."""
    if m['accel']:
        m['accelCounter'] += 1
        if m['accelCounter'] >= 5:
            m['velocity'] += m['accel']
            if m['velocity'] > m['maxVelocity']:
                m['velocity'] = m['maxVelocity']
                m['accel'] = 0
            elif m['velocity'] < 0:
                m['velocity'] = 0
            m['accelCounter'] = 0
    c = i32(m['velocity'] * 1024) >> 6
    dx = i32(m['dirX'] * c) >> 12
    dy = i32(m['dirY'] * c) >> 12
    sx = dx
    sy = dy
    while sy > SUBTILE or sy < -SUBTILE:
        sy >>= 1
        sx >>= 1
    while sx > SUBTILE or sx < -SUBTILE:
        sx >>= 1
        sy >>= 1
    end_x = m['x'] + dx
    end_y = m['y'] + dy
    cells = []
    if sx != 0 or sy != 0:
        cx = m['x']
        cy = m['y']
        cell_x = cellOf(cx)
        cell_y = cellOf(cy)
        guard = 0
        while not (cell_x == cellOf(end_x) and cell_y == cellOf(end_y)) and guard < 4096:
            guard += 1
            cx += sx
            cy += sy
            nx = cellOf(cx)
            ny = cellOf(cy)
            if nx != cell_x or ny != cell_y:
                cells.append([nx, ny])
                if len(cells) > 9:
                    break
            cell_x = nx
            cell_y = ny
    m['prevX'] = m['x']
    m['prevY'] = m['y']
    m['x'] = end_x
    m['y'] = end_y
    m['enteredCell'] = len(cells) > 0
    if cells:
        m['cellsThisFrame'] = cells


def aimAt(m, cell):
    """Re-aim a path at a cell (D2Common_10286 + 10334)."""
    m['targetCell'] = [cell[0], cell[1]]
    if m['velocity'] != 0:
        m['dirX'], m['dirY'] = directionVector(m['x'], m['y'], cellCentre(cell[0]), cellCentre(cell[1]))


def cellDistance(a, b):
    """D2Common_10080: max + trunc(min / 2) of the cell deltas."""
    dx = abs(a[0] - b[0])
    dy = abs(a[1] - b[1])
    return max(dx, dy) + trunc(min(dx, dy) / 2)


# -- the world ------------------------------------------------------------------------------------------

def wanderWaypoints(cell, target, steps, seed):
    """Path type 10 waypoints (D2Common charged-bolt walk). `seed` is {low, high} or an int."""
    from .plugins_a import charged_path
    lo = seed['low'] if isinstance(seed, dict) else seed
    pts = charged_path(cell[0], cell[1], target[0], target[1], steps, lo)
    return [[x, y] for x, y in pts]


def wanderStep(m):
    """Follow m['waypoints'] (cell coords or 16.16) at the missile's velocity. Returns entered cells."""
    pts = m.get('waypoints') or []
    i = m.get('waypointIndex') or 0
    start = [cellOf(m['x']), cellOf(m['y'])]
    remaining = abs(i32(m.get('velocity') or 0) * 1024) >> 6
    if remaining <= 0:
        remaining = SUBTILE
    while remaining > 0 and i < len(pts):
        wx, wy = pts[i][0], pts[i][1]
        if abs(wx) < 4096 and abs(wy) < 4096:
            tx = int(wx) * SUBTILE + HALF_SUBTILE
            ty = int(wy) * SUBTILE + HALF_SUBTILE
        else:
            tx, ty = int(wx), int(wy)
        dx, dy = tx - m['x'], ty - m['y']
        dist = int(math.hypot(dx, dy))
        if dist <= 0:
            i += 1
            continue
        m['dirX'] = int(dx * 4096 / dist)
        m['dirY'] = int(dy * 4096 / dist)
        step = remaining if remaining < dist else dist
        m['x'] += int(dx * step / dist)
        m['y'] += int(dy * step / dist)
        remaining -= step
        if step >= dist:
            i += 1
    m['waypointIndex'] = i
    end = [cellOf(m['x']), cellOf(m['y'])]
    return [end] if end != start else []


CLIENT_PATHS = {'wanderWaypoints': wanderWaypoints, 'wanderStep': wanderStep}


def createClientWorld(missiles=None, skills=None, tables=None, seed=1, paths=None):
    """A client world. `missiles` / `skills`: dicts of int id -> adapted row (build_client_rows)."""
    return {
        'paths': CLIENT_PATHS if paths is None else paths,
        'playerSeed': seedOf(seed + 1, 666),   # the client's copy of the player's own unit seed
        'stored': {},                          # cltst 21's stored target (x, y, row) per skill
        'rows': missiles if missiles is not None else CLIENT_MISSILES,
        'skills': skills if skills is not None else CLIENT_SKILLS,
        'tables': tables if tables is not None else DEFAULT_TABLES,
        'missiles': [],
        'overlays': [],
        'tick': 0,
        'nextId': 1,
        'seed': seedOf(seed, 666),
        'created': set(),
        'capped': False,
        'units': [],
        'owners': {},
        'player': None,
        'sounds': [],
        'unitHeights': {},
        'shake': None,
        'shakeOffset': {'x': 0, 'y': 0},
    }


# -- the screen shake (state is kept; the GIF camera is static so nothing reads the offset) -----------

def screenShake(world, amplitude, up, down, hold):
    """WARDEN_6fb39f00: with hold 0 nothing; else the shake restarts now."""
    if not hold:
        return
    world['shake'] = {'start': world['tick'], 'up': u32(up), 'hold': u32(hold), 'down': u32(down),
                      'amplitude': i32(amplitude)}


def stepShake(world):
    """WARDEN_6fb3afd0: the camera offset of one frame, on the player's unit seed."""
    sh = world['shake']
    world['shakeOffset'] = {'x': 0, 'y': 0}
    if not sh:
        return
    t = max(0, (world['tick'] - sh['start']) * CLIENT_TICK_MS)
    if t > sh['up'] + sh['hold'] + sh['down']:
        world['shake'] = None
        return
    if t < sh['up']:
        u = (sh['amplitude'] * t) // sh['up'] if sh['up'] else 0
    elif t < sh['up'] + sh['hold']:
        u = sh['amplitude']
    else:
        u = (sh['amplitude'] * (sh['down'] - t + sh['hold'] + sh['up'])) // sh['down'] if sh['down'] else 0
    if not u:
        return
    x = seedRand(world['playerSeed'], 2 * u) - u
    y = seedRand(world['playerSeed'], 2 * u) - u
    world['shakeOffset'] = {'x': x, 'y': y}


# -- client missile sounds (no-op: events are queued on world['sounds']) --------------------------------

def missileSound(world, kind, m):
    if m.get('shadow') or world.get('sounds') is None:
        return
    if len(world['sounds']) >= MAX_SOUND_EVENTS:
        world['sounds'].pop(0)
    world['sounds'].append({'kind': kind, 'missile': m['defId'], 'id': m['id'],
                            'pos': {'x': m['x'] / SUBTILE, 'y': m['y'] / SUBTILE}})


def mapOriginCell(world):
    """Map cell (0, 0) in the arena's own cells."""
    origin = (world.get('mapOrigin') if world else None) or ARENA_MAP_ORIGIN
    return [-origin[0], -origin[1]]


def _row_of(world, mid):
    if mid is None or mid < 0:
        return None
    rows = world['rows']
    if isinstance(rows, dict):
        return rows.get(mid)
    return rows[mid] if mid < len(rows) else None


def rowMoves(mid, level=0, rows=None):
    """Whether a row moves when the creator makes it (UNIT_Missile_6fb630f0)."""
    rows = CLIENT_MISSILES if rows is None else rows
    row = None if mid is None or mid < 0 else (rows.get(mid) if isinstance(rows, dict) else _a(rows, mid))
    if not row:
        return False
    v = (trunc((row.get('velLev') or 0) * i32(level) / 8) + (row.get('vel') or 0)) * 256
    return trunc(v * 75 / 100) != 0


def unitCell(unit):
    return [cellOf(unit['x']), cellOf(unit['y'])] if unit is not None else None


def ownerStep(world, owner):
    """The owner's 8-way step (SKILLS_Skills_6fb50b30): the step whose vector is nearest the facing."""
    step = world['tables'].get('ownerStep') or {'x': [0, -1, -2, -1, 0, 1, 2, 1], 'y': [2, 1, 0, -1, -2, -1, 0, 1]}
    fx, fy = (owner.get('facing') if owner else None) or [1, 1]
    best = 0
    score = -math.inf
    for k in range(8):
        ln = math.hypot(step['x'][k], step['y'][k]) or 1
        dot = (step['x'][k] * fx + step['y'][k] * fy) / ln
        if dot > score:
            score = dot
            best = k
    cell = unitCell(owner)
    return [cell[0] + step['x'][best], cell[1] + step['y'][best]]


def createClientMissile(world, s):
    """D2Client UNIT_Missile_6fb630f0: the client missile creator. `s` is the create struct by name
    (flags, owner, source / sourceCell, targetUnit, id, offset, target, velocity, skill, level, loops,
    elapsed, activate, range, ctx, exactPos, height, shadow, callback). Returns the missile or None."""
    row = _row_of(world, s.get('id'))
    if not row:
        return None
    if len(world['missiles']) >= MAX_CLIENT_MISSILES:
        world['capped'] = True
        return None
    flags = i32(s.get('flags'))
    level = i32(s.get('level'))
    owner = s.get('owner')
    source = s.get('sourceCell') if flags & 1 else unitCell(s.get('source'))
    if source is None:
        return None
    if flags & 2:
        off = s.get('offset')
        target = [source[0] + (i32(_a(off, 0)) if off else 0), source[1] + (i32(_a(off, 1)) if off else 0)]
    elif flags & 0x20:
        tg = s.get('target')
        target = [i32(_a(tg, 0)), i32(_a(tg, 1))]
    else:
        target = [source[0], source[1]]
    if flags & 4:
        velocity = i32(s.get('velocity')) if flags & 0x10 else i32(s.get('velocity')) * 256
    else:
        velocity = (trunc((row.get('velLev') or 0) * level / 8) + (row.get('vel') or 0)) * 256
    velocity = trunc(velocity / 100) * 75 if velocity > 0x100000 else trunc(velocity * 75 / 100)
    target_unit = s.get('targetUnit')
    if velocity != 0:
        if owner is not None and target_unit is None and target[0] == source[0] and target[1] == source[1]:
            target = ownerStep(world, owner)
        if owner is not None and target_unit is not None and target_unit is not owner:
            o = unitCell(owner)
            t = unitCell(target_unit)
            if o[0] == t[0] and o[1] == t[1]:
                target = ownerStep(world, owner)
                target_unit = None
        if target_unit is not None:
            target = unitCell(target_unit)
        if abs(target[0] - source[0]) >= 100 or abs(target[1] - source[1]) >= 100:
            return None
    if flags & 0x8000:
        rng = i32(s.get('range'))
    else:
        rng = (row.get('range') or 0) + (row.get('levRange') or 0) * level
    if not (flags & 0x8000) and (flags & 8) and row.get('subLoop'):
        rng += ((row.get('subStop') or 0) - (row.get('subStart') or 0)) * i32(s.get('loops'))
    anim_start = 0
    if flags & 0x200:
        rng -= i32(s.get('elapsed'))
        anim_start = i32(s.get('elapsed'))
    activate = i32(s.get('activate')) if flags & 0x800 else (row.get('activate') or 0)
    exact = s.get('exactPos')
    x = exact[0] if exact else cellCentre(source[0])
    y = exact[1] if exact else cellCentre(source[1])
    seed = seedOf(seedRand(world['seed'], 0x7fffffff) + 1, 666)
    dirx, diry = directionVector(x, y, cellCentre(target[0]), cellCentre(target[1])) if velocity != 0 else (0, 0)
    # A client copy of a row the server also fires is a shadow until the server's copy is seen.
    stand_in = not s.get('shadow') and bool(row.get('server'))
    m = {
        'id': world['nextId'],
        'defId': s['id'],
        'def': row,
        'ownerId': owner.get('id') if owner else None,
        'owner': owner,
        'level': level,
        'skill': s.get('skill'),
        'ctx': s.get('ctx'),
        'x': x,
        'y': y,
        'prevX': x,
        'prevY': y,
        'dirX': dirx,
        'dirY': diry,
        'drawDir64': None,
        'velocity': velocity,
        'maxVelocity': (row.get('maxVel') or 0) * 256,
        'accel': row.get('accel') or 0,
        'accelCounter': 0,
        'frames': rng,
        'total': rng,
        'activateFrame': rng - activate,
        'data28': 0,
        'data2c': 0,
        'seed': seed,
        'targetCell': target,
        'targetUnit': target_unit['id'] if target_unit is not None else None,
        'lastCollideId': (owner.get('id') if owner else None) if row.get('lastCollide') else None,
        'cellsThisFrame': [source],
        'enteredCell': False,
        'born': world['tick'],
        'animStart': anim_start,
        'height': None,
        'shadow': bool(s.get('shadow')) or stand_in,
        'standIn': stand_in,
        'firstFrameAgain': False,
        'dead': False,
    }
    world['nextId'] += 1
    if flags & 0x2000:
        m['drawDir64'] = seedRand(seed, 64)
    if flags & 0x400 and i32(velocity << 4) != 0:
        frames = trunc(i32(max(1, cellDistance(source, target)) << 16) / i32(velocity << 4))
        m['frames'] = frames
        m['total'] = frames
    if flags & 0x100:
        m['height'] = makeHeight()
        arcHeight(m['height'], m['total'], i32(s.get('height')))
        stepHeight(m['height'])
    m['firstFrameAgain'] = owner is not None and owner.get('local') is True
    world['missiles'].append(m)
    world['created'].add(s['id'])
    cb = s.get('callback')
    if callable(cb):
        cb(m)
    missileSound(world, 'travel', m)
    return m


# -- the height state (D2Client gfx +0x30) ----------------------------------------------------------------

def makeHeight(flags=8, x=0, y=0, z=0, vx=0, vy=0, vz=0, ax=0, ay=0, az=0):
    return {'flags': flags, 'x': x * 2048, 'y': y * 2048, 'z': z * 2048, 'vx': vx * 2048, 'vy': vy * 2048,
            'vz': vz * 2048, 'ax': ax * 2048, 'ay': ay * 2048, 'az': az * 2048, 'counter': 0}


def arcHeight(h, frames, height):
    """SKILLS_SkillsBar_6fb77c80: a timed arc over `frames` from `height`."""
    h['flags'] |= 2
    h['counter'] = max(1, i32(frames))
    h['x'] = 0
    h['y'] = 0
    h['z'] = height * 2048
    if h['az'] == 0:
        h['az'] = -4096
    h['vx'] = 0
    h['vy'] = 0
    t = h['counter']
    h['vz'] = trunc((-h['z'] - trunc(t * t * h['az'] / 2)) / t)


def stepHeight(h):
    """sub_6fb77fb0, one step."""
    if h['flags'] & 1:
        return
    h['x'] += h['vx']
    h['vx'] += h['ax']
    h['y'] += h['vy']
    h['vy'] += h['ay']
    h['z'] += h['vz']
    h['vz'] += h['az']
    if h['flags'] & 2:
        if h['counter']:
            h['counter'] -= 1
        else:
            h['flags'] |= 1
            h['x'] = 0
            h['y'] = 0
    if not (h['flags'] & 1) and (h['x'] >> 11) <= 0 and (h['y'] >> 11) <= 0 and (h['z'] >> 11) <= 0:
        h['x'] = 0
        h['y'] = 0
        h['z'] = 0
        h['flags'] |= 1


def heightOffset(h):
    """The drawn offset in screen pixels."""
    if not h:
        return None
    x = h['x'] >> 11
    y = h['y'] >> 11
    return {'x': (x - y) >> 1, 'y': ((x + y) >> 2) - (h['z'] >> 11)}


def elapsedOf(m):
    return m['total'] - m['frames']


def cellOfMissile(m):
    return [cellOf(m['x']), cellOf(m['y'])]


def child60450(world, parent, mid, **extra):
    """sub_6fb60450: flags 0x20 from the parent's cell to map cell (0, 0)."""
    if not parent['owner']:
        return None
    return _cm(world, {'flags': 0x20, 'owner': parent['owner'], 'source': parent, 'id': mid,
                       'target': mapOriginCell(world), 'skill': parent['skill'], 'level': parent['level'],
                       'ctx': parent['ctx']}, extra)


def childWithDirection(world, parent, mid):
    c = child60450(world, parent, mid)
    if c:
        c['drawDir'] = [parent['dirX'], parent['dirY']]
    return c


def skillNumber(holder, key):
    """The cast's number a client function reads: calc1..4, auraRange, param3, ... (holder['ctx'])."""
    ctx = holder.get('ctx')
    return _tonum(ctx.get(key)) if ctx else 0


# -- the hit handler, D2Client UNIT_Missile_6fb61420 -------------------------------------------------------

def hitHandler(world, m, unit, wall):
    row = m['def']
    if unit is not None:
        if row.get('lastCollide') and m.get('lastCollideId') == unit.get('id'):
            return 0
        m['lastCollideId'] = unit.get('id')
    if unit is None and not wall and not row.get('alwaysExplode'):
        m['dead'] = True
        return 0
    fn = CLT_HIT.get(row.get('cltHit'))
    if (row.get('cltHit') or 0) > 0 and fn:
        if fn(world, m, unit) == 0:
            return 0
    missileSound(world, 'hit', m)
    ex = row.get('explosionMissile')
    if ex is not None and ex >= 0:
        e = createClientMissile(world, {'flags': 0x20, 'owner': m['owner'], 'source': m, 'id': ex,
                                        'target': mapOriginCell(world), 'skill': m['skill'],
                                        'level': m['level'], 'ctx': m['ctx']})
        if e:
            e['drawDir'] = [m['dirX'], m['dirY']]
            if ex == 146:
                e['drawDir64'] = seedRand(e['seed'], 64)
            if m['height']:
                e['height'] = {**makeHeight(), 'x': m['height']['x'], 'y': m['height']['y'],
                               'z': m['height']['z']}
            silenced = e['shadow']
            e['shadow'] = False
            e['standIn'] = False
            if silenced:
                missileSound(world, 'travel', e)
    if unit is not None and not row.get('collideKill'):
        return 0
    m['dead'] = True
    return 0


# -- client do functions (missiles.bin +0x08) -----------------------------------------------------------

def touches(cell, size, ucell, usize):
    reach = max(0, i32(size) - 1) + max(0, i32(usize) - 1)
    return abs(cell[0] - ucell[0]) <= reach and abs(cell[1] - ucell[1]) <= reach


def _hostile(m, u):
    if m['def'].get('lastCollide') and m.get('lastCollideId') == u.get('id'):
        return False
    return (not m['owner']) or u.get('hostile') is not False or bool(m['def'].get('collideFriend'))


def collideTest(m, u, ct):
    """The collide-type unit tests (D2Client 0x6fb61200 / 0x6fb61240 / 0x6fb611d0)."""
    monster = not u.get('player')
    if ct == 1:
        return _hostile(m, u) if u.get('player') else False
    if ct in (2, 5):
        return monster and _hostile(m, u)
    if ct in (3, 8, 9):
        return _hostile(m, u)
    return False


def remove(m):
    m['dead'] = True


def do1(world, m):
    """do 1 - D2Client 0x6fb617c0: the flight."""
    if m.get('mirror'):
        return
    for pass_ in range(2):
        active = m['frames'] <= m['activateFrame']
        h = m['height']
        if h and h['flags'] & 1 and not (h['flags'] & 8):
            hitHandler(world, m, None, True)
            return
        wander = _path_fn(world, 'wanderStep')
        if m.get('waypoints') is not None and wander:
            m['prevX'] = m['x']
            m['prevY'] = m['y']
            cells = wander(m)
            m['enteredCell'] = bool(cells)
            if cells:
                m['cellsThisFrame'] = cells
        elif m['velocity'] != 0:
            stepPath(m)
        else:
            m['enteredCell'] = False
        m['frames'] -= 1
        if m['frames'] < 1:
            hitHandler(world, m, None, False)
            return
        if not active:
            return
        ct = m['def'].get('collideType') or 0
        if ct == 0 or ct == 6:
            return
        if m['def'].get('clientCol'):
            for cell in m.get('cellsThisFrame') or []:
                unit = next((u for u in world['units']
                             if u.get('alive') and u.get('id') != m['ownerId']
                             and touches(cell, m['def'].get('size') or 0, u['cell'], u.get('size') or 1)
                             and collideTest(m, u, ct)), None)
                if unit is not None:
                    hitHandler(world, m, unit, False)
                    return
        if pass_ == 0 and m['firstFrameAgain'] and elapsedOf(m) == 1 and m['velocity'] != 0:
            m['firstFrameAgain'] = False
            continue
        return


def do19(world, m):
    """do 19 - D2Sigma 0x10089360: Median's emitter."""
    row = m['def']
    sub = _a(row.get('cltSubMissiles'), 0)
    if _bad(sub):
        return
    period = max(1, _z(row.get('cltParams'), 0))
    if _mod(elapsedOf(m), period) == 0:
        i = abs(_mod(m['data28'], 64))
        t = world['tables']
        _cm(world, flags=2, owner=m['owner'], source=m, id=sub, offset=[t['circle19X'][i], t['circle19Y'][i]],
            skill=m['skill'], level=m['level'], ctx=m['ctx'])
        m['data28'] = _mod(_z(row.get('cltParams'), 1) + i, 64)
    do1(world, m)


def do9(world, m):
    """do 9 - 0x6fb68f00: two converging children at elapsed 0."""
    row = m['def']
    sub = row.get('cltSubMissiles') or []
    if _bad(_a(sub, 0)):
        remove(m)
        return
    if elapsedOf(m) == 0:
        a = max(1, _z(row.get('cltParams'), 0))
        b = max(1, _z(row.get('cltParams'), 1))
        c = max(1, _z(row.get('cltParams'), 2))

        def make(mid):
            child = _cm(world, flags=1, sourceCell=cellOfMissile(m), owner=m['owner'], id=mid,
                        skill=m['skill'], level=m['level'], ctx=m['ctx'])
            if child:
                child['height'] = makeHeight(x=-(c * a), z=a * b, vx=c, vz=-b)

        make(sub[0])
        if _a(sub, 1) is not None and sub[1] > 0:
            make(sub[1])
    if elapsedOf(m) == m['total'] - 2:
        missileSound(world, 'stop', m)
        missileSound(world, 'prog', m)
    do1(world, m)


def trail(world, m, copy_parent):
    """do 8 - 0x6fb691c0 / do 18 - 0x6fb68960: one child per newly entered cell after InitSteps."""
    row = m['def']
    sub = _a(row.get('cltSubMissiles'), 0)
    if _bad(sub):
        if copy_parent:
            do1(world, m)
        else:
            remove(m)
        return
    if elapsedOf(m) >= (row.get('initSteps') or 0) and m['enteredCell']:
        child = _cm(world, flags=1, sourceCell=cellOfMissile(m), owner=m['owner'], id=sub, skill=m['skill'],
                    level=m['level'], ctx=m['ctx'], exactPos=[m['x'], m['y']] if copy_parent else None)
        if child:
            child['drawDir'] = [m['dirX'], m['dirY']]
            if not copy_parent:
                ln = child['def'].get('animLen') or 0
                child['animStart'] = seedRand(child['seed'], ln) if ln > 0 else 0
    do1(world, m)


def do8(world, m):
    trail(world, m, False)


def do18(world, m):
    trail(world, m, True)


def do20(world, m):
    """do 20 - 0x6fb629b0: the 45-degree turn (server do 16's twin)."""
    row = m['def']
    p = row.get('cltParams')
    period = max(1, _z(p, 1))
    e = elapsedOf(m)
    if e < _z(p, 0) and _mod(e, period) == 0:
        a = m['data28']
        b = m['data2c']
        nx = trunc((a - b) / 2)
        ny = trunc((a + b) / 2)
        cell = cellOfMissile(m)
        aimAt(m, [cell[0] + nx, cell[1] + ny])
        m['data28'] = nx
        m['data2c'] = ny
    do1(world, m)


def do4(world, m):
    """do 4 - 0x6fb6be00 -> sub_6fb69470: a random burst."""
    row = m['def']
    p = row.get('cltParams')
    p1, p2, p3 = _z(p, 0), _z(p, 1), _z(p, 2)
    sub = _a(row.get('cltSubMissiles'), 0)
    if _ge0(sub) and not (m['frames'] != 0 and seedRand(m['seed'], p1) > 0):
        cell = cellOfMissile(m)
        for _ in range(p2):
            r = p3
            dx = seedRand(m['seed'], 2 * r) - r if 2 * r > 0 else -r
            dy = seedRand(m['seed'], 2 * r) - r if 2 * r > 0 else -r
            dx += -r if dx < 0 else r
            dy += -r if dy < 0 else r
            _cm(world, flags=0x20, owner=m['owner'], source=m, target=[cell[0] + dx, cell[1] + dy], id=sub,
                skill=m['skill'], level=m['level'], ctx=m['ctx'])
    do1(world, m)


def do52(world, m):
    """do 52 - 0x6fb672d0: per new cell, two children at cell +/- (data28, data2c)."""
    sub = _a(m['def'].get('cltSubMissiles'), 0)
    if _bad(sub) or not m['owner']:
        remove(m)
        return
    if m['enteredCell']:
        for sign in (1, -1):
            _cm(world, flags=2, owner=m['owner'], source=m, offset=[sign * m['data28'], sign * m['data2c']],
                id=sub, skill=m['skill'], level=m['level'], ctx=m['ctx'])
    do1(world, m)


def do6(world, m):
    """do 6 - 0x6fb692b0: per new cell, one of CltSubMissile1-3 at the cell."""
    if not m['enteredCell']:
        do1(world, m)
        return
    sub = m['def'].get('cltSubMissiles') or []
    if _bad(_a(sub, 0)):
        remove(m)
        return
    cell = cellOfMissile(m)
    flags = 0x21
    first = _row_of(world, sub[0])
    rng = (first.get('range') or 0) if first else 0
    if rng:
        flags |= 0x8000
    mid = sub[0]
    if _ge0(_a(sub, 1)) and _ge0(_a(sub, 2)):
        mid = [sub[1], sub[2], sub[0]][seedRand(m['seed'], 3)]
    elif _ge0(_a(sub, 1)):
        mid = sub[1] if seedRand(m['seed'], 2) == 0 else sub[0]
    _cm(world, flags=flags, sourceCell=cell, target=cell, owner=m['owner'], id=mid, skill=m['skill'],
        level=m['level'], ctx=m['ctx'], range=rng, exactPos=[m['x'], m['y']])
    do1(world, m)


def do3(world, m):
    """do 3 - 0x6fb6be60 -> sub_6fb69650: per new cell, one static child."""
    sub = _a(m['def'].get('cltSubMissiles'), 0)
    if m['enteredCell'] and _ge0(sub):
        calc = m['def'].get('cltCalc')
        v = int(calc) if _is_int_text(calc) else 0
        _cm(world, flags=5 | (8 if v > 0 else 0), sourceCell=cellOfMissile(m), source=m, velocity=0,
            owner=m['owner'], id=sub, skill=m['skill'], level=m['level'], ctx=m['ctx'], loops=2 * m['level'] - 2)
    do1(world, m)


def do27(world, m):
    """do 27 - 0x6fb68130: a trail plus a random 3/4-scaled turn."""
    if not m['owner']:
        do1(world, m)
        return
    row = m['def']
    sub = _a(row.get('cltSubMissiles'), 0)
    if sub is not None and sub > 0 and m['enteredCell']:
        _cm(world, flags=0, owner=m['owner'], source=m, id=sub, skill=m['skill'], level=m['level'], ctx=m['ctx'])
    period = max(1, _z(row.get('cltParams'), 0))
    if _mod(elapsedOf(m), period) == 0:
        a = m['data28']
        b = m['data2c']
        r = seedRand(m['seed'], 4)
        nx, ny = a, b
        if r == 0:
            nx = trunc(3 * (a - b) / 4)
            ny = trunc(3 * (a + b) / 4)
        elif r == 2:
            nx = trunc(3 * (a + b) / 4)
            ny = trunc(3 * (b - a) / 4)
        cell = cellOfMissile(m)
        aimAt(m, [cell[0] + nx, cell[1] + ny])
        m['data28'] = nx
        m['data2c'] = ny
    do1(world, m)


def do29(world, m):
    """do 29 - 0x6fb6c210: a hard-coded timeline (e = elapsed)."""
    if not m['owner']:
        do1(world, m)
        return
    row = m['def']
    subs = row.get('cltSubMissiles') or []
    s1, s2, s3 = _a(subs, 0), _a(subs, 1), _a(subs, 2)
    e = elapsedOf(m)
    rng = row.get('range') or 0
    cell = cellOfMissile(m)
    base = {'owner': m['owner'], 'skill': m['skill'], 'level': m['level'], 'ctx': m['ctx']}
    if s1 is not None and s1 > 0 and e > 10:
        if e < 30:
            k = 1
        elif e < 85:
            k = trunc((e - 15) / 4)
        elif e < rng - 50:
            k = 12
        elif e < rng:
            k = 12 - trunc((e - (rng - 50)) / 4)
        else:
            k = 1
        r1 = _row_of(world, s1)
        grand = _a(r1.get('cltSubMissiles'), 0) if r1 else None
        if grand is not None and grand > 0:
            n = min(7 * k, 8)
            for _ in range(n):
                g = _cm(world, base, flags=0, source=m, id=grand)
                if g:
                    spread = 7 * k
                    gp = g['def'].get('cltParams')
                    ox = seedRand(m['seed'], spread) - trunc(spread / 2)
                    oy = seedRand(m['seed'], spread) - trunc(spread / 2)
                    g['height'] = makeHeight(flags=0, x=ox, y=oy, z=_z(gp, 0), vz=seedRand(m['seed'], _z(gp, 1)),
                                             az=_z(gp, 2))
        if not (_mod(e, 2) == 1) and not (k < 3 and _mod(e, 16) != 0):
            n = 1 if k < 3 else 2 if k < 6 else 3 if k < 9 else 4
            dx = seedRand(m['seed'], n) - trunc(n / 2) if n > 1 else 0
            dy = seedRand(m['seed'], n) - trunc(n / 2) if n > 1 else 0
            _cm(world, base, flags=1, sourceCell=[cell[0] + dx, cell[1] + dy], id=s1)
    # at e == 90 with CltParam2 c > 0 the screen shakes (amplitude 8)
    c = _z(row.get('cltParams'), 1)
    if c > 0 and e == 90:
        q = trunc(c / 3)
        screenShake(world, 8, q * 1000, q * 1000, (c - 2 * q) * 1000)
    if s2 is not None and s2 > 0 and _mod(e, max(1, _z(row.get('cltParams'), 0))) == 0:
        ox = seedRand(m['seed'], 41) - 20
        oy = seedRand(m['seed'], 41) - 20
        if ox == 0 and oy == 0:
            ox = seedRand(m['seed'], 19) + 1
        c2 = _cm(world, base, flags=2, source=m, offset=[ox, oy], id=s2)
        if c2:
            c2['data28'] = ox
            c2['data2c'] = oy
    if s3 is not None and s3 > 0 and 115 < e < 315:
        calls = [6, 6] if 200 < e < 225 else ([20] if _mod(e, 4) == 0 else [])
        for r in calls:
            r3 = _row_of(world, s3)
            mid = s3
            top = _a(r3.get('cltSubMissiles'), 0) if r3 else None
            if top is not None and mid < top:
                mid += seedRand(m['seed'], top - mid + 1)
            for _ in range(4):
                dx = seedRand(m['seed'], 2 * r + 1) - r
                dy = seedRand(m['seed'], 2 * r + 1) - r
                if dx * dx + dy * dy > r * r:
                    continue
                c3 = _cm(world, base, flags=1, sourceCell=[cell[0] + dx, cell[1] + dy], id=mid)
                if c3:
                    cp = c3['def'].get('cltParams')
                    mult = 2 if r == 6 else 1
                    c3['height'] = makeHeight(flags=0, z=_z(cp, 0) * mult, vz=-_z(cp, 1) * mult)
                break
    do1(world, m)


def debris(world, m, spread, period):
    """do 10 - 0x6fb6bd40 / do 13 - 0x6fb6bc10: falling debris in a square."""
    row = m['def']
    sub = row.get('cltSubMissiles') or []
    if _bad(_a(sub, 0)):
        remove(m)
        return
    mid = sub[0]
    if _a(sub, 1) is not None and sub[0] < sub[1]:
        mid += seedRand(m['seed'], sub[1] - sub[0] + 1)
    e = elapsedOf(m)
    if period > 0 and _mod(e, period) == 0 and m['owner']:
        cell = cellOfMissile(m)
        m['seed'] = seedOf(e + cell[0], 666)
        span = 2 * (spread - 1)
        dx = (spread - 1) - seedRand(m['seed'], span)
        dy = (spread - 1) - seedRand(m['seed'], span)
        c = _cm(world, flags=0x2003, sourceCell=[cell[0] + dx, cell[1] + dy], offset=[0, 0], owner=m['owner'],
                id=mid, skill=m['skill'], level=m['level'], ctx=m['ctx'])
        if c:
            cp = c['def'].get('cltParams')
            c2 = max(1, _z(cp, 1))
            c1 = max(_z(cp, 0), c2)
            c['height'] = makeHeight(z=c1, vz=-c2)
            c['total'] = trunc(c1 / c2)
            c['frames'] = c['total']
    do1(world, m)


def do10(world, m):
    p = m['def'].get('cltParams')
    q = trunc(m['level'] / max(1, _z(p, 2)))
    debris(world, m, _z(p, 0) + max(2, q), max(3, _z(p, 1) - q))


def do13(world, m):
    s = skillNumber(m, 'calc1')
    p = skillNumber(m, 'calc2')
    if p == 0 or s <= 0:
        remove(m)
        return
    debris(world, m, s, p)


def do11(world, m):
    """do 11 - 0x6fb62dc0: stop once the animation ends."""
    ln = m['def'].get('animLen') or 0
    if ln > 0 and elapsedOf(m) + m['animStart'] >= ln - 1:
        m['dead'] = True
        return
    do1(world, m)


def discFill(world, m, mid, radius, step, chance):
    """sub_6fb66d40: every cell of the disc kept when the chance passes, flags 0x201."""
    x, y = cellOfMissile(m)
    row = _row_of(world, mid)
    step = max(1, step)
    for dy in range(-radius, radius + 1, step):
        for dx in range(-radius, radius + 1, step):
            if dx * dx + dy * dy > radius * radius:
                continue
            if chance > 0 and seedRand(m['seed'], chance) != 0:
                continue
            rs = (row.get('randStart') or 0) if row else 0
            elapsed = seedRand(m['seed'], rs) if rs > 0 else 0
            _cm(world, flags=0x201, sourceCell=[x + dx, y + dy], owner=m['owner'], id=mid, skill=m['skill'],
                level=m['level'], ctx=m['ctx'], elapsed=elapsed)


def do17(world, m):
    """do 17 - 0x6fb6bb40: a disc fill every 3 frames from the stream fields cltdo 8 / 30 write."""
    stream = m.get('stream')
    mid = stream['missile'] if stream and stream.get('missile') is not None else -1
    if mid == 0:
        s0 = _a(m['def'].get('cltSubMissiles'), 0)
        mid = s0 if s0 is not None else -1
    n = (stream.get('range') or 0) if stream else 0
    if mid is None or mid < 0 or n <= 0:
        remove(m)
        return
    e = elapsedOf(m)
    if e < _z(m['def'].get('cltParams'), 0) and _mod(e, 3) == 0:
        discFill(world, m, mid, n, 2 if n > 4 else 1, trunc(n / 2) if n > 4 else n)
    do1(world, m)


def do49(world, m):
    """do 49 - 0x6fb62720: a child every CltParam1 frames."""
    sub = _a(m['def'].get('cltSubMissiles'), 0)
    if _bad(sub):
        remove(m)
        return
    if _mod(elapsedOf(m), max(1, _z(m['def'].get('cltParams'), 0))) == 0:
        childWithDirection(world, m, sub)
    do1(world, m)


def do50(world, m):
    """do 50 - 0x6fb6b2a0: lobbed children at random cells of a square round the missile."""
    row = m['def']
    sub = _a(row.get('cltSubMissiles'), 0)
    if _bad(sub) or m['skill'] is None:
        remove(m)
        return
    p = row.get('cltParams')
    r = _z(p, 1)
    if r < 1:
        r = max(1, skillNumber(m, 'auraRange'))
    period = _z(p, 0)
    if period < 1:
        period = max(1, skillNumber(m, 'calc4'))
    e = elapsedOf(m)
    if _z(p, 2) < e < _z(p, 3) and _mod(e, period) == 0:
        m['seed'] = seedOf(m['data28'], 666)
        cell = cellOfMissile(m)
        x = seedRand(m['seed'], 2 * r + 1) - r + cell[0]
        y = seedRand(m['seed'], 2 * r + 1) - r + cell[1]
        m['data28'] = i32(m['seed']['lo'])
        if m['owner']:
            _cm(world, flags=0x521, owner=m['owner'], sourceCell=cell, target=[x, y], id=sub,
                height=_z(p, 4) or 30, skill=m['skill'], level=m['level'], ctx=m['ctx'])
    do1(world, m)


def do15(world, m):
    """do 15 - 0x6fb68bc0: a seeker."""
    row = m['def']
    p = row.get('cltParams')
    if not m['owner'] or not (m['data28'] > -_z(p, 1)):
        remove(m)
        return
    d = m['data28']
    if d <= 0:
        m['data28'] = d - 1
    if m['velocity'] == 0:
        do1(world, m)
        return
    tu = None
    if m['targetUnit'] is not None:
        tu = next((u for u in world['units'] if u.get('id') == m['targetUnit'] and u.get('alive')), None)
    period = _z(p, 2) if _z(p, 2) > 0 else 5
    if tu is not None and _mod(m['frames'], period) == 0 and d > 0 \
            and cellDistance(cellOfMissile(m), tu['cell']) < _z(p, 3):
        step = max(1, _z(p, 4))
        mx, my = cellOfMissile(m)
        sx = step if tu['cell'][0] > mx else -step if tu['cell'][0] < mx else 0
        sy = step if tu['cell'][1] > my else -step if tu['cell'][1] < my else 0
        aimAt(m, [mx + sx, my + sy])
    sub = _a(row.get('cltSubMissiles'), 0)
    if sub is not None and sub > 0 and _mod(m['frames'], max(1, _z(p, 0))) == 0 and d > 0:
        c = _cm(world, flags=5, velocity=0, sourceCell=cellOfMissile(m), owner=m['owner'], id=sub,
                skill=m['skill'], level=m['level'], ctx=m['ctx'])
        if c:
            c['data28'] = 0
    do1(world, m)


def do46(world, m):
    """do 46 - 0x6fb67880: client twin of server do 22."""
    row = m['def']
    sub = _a(row.get('cltSubMissiles'), 0)
    if _bad(sub):
        remove(m)
        return
    cell = cellOfMissile(m)
    if elapsedOf(m) < 2 and m.get('targetCell'):
        m['data28'] = -(m['targetCell'][1] - cell[1])
        m['data2c'] = m['targetCell'][0] - cell[0]
    if m['enteredCell']:
        base = {'flags': 0xb, 'sourceCell': cell, 'owner': m['owner'], 'id': sub, 'skill': m['skill'],
                'level': m['level'], 'ctx': m['ctx'], 'loops': _z(row.get('cltParams'), 0)}
        _cm(world, base, offset=[m['data28'], m['data2c']])
        _cm(world, base, offset=[-m['data28'], -m['data2c']])
    do1(world, m)


def do48(world, m):
    """do 48 - 0x6fb675c0: random cells round the missile, CltSubMissile1 / 2 there."""
    row = m['def']
    sub = row.get('cltSubMissiles') or []
    if _bad(_a(sub, 0)) or not m['owner'] or m['skill'] is None:
        remove(m)
        return
    a = skillNumber(m, 'calc1')
    period = max(1, skillNumber(m, 'calc2'))
    e = elapsedOf(m)
    if _mod(e, period) == 0:
        cell = cellOfMissile(m)
        m['seed'] = seedOf(cell[0] + e, 666)
        half = a - 1
        x = seedRand(m['seed'], 2 * half) - half + cell[0]
        y = seedRand(m['seed'], 2 * half) - half + cell[1]
        base = {'flags': 0x2001, 'owner': m['owner'], 'sourceCell': [x, y], 'skill': m['skill'],
                'level': m['level'], 'ctx': m['ctx']}
        _cm(world, base, id=sub[0])
        if _ge0(_a(sub, 1)):
            _cm(world, base, id=sub[1])
    do1(world, m)


def do56(world, m):
    """do 56 - 0x6fb670a0: leading (CltSubMissile k, CltParam k+2) pairs, each child's hit handler run at once."""
    row = m['def']
    sub = row.get('cltSubMissiles') or []
    p = row.get('cltParams') or []
    n = 0
    while n < 3 and _ge0(_a(sub, n)) and _z(p, n + 1) > 0:
        n += 1
    if n <= 0:
        hitHandler(world, m, None, False)
        return
    e = elapsedOf(m)
    if e >= _z(p, 0):
        m['seed'] = seedOf(cellOfMissile(m)[0], 666)
        k = seedRand(m['seed'], n)
        if _mod(e, p[k + 1]) == 0:
            c = _cm(world, flags=0, owner=m['owner'], source=m, id=sub[k], skill=m['skill'], level=m['level'],
                    ctx=m['ctx'])
            if c:
                hitHandler(world, c, None, True)
    do1(world, m)


def spiralPath(world, m):
    """Path type 14 on a client missile: the engine's spiral from the missile's position."""
    fn = _path_fn(world, 'spiralWaypoints')
    if not fn:
        return
    m['waypoints'] = fn(m['x'], m['y'])
    m['waypointIndex'] = 0
    m['pathActive'] = True


def do57(world, m):
    """do 57 - 0x6fb66f60: sits on its owner and spawns a spiral child to the target point."""
    row = m['def']
    sub = _a(row.get('cltSubMissiles'), 0)
    if _bad(sub) or not m['owner']:
        remove(m)
        return
    m['prevX'] = m['x']
    m['prevY'] = m['y']
    m['x'] = m['owner']['x']
    m['y'] = m['owner']['y']
    t = m.get('targetCell')
    if t is None:
        return
    if m['data2c'] < m['data28']:
        m['data2c'] += 1
    c = _cm(world, flags=0x20, owner=m['owner'], source=m['owner'], id=sub, target=t, skill=m['skill'],
            level=m['level'], ctx=m['ctx'])
    if c:
        spiralPath(world, c)
    m['data2c'] = 0
    do1(world, m)


def do69(world, m):
    """do 69 - D2Sigma 0x100896d0: do 19's emitter with a range of its own."""
    row = m['def']
    sub = _a(row.get('cltSubMissiles'), 0)
    if _bad(sub) or m['skill'] is None:
        return
    p = row.get('cltParams')
    period = max(1, _z(p, 0))
    rng = _z(p, 2) if _z(p, 2) > 0 else max(1, skillNumber(m, 'calc3'))
    if _mod(elapsedOf(m), period) == 0:
        i = abs(_mod(m['data28'], 64))
        t = world['tables']
        _cm(world, flags=0x8002, owner=m['owner'], source=m, id=sub, offset=[t['circle19X'][i], t['circle19Y'][i]],
            range=rng, skill=m['skill'], level=m['level'], ctx=m['ctx'])
        m['data28'] = _mod(_z(p, 1) + i, 64)
    do1(world, m)


def do60(world, m):
    """do 60 - 0x6fb61c00: a quarter-turn step around the centre cell (data28, data2c)."""
    if _mod(elapsedOf(m), 2) == 0:
        x, y = cellOfMissile(m)
        aimAt(m, [x + (y - m['data2c']), y - (x - m['data28'])])
    do1(world, m)


do5 = do1   # animation-frame jumping only; the flight is do 1's


def do12(world, m):
    """do 12 - 0x6fb62d00: CltParam1 / 2 <= 0 removes it; first frame shakes the screen."""
    p = m['def'].get('cltParams')
    a = _z(p, 0)
    c = _z(p, 1)
    if a <= 0 or c <= 0:
        remove(m)
        return
    if elapsedOf(m) == 0:
        q = trunc(c / 3)
        screenShake(world, a, q * 1000, q * 1000, (c - 2 * q) * 1000)
    do1(world, m)


CLT_DO = MappingProxyType({1: do1, 3: do3, 4: do4, 5: do5, 6: do6, 8: do8, 9: do9, 10: do10, 11: do11, 12: do12,
                           13: do13, 15: do15, 17: do17, 18: do18, 19: do19, 20: do20, 27: do27, 29: do29,
                           46: do46, 48: do48, 49: do49, 50: do50, 52: do52, 56: do56, 57: do57, 60: do60,
                           69: do69})


# -- client hit functions (missiles.bin +0x0a; return 0 stops the handler) --------------------------------

def _ring(world, m, xs, ys, flags=0, rng=None):
    """hit 30 / hit 4 / hit 7: a ring."""
    sub = _a(m['def'].get('cltHitSubMissiles'), 0)
    if _bad(sub) or not m['owner'] or xs is None or ys is None:
        return 1
    s = max(1, _z(m['def'].get('cHitPar'), 0))
    for i in range(0, 64, s):
        c = _cm(world, flags=2 | flags, owner=m['owner'], source=m, id=sub, offset=[xs[i], ys[i]],
                skill=m['skill'], level=m['level'], ctx=m['ctx'], range=rng)
        if c:
            c['data28'] = xs[i]
            c['data2c'] = ys[i]
    return 1


def hit30(world, m, unit=None):
    return _ring(world, m, world['tables'].get('circleX'), world['tables'].get('circleY'))


def hit4(world, m, unit=None):
    return _ring(world, m, world['tables'].get('circle4X'), world['tables'].get('circle4Y'))


def hit7(world, m, unit=None):
    if not m['owner']:
        return 1
    p2 = _z(m['def'].get('cHitPar'), 1)
    rng = p2 if p2 > 0 else max(1, skillNumber(m, 'calc3'))
    return _ring(world, m, world['tables'].get('circle19X'), world['tables'].get('circle19Y'), 0x8000, rng)


def hit10(world, m, unit=None):
    """hit 10 - 0x6fb62570: ProgOverlay on the unit hit."""
    if unit is not None and m['def'].get('progOverlay'):
        world['overlays'].append({'unitId': unit['id'], 'name': m['def']['progOverlay'], 'born': world['tick']})
    return 1


def areaUnits(world, m, radius):
    """The client area walk (SKILLS_Skills_6fb51860): units but the owner within the radius."""
    x, y = cellOfMissile(m)
    return [u for u in world['units']
            if u.get('alive') and u.get('id') != m['ownerId'] and u.get('hostile') is not False
            and (u['cell'][0] - x) ** 2 + (u['cell'][1] - y) ** 2 <= radius * radius]


def hit25(world, m, unit=None):
    """hit 25 - 0x6fb6aef0: one child at each unit in the radius, up to a cap."""
    sub = _a(m['def'].get('cltHitSubMissiles'), 0)
    if _bad(sub) or not m['owner']:
        return 1
    p1, p2 = _z(m['def'].get('cHitPar'), 0), _z(m['def'].get('cHitPar'), 1)
    radius = p1 if p1 > 0 else max(1, skillNumber(m, 'auraRange'))
    cap = p2 if p2 > 0 else max(0, skillNumber(m, 'calc1'))
    count = 0
    for u in areaUnits(world, m, radius):
        if count >= cap:
            break
        _cm(world, flags=0x20, owner=m['owner'], source=m, target=u['cell'], id=sub, skill=m['skill'],
            level=m['level'], ctx=m['ctx'])
        count += 1
    return 1


def sprayOffsets(count, t):
    """hit 51 - 0x6fb6a9a0: the spray (server hit 45's walk, SKILLS_Skills_6fb525c0)."""
    out = [[14, -14]]
    n = count - 1
    for row in range(7):
        if n == 0:
            break
        j = 0
        while j < 4 and n > 0:
            out.append([t['sprayA'][j] * t['sprayP'][row], t['sprayB'][j] * t['sprayQ'][row]])
            out.append([t['sprayA'][j] * t['sprayQ'][row], t['sprayB'][j] * t['sprayP'][row]])
            n -= 2
            j += 1
        out.append([t['sprayAxisX'][row], t['sprayAxisY'][row]])
        n -= 1
    return out


def wanderInit(world, m, index):
    """The client wander init 0x6fb23b60: frames >= 78 -> 77, seed { target x + index, 666 }, path type 10."""
    frames = m['total']
    if frames >= 0x4e:
        frames = 0x4d
        m['total'] = frames
        m['frames'] = frames
    seed = {'low': u32((m['targetCell'][0] & 0xffff) + index), 'high': 666}
    fn = _path_fn(world, 'wanderWaypoints')
    if fn:
        m['waypoints'] = fn(cellOfMissile(m), m['targetCell'], min(frames & 0xff, 0x4d), seed)
        m['waypointIndex'] = 0
        m['pathActive'] = True
    m['seed'] = {'lo': u32(seed['low']), 'hi': u32(seed['high'])}


def hit51(world, m, unit=None):
    sub = _a(m['def'].get('cltHitSubMissiles'), 0)
    count = _z(m['def'].get('cHitPar'), 0)
    if _bad(sub) or count <= 0 or 'sprayA' not in world['tables']:
        return 1
    cell = cellOfMissile(m)
    for offset in sprayOffsets(count, world['tables']):
        c = _cm(world, flags=3, sourceCell=cell, offset=offset, owner=m['owner'], id=sub, skill=m['skill'],
                level=m['level'], ctx=m['ctx'])
        if c and _z(m['def'].get('cHitPar'), 1):
            wanderInit(world, c, 0)
    return 1


def hit44(world, m, unit=None):
    """hit 44 - 0x6fb60740: nothing on a unit (0); one child at the explosion."""
    if unit is not None:
        return 0
    sub = _a(m['def'].get('cltHitSubMissiles'), 0)
    if _ge0(sub):
        c = childWithDirection(world, m, sub)
        if c:
            c['data28'] = m['data28']
    return 1


def hit54(world, m, unit=None):
    """hit 54 - 0x6fb60ee0."""
    if unit is not None:
        return 0
    sub = _a(m['def'].get('cltHitSubMissiles'), 0)
    if _ge0(sub):
        childWithDirection(world, m, sub)
    return 1


def hit24(world, m, unit=None):
    """hit 24 - 0x6fb60800: on a unit one child and 0 (the missile flies on)."""
    if unit is None:
        return 1
    sub = _a(m['def'].get('cltHitSubMissiles'), 0)
    if _ge0(sub):
        child60450(world, m, sub)
        return 0
    return 1


def hit18(world, m, unit=None):
    """hit 18 - 0x6fb66540: a 5-cross, a centre, two 18-rings."""
    hs = m['def'].get('cltHitSubMissiles') or []
    h1, h2, h3, h4 = (_a(hs, i) for i in range(4))
    hp = m['def'].get('cHitPar')
    p1, p2, p3 = _z(hp, 0), _z(hp, 1), _z(hp, 2)
    x, y = cellOfMissile(m)
    t = world['tables']
    base = {'owner': m['owner'], 'skill': m['skill'], 'level': m['level'], 'ctx': m['ctx']}
    if _ge0(h1) and 'cross5X' in t:
        for i in range(p1):
            _cm(world, base, flags=0x4001, sourceCell=[x + t['cross5X'][i % 5], y + t['cross5Y'][i % 5]], id=h1)
    rng = 0
    if _ge0(h2):
        rng = skillNumber(m, 'param3') + (m['level'] - 1) * skillNumber(m, 'param4') if m['level'] > 0 else 0
        _cm(world, base, flags=0x8001, sourceCell=[x, y], id=h2, range=rng)
    start = 0
    if _ge0(h3):
        if 'ring18X' in t:
            for i in range(p2):
                _cm(world, base, flags=0xc001, sourceCell=[x + t['ring18X'][i % 18], y + t['ring18Y'][i % 18]],
                    id=h3, range=rng)
        start = p2
    if _ge0(h4) and 'ring18X' in t:
        for i in range(start, start + p3):
            _cm(world, base, flags=0xc001, sourceCell=[x + t['ring18X'][i % 18], y + t['ring18Y'][i % 18]],
                id=h4, range=rng)
    return 1


def hit55(world, m, unit=None):
    """hit 55 - 0x6fb65930: one of each CltHitSubMissile1-3 at the impact."""
    if not m['owner']:
        return 1
    for mid in (m['def'].get('cltHitSubMissiles') or [])[:3]:
        if _ge0(mid):
            _cm(world, flags=0, owner=m['owner'], source=m, id=mid, skill=m['skill'], level=m['level'],
                ctx=m['ctx'])
    return 1


def hit1(world, m, unit=None):
    """hit 1 - 0x6fb6c1a0: a disc of ml265 (hard-coded)."""
    sub = _a(m['def'].get('cltHitSubMissiles'), 0)
    if _ge0(sub):
        discFill(world, m, 265, _z(m['def'].get('cHitPar'), 0), 1, _z(m['def'].get('cHitPar'), 1))
    return 1


def hit2(world, m, unit=None):
    """hit 2 - 0x6fb6b1b0 -> sub_6fb66bc0: moving 16-direction rings."""
    sub = _a(m['def'].get('cltHitSubMissiles'), 0)
    if _bad(sub):
        return 1
    hp = m['def'].get('cHitPar')
    p1, p2, p3 = _z(hp, 0), _z(hp, 1), _z(hp, 2)
    child_row = _row_of(world, sub)
    cell = cellOfMissile(m)
    t = world['tables']
    if 'ring16X' not in t:
        return 1
    flags = 0x1f if p3 > 0 else 0x17
    cparams = (child_row.get('params') if child_row else None)

    def make(i, velocity):
        return _cm(world, flags=flags, sourceCell=cell, offset=[t['ring16X'][i], t['ring16Y'][i]],
                   velocity=velocity, owner=m['owner'], id=sub, skill=m['skill'], level=m['level'],
                   ctx=m['ctx'], loops=p3)

    s = max(1, p1)
    for i in range(0, 16, s):
        make(i, _z(cparams, 0) << 7)
    if p2 > 0:
        for i in range(1, 16, p2):
            make(i, _z(cparams, 1) << 7)
    return 1


def hit52(world, m, unit=None):
    """hit 52 - 0x6fb6a8f0: a child, scattered ml456 (hard-coded) and an 18-ring."""
    if unit is not None and (not unit.get('monster') or not unit.get('flag11')):
        return 0
    hs = m['def'].get('cltHitSubMissiles') or []
    h1, h2, h3 = (_a(hs, i) for i in range(3))
    hp = m['def'].get('cHitPar')
    c1, c2 = _z(hp, 0), _z(hp, 1)
    x, y = cellOfMissile(m)
    base = {'owner': m['owner'], 'skill': m['skill'], 'level': m['level'], 'ctx': m['ctx']}
    if _ge0(h1):
        _cm(world, base, flags=1, sourceCell=[x, y], id=h1)
    if not m['owner']:
        return 1
    if _ge0(h2) and c1 > 0:
        for _ in range(c1):
            tx = x + seedRand(m['seed'], 4 * c1 + 1) - 2 * c1
            ty = y + seedRand(m['seed'], 4 * c1 + 1) - 2 * c1
            if cellDistance([x, y], [tx, ty]) > 3:
                _cm(world, base, flags=0x524, source=m, target=[tx, ty], velocity=c2, id=456)
    if _ge0(h3) and 'ring52X' in world['tables']:
        t = world['tables']
        for i in range(18):
            _cm(world, base, flags=1, sourceCell=[x + t['ring52X'][i], y + t['ring52Y'][i]], id=h3)
    return 1


def hit12(world, m, unit=None):
    """hit 12 - 0x6fb6b070: a random disc fill with a clear-line test."""
    ids = []
    for mid in m['def'].get('cltHitSubMissiles') or []:
        if _bad(mid):
            break
        ids.append(mid)
    if not ids:
        return 1
    hp = m['def'].get('cHitPar')
    p1, p2 = _z(hp, 0), _z(hp, 1)
    r = p1 if p1 > 0 else max(1, skillNumber(m, 'calc1'))
    calc = m['def'].get('sHitCalc')
    ln = int(calc) if _is_int_text(calc) else 0
    if ln <= 0:
        ln = (m['def'].get('range') or 0) + (m['level'] - 1) * (m['def'].get('levRange') or 0)
    x, y = cellOfMissile(m)
    for dx in range(-r, r + 1):
        for dy in range(-r, r + 1):
            if dx * dx + dy * dy > r * r:
                continue
            flags = 0x8001 if ln != 0 else 1
            rng = seedRand(m['seed'], 25) + ln - 12 if ln != 0 else 0
            mid = ids[seedRand(m['seed'], len(ids))]
            if seedRand(m['seed'], 100) < p2:
                _cm(world, flags=flags, sourceCell=[x + dx, y + dy], owner=m['owner'], id=mid, skill=m['skill'],
                    level=m['level'], ctx=m['ctx'], range=rng)
    return 1


def hit14(world, m, unit=None):
    """hit 14 - 0x6fb60870: one child and a 3- or 4-direction star."""
    hs = m['def'].get('cltHitSubMissiles') or []
    h1, h2 = _a(hs, 0), _a(hs, 1)
    if _ge0(h1):
        child60450(world, m, h1)
    if _ge0(h2):
        t = world['tables']
        if 'starRows' not in t or 'dir8X' not in t:
            return 1
        p = seedRand(m['seed'], 3)
        r8 = seedRand(m['seed'], 8)
        row = t['starRows'][p * 5:p * 5 + 5]
        x, y = cellOfMissile(m)
        for j in range(row[0]):
            d = (row[1 + j] + r8) & 7
            c = child60450(world, m, h2)
            if c:
                aimAt(c, [x + t['dir8X'][d], y + t['dir8Y'][d]])
    return 1


def hit19(world, m, unit=None):
    """hit 19 - 0x6fb61080: one random child of the CltHitSubMissile1..2 id range."""
    hs = m['def'].get('cltHitSubMissiles') or []
    h1, h2 = _a(hs, 0), _a(hs, 1)
    if _bad(h1):
        return 1
    mid = h1
    if h2 is not None and h2 > h1:
        mid += seedRand(m['seed'], h2 - h1 + 1)
    child60450(world, m, mid)
    return 1


def unitOrder(u):
    o = u.get('order')
    if isinstance(o, (int, float)) and not isinstance(o, bool):
        return o
    digits = re.sub(r'\D', '', str(u.get('id')))
    return int(digits) if digits else 0


def hit16(world, m, unit=None):
    """hit 16 - 0x6fb667d0: the bounce to the next unit in unit-id order."""
    if not m['owner'] or unit is None:
        return 1
    if m['def'].get('progOverlay'):
        world['overlays'].append({'unitId': unit['id'], 'name': m['def']['progOverlay'], 'born': world['tick']})
    n = m['data28']
    if n <= 1:
        return 1
    p1 = _z(m['def'].get('cHitPar'), 0)
    r = p1 if p1 > 0 else max(1, skillNumber(m, 'auraRange'))
    near = sorted(areaUnits(world, m, r), key=unitOrder)
    above = next((u for u in near if unitOrder(u) > unitOrder(unit)), None)
    target = above or (near[0] if near else None)
    if target is None or target['id'] == unit['id']:
        return 1
    c = _cm(world, flags=0x21, owner=m['owner'], targetUnit=target, id=m['defId'], sourceCell=cellOfMissile(m),
            target=target['cell'], skill=m['skill'], level=m['level'], ctx=m['ctx'])
    if c:
        c['data28'] = n - 1
        c['lastCollideId'] = unit['id']
    return 1


CLT_HIT = MappingProxyType({1: hit1, 2: hit2, 4: hit4, 7: hit7, 10: hit10, 12: hit12, 14: hit14, 16: hit16,
                            18: hit18, 19: hit19, 24: hit24, 25: hit25, 30: hit30, 44: hit44, 51: hit51,
                            52: hit52, 54: hit54, 55: hit55})


# -- the tick -----------------------------------------------------------------------------------------------

def stepClientWorld(world, units=None):
    """One client frame: every live client missile runs its client do function. `units` are the arena's
    units as { id, cell, size, alive, hostile, player }."""
    world['tick'] += 1
    if units is None:
        units = world['units']
    world['units'] = units
    for m in list(world['missiles']):
        if m['dead']:
            continue
        if m['height']:
            stepHeight(m['height'])
        cdo = m['def'].get('cltDo')
        fn = (CLT_DO.get(cdo) or do1) if cdo else None
        if not fn:
            # pCltDoFunc 0 never ticks; it ends with its range here (open question: the game keeps it)
            m['frames'] -= 1
            if m['frames'] < 0:
                m['dead'] = True
            continue
        fn(world, m)
    stateActive(world)
    stepShake(world)
    for uid, h in list(world['unitHeights'].items()):
        stepHeight(h)
        if h['flags'] & 1:
            del world['unitHeights'][uid]
    kept = []
    for m in world['missiles']:
        if not m['dead']:
            kept.append(m)
        else:
            missileSound(world, 'release', m)
    world['missiles'] = kept
    world['overlays'] = [o for o in world['overlays']
                         if world['tick'] - o['born'] < (o['life'] if o.get('life') is not None else 250)]


# -- the state active functions (states.txt cltactivefunc) ---------------------------------------------------

def stateActive(world):
    """SKILLS_Skills_6fb508e0: the skill client do function of each cltactivefunc state the player holds."""
    owner = world.get('player')
    held = owner.get('states') if owner else None
    if not held or not hasattr(held, 'items'):
        return
    table = world.get('stateRows') or CLIENT_STATES
    for sid, entry in list(held.items()):
        st = table.get(sid)
        if st is None:
            st = table.get(str(sid))
        fn = STATE_ACTIVE_DO.get((st or {}).get('active'))
        if not fn or not entry:
            continue
        fn(world, owner, _tonum(entry.get('skill')), _tonum(entry.get('level')))


def do90(world, owner, skill, level):
    """do 90 - D2Client 0x6fb79be0 (Pestilence): cltcalc1 x three swirl missiles."""
    row = world['skills'].get(skill)
    if not row:
        return 0
    try:
        count = trunc(clientCalc(_a(row.get('cltCalcs'), 0), level=level, params=row.get('params') or []))
    except Exception:
        count = 0
    for _ in range(count):
        for _k in range(3):
            swirlMissile(world, owner, row, skill, level)
    return 1


SWIRL_DX = [7, 5, 0, -5, -7, -5, 0, 5]
SWIRL_DY = [0, 5, 7, 5, 0, -5, -7, -5]


def swirlMissile(world, owner, row, skill, level):
    """sub_6fb797d0: a swirl missile seven cells out along a random 8-direction."""
    seed = world['playerSeed'] if owner.get('player') else world['seed']
    d = seedRand(seed, 8)
    cm = row.get('cltMissiles') or []
    a, b, c = _a(cm, 1), _a(cm, 2), _a(cm, 3)
    if a is None or a < 0:
        return None
    mid = a
    if _ge0(b):
        if not _ge0(c):
            mid = a if seedRand(seed, 2) else b
        else:
            pick = seedRand(seed, 3)
            mid = b if pick == 0 else c if pick == 1 else a
    centre = unitCell(owner)
    if centre is None:
        return None
    dx = SWIRL_DX[d]
    dy = SWIRL_DY[d]
    m = _cm(world, flags=3, owner=owner, sourceCell=[centre[0] + dx, centre[1] + dy], offset=[dy, -dx], id=mid,
            skill=skill, level=level)
    if m:
        m['data28'] = centre[0]
        m['data2c'] = centre[1]
    return m


STATE_ACTIVE_DO = MappingProxyType({90: do90})


# -- the client cast (D2Client SKILLS_Skills_6fb52c90 / the start path) ---------------------------------------

SRV_OVERLAY_ON_TARGET = frozenset([2, 80])


def casterCell(cast):
    return unitCell(cast.get('caster'))


def castNumber(cast, key):
    return skillNumber(cast, key)


def clamp13(v):
    return max(1, min(3, i32(v)))


def column(row, k):
    return _a(row.get('cltMissiles'), k)


def selected(row, cast=None):
    """sub_6faf0550: cltmissilea, or a / b / c by the progressive charges."""
    if row.get('progressive') and cast is not None and (cast.get('charges') or 0) > 0:
        return column(row, clamp13(cast['charges']))
    return column(row, 1)


def validId(world, mid):
    return mid is not None and mid >= 0 and _row_of(world, mid) is not None


def _push_overlay(world, unit_id, name):
    world['overlays'].append({'unitId': unit_id, 'name': name, 'born': world['tick']})


def clientCast(world, cast):
    """The client's release of a cast: the cltmissile tail, the cltdofunc, then tgtoverlay / srvoverlay.
    `cast` = { skillId, level, caster, target (cell), targetUnit, ctx, itemCast }."""
    row = world['skills'].get(cast['skillId'])
    if not row:
        return False
    ok = False
    tail = _a(row.get('cltMissiles'), 0)
    if tail is not None and tail > 0 and cltMissileTail(world, cast, tail, row):
        ok = True
    if not row.get('cltdo'):
        ok = True
    else:
        fn = CLIENT_SKILL_DO.get(row['cltdo'])
        if fn and fn(world, cast, row):
            ok = True
    ov = row.get('overlays') or {}
    tu = cast.get('targetUnit')
    if ok and ov.get('tgt') and tu:
        _push_overlay(world, tu['id'], ov['tgt'])
    if ov.get('srv') and tu and row.get('srvdo') in SRV_OVERLAY_ON_TARGET:
        _push_overlay(world, tu['id'], ov['srv'])
    return ok


def clientSkillMessage(world, msg):
    """Packet 0xA3 (D2Client 0x6fb5efb0): srvdo 146 / 29's periodic missile or strike."""
    row = world['skills'].get(msg['skillId'])
    if not row:
        return False
    cast = dict(msg)
    if row.get('progressive'):
        return progressiveRelease(world, cast, row)
    slot = _z(row.get('cltprg'), 0)
    fn = CLIENT_SKILL_DO.get(slot) if slot > 0 else None
    if not fn or not fn(world, cast, row):
        return False
    ov = row.get('overlays') or {}
    if ov.get('tgt') and cast.get('targetUnit'):
        _push_overlay(world, cast['targetUnit']['id'], ov['tgt'])
    return True


def progressiveRelease(world, cast, row):
    """6fb52950: the charges byte picks the cltprgfunc entry."""
    charges = i32(cast.get('value'))
    n = charges - 1
    if row.get('prgstack'):
        for i in range(n):
            fn = CLIENT_SKILL_DO.get(_z(row.get('cltprg'), i))
            if fn:
                fn(world, {**cast, 'charges': i + 1}, row)
    cast['charges'] = charges
    entry = (row.get('cltdo') or 0) if n < 0 else _z(row.get('cltprg'), n)
    if entry < 0:
        return False
    tail = _a(row.get('cltMissiles'), 0)
    if tail is not None and tail > 0 and cast.get('target'):
        if row.get('lob'):
            lob(world, cast, tail, casterCell(cast), cast['target'])
        else:
            towardTarget(world, cast, tail)
    fn = CLIENT_SKILL_DO.get(entry)
    if not fn or not fn(world, cast, row):
        return False
    ov = row.get('overlays') or {}
    if ov.get('tgt') and cast.get('targetUnit'):
        _push_overlay(world, cast['targetUnit']['id'], ov['tgt'])
    return True


# -- skill calcs ----------------------------------------------------------------------------------------------

class _CalcError(Exception):
    pass


_WORD = re.compile(r'[A-Za-z_][A-Za-z_0-9]*')
_NUM = re.compile(r'\d+')


class _CalcParser:
    def __init__(self, src, level, params):
        self.src = src
        self.at = 0
        self.level = level
        self.params = params

    def ws(self):
        while self.at < len(self.src) and self.src[self.at].isspace():
            self.at += 1

    def ch(self):
        return self.src[self.at] if self.at < len(self.src) else ''

    def par(self, k):
        return _tonum(self.params[k - 1]) if 0 < k <= len(self.params) else 0

    def primary(self):
        self.ws()
        ch = self.ch()
        if ch == '(':
            self.at += 1
            v = self.ternary()
            self.ws()
            if self.ch() != ')':
                raise _CalcError()
            self.at += 1
            return v
        if ch == '-':
            self.at += 1
            return -self.primary()
        num = _NUM.match(self.src, self.at)
        if num:
            self.at = num.end()
            return int(num.group(0))
        word = _WORD.match(self.src, self.at)
        if not word:
            raise _CalcError()
        self.at = word.end()
        w = word.group(0)
        lvl = self.level
        if w in ('lvl', 'blvl'):
            return lvl
        m = re.fullmatch(r'par([1-8])', w)
        if m:
            return self.par(int(m.group(1)))
        m = re.fullmatch(r'ln([1-8])([1-8])', w)
        if m:
            return self.par(int(m.group(1))) + (lvl - 1) * self.par(int(m.group(2)))
        m = re.fullmatch(r'dm([1-8])([1-8])', w)
        if m:
            lo = self.par(int(m.group(1)))
            hi = self.par(int(m.group(2)))
            return trunc(110 * lvl * (hi - lo) / (100 * (lvl + 6))) + lo
        raise _CalcError()

    def term(self):
        v = self.primary()
        while True:
            self.ws()
            op = self.ch()
            if op not in ('*', '/'):
                return v
            self.at += 1
            r = self.primary()
            v = v * r if op == '*' else (0 if r == 0 else trunc(v / r))

    def sum(self):
        v = self.term()
        while True:
            self.ws()
            op = self.ch()
            if op not in ('+', '-'):
                return v
            self.at += 1
            r = self.term()
            v = v + r if op == '+' else v - r

    def compare(self):
        v = self.sum()
        self.ws()
        two = self.src[self.at:self.at + 2]
        if two in ('==', '!=', '<=', '>='):
            op = two
        elif self.ch() in ('<', '>'):
            op = self.ch()
        else:
            return v
        self.at += len(op)
        r = self.sum()
        res = {'==': v == r, '!=': v != r, '<=': v <= r, '>=': v >= r, '<': v < r, '>': v > r}[op]
        return 1 if res else 0

    def ternary(self):
        c = self.compare()
        self.ws()
        if self.ch() != '?':
            return c
        self.at += 1
        a = self.ternary()
        self.ws()
        if self.ch() != ':':
            raise _CalcError()
        self.at += 1
        b = self.ternary()
        return a if c else b


def clientCalc(text, level=0, params=None):
    """A skills.txt calc as D2Common_10786 reads it for the client functions: integers, lvl, par1..8,
    lnXY, dmXY, unary minus, * / + -, comparisons and ?:. A skill / stat read makes the whole calc 0.
    '#cN' strings go through CALC_EVALUATOR when one is set."""
    if text is None or text == '':
        return 0
    src = str(text)
    if _is_int_text(src):
        return int(src)
    params = params or []
    if src.startswith('#c'):
        if CALC_EVALUATOR is None:
            return 0
        try:
            return trunc(CALC_EVALUATOR(src, level, params))
        except Exception:
            return 0
    try:
        p = _CalcParser(src, level, params)
        v = p.ternary()
        p.ws()
        return trunc(v) if p.at == len(src) else 0
    except Exception:
        return 0


def cltCalcOf(row, k, cast):
    ctx = cast.get('ctx')
    return clientCalc(_a(row.get('cltCalcs'), k), level=cast.get('level', 0), params=(ctx or {}).get('params') or [])


# -- D2Sigma's point geometry (0x10088d10 / 0x10088ec0 / 0x10088be0 / 0x10088da0) ----------------------------

def sigmaDistance(p, t):
    return trunc(math.sqrt((p[0] - t[0]) ** 2 + (p[1] - t[1]) ** 2))


def sigmaWithin(p, t, r):
    return sigmaDistance(p, t) < abs(r)


def sigmaAngle(p, t):
    """The angle from P to T in whole degrees (y grows down: T below P is 270)."""
    if p[0] == t[0] and p[1] == t[1]:
        return 0
    if p[0] == t[0]:
        return 270 if t[1] > p[1] else 90
    if p[1] == t[1]:
        return 0 if t[0] > p[0] else 180
    deg = math.atan((t[1] - p[1]) / (t[0] - p[0])) * 180 / 3.1415
    if t[1] < p[1]:
        out = -deg if t[0] > p[0] else 180 - deg
    else:
        out = 180 - deg if t[0] <= p[0] else 360 - deg
    return trunc(out)


def sigmaPolar(p, r, a):
    """The point r cells from P at angle a (degrees): 16-bit words of P.x + cos r and P.y - sin r."""
    ang = a
    if abs(ang) >= 360:
        ang -= trunc(ang / 360) * 360
    if ang < 0:
        ang += 360
    rad = ang * 3.1415 / 180

    def word(v):
        return ((v & 0xffff) ^ 0x8000) - 0x8000

    return [word(trunc(p[0] + math.cos(rad) * r)), word(trunc(p[1] - math.sin(rad) * r))]


def sigmaStartPoint(cast, with_target_unit):
    """D2Sigma 0x100af740: a start point `size` cells from the caster toward the target."""
    u = casterCell(cast)
    tu = cast.get('targetUnit') if with_target_unit else None
    size = 2 + (_tonum((cast.get('caster') or {}).get('rangeAdder')))
    if tu and tu.get('monster'):
        size += _tonum(tu.get('size'))
    t = tu['cell'] if tu else cast.get('target')
    if not t:
        return None
    if sigmaWithin(u, t, size):
        return [t[0], t[1]]
    return sigmaPolar(u, size, sigmaAngle(u, t))


def cltMissileTail(world, cast, mid, row):
    """The cltmissile tail. Not Lob: flags 0x21 caster -> target; Lob: flags 0x521, height 30."""
    if not cast.get('target'):
        return None
    u = casterCell(cast)
    frm = u
    to = cast['target']
    if cast.get('itemCast'):
        d = [to[0] - u[0], to[1] - u[1]]
        frm = [u[0] + d[0], u[1] + d[1]]
        to = [to[0] + d[0], to[1] + d[1]]
    if row.get('lob'):
        return lob(world, cast, mid, frm, to)
    return _cm(world, flags=0x21, owner=cast.get('caster'), sourceCell=frm, id=mid, target=to,
               skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx'))


def lob(world, cast, mid, frm, to, shadow=False, height=0):
    """sub_6fb69a80: flags 0x521 (cell source, absolute target, a height arc), height 30 when 0."""
    return _cm(world, flags=0x521, owner=cast.get('caster'), sourceCell=frm, target=to, id=mid,
               height=height or 30, skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx'),
               shadow=shadow)


def clientCastStart(world, cast):
    """The client's start of a cast (the cltstfunc, CLIENT_SKILL_START)."""
    row = world['skills'].get(cast['skillId'])
    if not row or not row.get('cltst'):
        return False
    fn = CLIENT_SKILL_START.get(row['cltst'])
    return fn(world, cast, row) if fn else False


def holdsOverlay(world, unit_id, name, ticks=1):
    """Whether `unit_id` already plays overlay `name` (no second node of an overlay it still plays)."""
    span = max(1, _tonum(ticks) or 1)
    return any(o['unitId'] == unit_id and o['name'] == name and world['tick'] - o['born'] < span
               for o in world['overlays'])


def clientMonsterCastStart(world, cast):
    """A monster's (a pet's) cast start: the start function and the castoverlay on the caster."""
    row = world['skills'].get(cast['skillId'])
    if not row:
        return False
    started = clientCastStart(world, cast)
    name = (row.get('overlays') or {}).get('cast')
    caster = cast.get('caster')
    uid = caster.get('id') if caster else None
    ticks_fn = cast.get('overlayTicks')
    if name and uid is not None and not holdsOverlay(world, uid, name, ticks_fn(name) if callable(ticks_fn) else 1):
        _push_overlay(world, uid, name)
    return started


# -- skill client do functions ---------------------------------------------------------------------------------

def fan(world, cast, mid):
    """The fan (cltdo 17 / Median 97): calc1 missiles in a row at the target."""
    if not validId(world, mid) or not cast.get('target'):
        return False
    u = casterCell(cast)
    t = cast['target']
    d = [t[0] - u[0], t[1] - u[1]]
    if d[0] ** 2 + d[1] ** 2 < 4:
        d = [d[0] * 4, d[1] * 4]
    if d[0] ** 2 + d[1] ** 2 < 16:
        d = [d[0] * 2, d[1] * 2]
    p = [d[1], -d[0]]

    def half(v):
        return (v - (v >> 31)) >> 1

    while p[0] ** 2 + p[1] ** 2 > 3:
        p = [half(p[0]), half(p[1])]
    n = castNumber(cast, 'calc1')
    start = [t[0] - trunc(p[0] * n / 2), t[1] - trunc(p[1] * n / 2)]
    for i in range(n):
        _cm(world, flags=0x820, owner=cast.get('caster'), source=cast.get('caster'), id=mid,
            target=[start[0] + i * p[0], start[1] + i * p[1]], activate=castNumber(cast, 'calc2'),
            skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx'))
    return True


def standing(world, cast, mid):
    """A standing missile at T (cltdo 28 / Median 99): within 100 cells."""
    if not validId(world, mid) or not cast.get('target'):
        return False
    u = casterCell(cast)
    t = cast['target']
    if (t[0] - u[0]) ** 2 + (t[1] - u[1]) ** 2 > 10000:
        return False
    return bool(_cm(world, flags=1, owner=cast.get('caster'), sourceCell=t, id=mid, skill=cast['skillId'],
                    level=cast.get('level'), ctx=cast.get('ctx')))


def wanderers(world, cast, mid):
    """Median's wanderers (cltdo 19 / 98): calc1 missiles from the start point toward 2 Tp - U."""
    if not validId(world, mid) or not cast.get('target'):
        return False
    u = casterCell(cast)
    tp = sigmaStartPoint(cast, True)
    if not tp:
        return False
    return wanderFrom(world, cast, mid, tp, [2 * tp[0] - u[0], 2 * tp[1] - u[1]])


def wanderFrom(world, cast, mid, frm, to):
    n = castNumber(cast, 'calc1')
    for i in range(n):
        m = _cm(world, flags=0x21, owner=cast.get('caster'), sourceCell=frm, id=mid, target=to,
                skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx'))
        if m:
            wanderInit(world, m, i)
    return True


def withStream(m, missile, rng):
    """The stream fields (missile data +4 / +6) cltdo 8 / 30 write for do 17."""
    if m:
        m['stream'] = {'missile': missile, 'range': rng}
    return m


def leapArc(frm, to, velocity):
    """Leap's jump (cltdo 43): the unit's timed arc state, or None without a target / velocity."""
    v = trunc(_tonum(velocity))
    if not frm or not to or v <= 0:
        return None
    a = abs(to[0] - frm[0])
    b = abs(to[1] - frm[1])
    dist = max(1, trunc((b + a * 2) / 2) if b < a else trunc((a + b * 2) / 2))
    frames = trunc((16 * dist) / v)
    if frames > 1:
        frames -= 1
    g = max(500, 8462 - 270 * dist if dist < 27 else 1224 - 72 * dist)
    h = makeHeight()
    h['az'] = -g
    arcHeight(h, frames, 0)
    return h


def weaponClassIndex(caster):
    """D2Common_10076: 1 the bow, 7 the crossbow, 0 none (read from the weapon's missile)."""
    mid = (caster or {}).get('weaponMissile')
    return 1 if mid == 0 else 7 if mid == 31 else 0


DIRECTION_OCTANT = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
    4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
]
DIRECTION_8 = [
    0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4,
    4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 0, 0, 0, 0,
]


def direction64(frm, to):
    """D2Common_10192: the 64-direction from a cell's centre to another's."""
    x1 = frm[0] * SUBTILE + HALF_SUBTILE
    y1 = frm[1] * SUBTILE + HALF_SUBTILE
    x2 = to[0] * SUBTILE + HALF_SUBTILE
    y2 = to[1] * SUBTILE + HALF_SUBTILE
    dxa = abs(x2 - x1)
    dya = abs(y2 - y1)
    y_major = dxa <= dya
    major = dya if y_major else dxa
    minor = dxa if y_major else dya
    ratio = 0 if major == 0 else trunc(minor * 0x7f / major)
    octant = DIRECTION_OCTANT[ratio]
    if not y_major:
        octant = (-octant - 1) & 0xf
    if y2 < y1:
        octant = (-octant - 1) & 0x1f
    if x1 > x2:
        return (octant + 8) & 0x3f
    return (((-octant - 1) & 0x3f) + 8) & 0x3f


WEAVE_STEP_X = [2, 2, 0, -2, -2, -2, 0, 2]
WEAVE_STEP_Y = [0, 2, 2, 2, 0, -2, -2, -2]


def ringWeave(world, cast, row, mid, cell, count):
    """0x6faf0f00: a 64-circle of flags-3 missiles from the cell, each with the weave callback."""
    step = i32(count)
    if step <= 0:
        return
    seed = seedOf(_tonum((cast.get('caster') or {}).get('initSeed')), 666)
    t = world['tables']
    for i in range(0, 64, step):
        seedRand(seed, 0)
        arg = seed['lo']
        m = _cm(world, flags=3, owner=cast.get('caster'), sourceCell=cell, offset=[t['circleX'][i], t['circleY'][i]],
                id=mid, skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx'),
                callback=lambda c, arg=arg: weave(world, c, arg))
        if m:
            m['data28'] = i32(_z(row.get('params'), 1)) + 1


def weave(world, m, arg):
    """The weave callback 0x6faf0200: a zig-zag waypoint path on the missile's own seed."""
    frames = m['total']
    if frames >= 0x4e:
        frames = 0x4d
        m['total'] = frames
        m['frames'] = frames
    m['seed'] = seedOf(arg, 666)
    start = cellOfMissile(m)
    d = direction64(start, m['targetCell'])
    seedRand(m['seed'], 0)
    sign = 1 if m['seed']['lo'] & 1 else -1
    step = seedRand(m['seed'], 3) + 2
    x, y = start
    waypoints = []
    for i in range(frames):
        d += step * sign
        d8 = DIRECTION_8[d & 0x3f]
        x += WEAVE_STEP_X[d8]
        y += WEAVE_STEP_Y[d8]
        waypoints.append([x, y])
        if i % 15 == 0:
            sign = -sign
            step = seedRand(m['seed'], 3) + 2
    if _path_fn(world, 'wanderStep') and waypoints:
        m['waypoints'] = waypoints
        m['waypointIndex'] = 0
        m['pathActive'] = True


def towardTarget(world, cast, mid):
    """sub_6fb515c0: flags 0x20 from the caster to T (both coordinates non-zero)."""
    t = cast.get('target')
    if not validId(world, mid) or not t or not t[0] or not t[1]:
        return None
    return _cm(world, flags=0x20, owner=cast.get('caster'), source=cast.get('caster'), id=mid, target=t,
               skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx'))


def prgCount(row, cast):
    """6faf0450: prgcalc1, or prgcalc[k] by clamp(charges, 1, 3) under the progressive gate."""
    table = (cast.get('ctx') or {}).get('prgCalcs')
    if isinstance(table, (list, tuple)) and table:
        k = min(cast['charges'], len(table) - 1) if row.get('progressive') and (cast.get('charges') or 0) > 0 else 0
        return trunc(_tonum(table[k]))
    return castNumber(cast, 'prgCalc1')


def stirSeed(seed, r):
    """D2Sigma's seed stir inside 0x100a8980: t = lo32(lo K + hi); X = t K + r; hi = hi32(X)."""
    t = (seed['lo'] * MULTIPLIER + seed['hi']) & MASK32
    x = t * MULTIPLIER + r
    hi = (x >> 32) & MASK32
    seed['lo'] = (hi * MULTIPLIER + seed['lo'] * 0x669a3799 + r) & MASK32
    seed['hi'] = hi


def ringAround(world, m, mid, count, step):
    """sub_6fb66bc0: the 16-step ring round a missile at Param1 << 7, then the odd offsets at Param2 << 7."""
    r = _row_of(world, mid)
    t = world['tables']
    if 'ring16X' not in t:
        return
    k = max(1, i32(step))
    base = {'owner': m['owner'], 'source': m, 'sourceCell': cellOfMissile(m), 'id': mid, 'skill': m['skill'],
            'level': m['level'], 'ctx': m['ctx']}
    params = r.get('params') if r else None
    for i in range(0, 16, k):
        _cm(world, base, flags=0x17, velocity=_z(params, 0) << 7, offset=[t['ring16X'][i], t['ring16Y'][i]])
    if count > 0:
        for i in range(1, 15, count):
            _cm(world, base, flags=0x17, velocity=_z(params, 1) << 7, offset=[t['ring16X'][i], t['ring16Y'][i]])


def _sk43(world, cast, row=None):
    """43 - 0x6fb76ed0: Leap's jump arc on the caster."""
    caster = cast.get('caster') or {}
    to = caster.get('pathTarget') or cast.get('target')
    h = leapArc(casterCell(cast), to, castNumber(cast, 'calc2'))
    if not h or caster.get('id') is None:
        return False
    world['unitHeights'][caster['id']] = h
    return True


def _sk17(world, cast, row):
    """17 - 0x6fac5da0: the fan of cltmissilea (or b when valid and the weapon is not a bow)."""
    b = column(row, 2)
    mid = b if weaponClassIndex(cast.get('caster')) != 1 and b is not None and b >= 0 else column(row, 1)
    return fan(world, cast, mid)


def _sk1(world, cast, row=None):
    """1 - 0x6fb52230: the weapon's missile flies toward the target; always 1."""
    mid = (cast.get('caster') or {}).get('weaponMissile')
    if mid is not None and mid >= 0:
        towardTarget(world, cast, mid)
    return True


def _sk75(world, cast, row):
    """75 - 0x6fb74830 (Tremor): the screen shake from the skill's Param1-4."""
    p = row.get('params') or []

    def ms(frames):
        return trunc(i32(frames) * 1000 / 25)

    screenShake(world, i32(_a(p, 0)), ms(_a(p, 1)), ms(_a(p, 3)), ms(_a(p, 2)))
    return True


def _sk83(world, cast, row):
    """83 - 0x6faf15a0 (Soulshatter): a weaving ring at the target unit."""
    mid = selected(row, cast)
    if not validId(world, mid):
        return False
    tu = cast.get('targetUnit')
    if not tu:
        return False
    count = prgCount(row, cast)
    if count <= 0:
        count = castNumber(cast, 'auraRange')
    ringWeave(world, cast, row, mid, tu['cell'], count)
    return True


def _sk97(world, cast, row):
    return fan(world, cast, column(row, clamp13(castNumber(cast, 'calc3'))))


def _sk28(world, cast, row):
    return standing(world, cast, selected(row, cast))


def _sk99(world, cast, row):
    return standing(world, cast, column(row, clamp13(castNumber(cast, 'calc3'))))


def _sk19(world, cast, row):
    return wanderers(world, cast, selected(row, cast))


def _sk98(world, cast, row):
    return wanderers(world, cast, column(row, clamp13(castNumber(cast, 'calc2'))))


def _sk23(world, cast, row):
    """23 - 0x6fb24ac0: N wanderers from the caster toward T."""
    mid = selected(row, cast)
    if validId(world, mid) and cast.get('target'):
        return wanderFrom(world, cast, mid, casterCell(cast), cast['target'])
    return False


def _sk36(world, cast, row):
    """36 - 0x6fadbd20: on the target unit, data28 / 2c = its type / id."""
    mid = selected(row, cast)
    tu = cast.get('targetUnit')
    if not validId(world, mid) or not tu:
        return False
    m = _cm(world, flags=1, owner=cast.get('caster'), sourceCell=tu['cell'], id=mid, skill=cast['skillId'],
            level=cast.get('level'), ctx=cast.get('ctx'))
    if m:
        m['data28'] = 1
        m['data2c'] = tu['id']
    return bool(m)


def _sk30(world, cast, row):
    """30 - 0x6fb78b40: missile 191 (hard-coded) at T, its stream = (cltmissilea, max(2, aurarange - 3))."""
    if not validId(world, column(row, 1)) or not cast.get('target'):
        return False
    r = max(2, castNumber(cast, 'auraRange') - 3)
    m = _cm(world, flags=1, owner=cast.get('caster'), sourceCell=cast['target'], id=191, skill=cast['skillId'],
            level=cast.get('level'), ctx=cast.get('ctx'))
    return bool(withStream(m, column(row, 1), r))


def _sk8(world, cast, row):
    """8 - 0x6faf1290: cltmissilea at T, its stream = (cltmissileb, aurarangecalc)."""
    if not validId(world, column(row, 1)) or not _ge0(column(row, 2)) or not cast.get('target'):
        return False
    m = _cm(world, flags=1, owner=cast.get('caster'), sourceCell=cast['target'], id=column(row, 1),
            skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx'))
    return bool(withStream(m, column(row, 2), castNumber(cast, 'auraRange')))


def _sk25(world, cast, row):
    """25 - 0x6fb23cb0: a 64-direction nova from the caster."""
    mid = selected(row, cast)
    if not validId(world, mid):
        return False
    r = _row_of(world, mid)
    v = (r.get('vel') or 0) + trunc((r.get('velLev') or 0) * cast['level'] / 8) + cltCalcOf(row, 0, cast)
    t = world['tables']
    for i in range(64):
        _cm(world, flags=3 | (4 if v != 0 else 0), velocity=v, owner=cast.get('caster'), sourceCell=casterCell(cast),
            offset=[t['circleX'][i], t['circleY'][i]], id=mid, skill=cast['skillId'], level=cast['level'],
            ctx=cast.get('ctx'))
    return True


def _sk22(world, cast, row):
    """22 - 0x6fac5660: from the target unit to the next unit in id order within calc1."""
    mid = selected(row, cast)
    tu = cast.get('targetUnit')
    if not validId(world, mid) or not tu:
        return False
    r = castNumber(cast, 'calc1')
    near = sorted((u for u in world['units']
                   if u.get('alive') and u.get('id') != 'player' and u.get('hostile') is not False
                   and (u['cell'][0] - tu['cell'][0]) ** 2 + (u['cell'][1] - tu['cell'][1]) ** 2 <= r * r),
                  key=unitOrder)
    nxt = next((u for u in near if unitOrder(u) > unitOrder(tu)), None) or (near[0] if near else None)
    if not nxt:
        return False
    m = _cm(world, flags=0x20, owner=cast.get('caster'), source=tu, id=mid, target=nxt['cell'],
            skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx'))
    if m:
        m['data28'] = castNumber(cast, 'calc2')
    return True


def _sk35(world, cast, row):
    """35 - D2Sigma 0x100a7800: U -> T, column by calc2, then the spiral path."""
    mid = column(row, clamp13(castNumber(cast, 'calc2')))
    if not validId(world, mid) or not cast.get('target'):
        return False
    m = _cm(world, flags=0x20, owner=cast.get('caster'), source=cast.get('caster'), id=mid, target=cast['target'],
            skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx'))
    if m:
        spiralPath(world, m)
    return bool(m)


def _sk3(world, cast, row=None):
    """3 - 0x6faf0a40: a hostile target unit and nothing else."""
    tu = cast.get('targetUnit')
    return bool(tu) and tu.get('hostile') is not False


def _sk29(world, cast, row):
    """29 - 0x6fb23d70: missile(sel) from the caster to T."""
    return bool(towardTarget(world, cast, selected(row, cast)))


def _sk81(world, cast, row):
    """81 - 0x6fb74c10: as 29, then data28 / 2c = (-(ty - y), tx - x)."""
    m = towardTarget(world, cast, selected(row, cast))
    if not m:
        return False
    u = casterCell(cast)
    m['data28'] = -(cast['target'][1] - u[1])
    m['data2c'] = cast['target'][0] - u[0]
    return True


def _sk57(world, cast, row):
    """57 - 0x6fb08070: cltmissilea flags 3 from the caster's cell, offset to the target; data28 = level."""
    mid = column(row, 1)
    if not validId(world, mid):
        return False
    u = casterCell(cast)
    tu = cast.get('targetUnit')
    t = tu['cell'] if tu else cast.get('target')
    if not t:
        return False
    m = _cm(world, flags=3, owner=cast.get('caster'), source=cast.get('caster'), sourceCell=u, id=mid,
            offset=[t[0] - u[0], t[1] - u[1]], skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx'))
    if m:
        m['data28'] = cast.get('level')
    return True


def _sk26(world, cast, row):
    """26 - D2Sigma 0x100a8010 (Median's firewall): two missiles, the two halves of the wall."""
    mid = column(row, 1)
    mrow = _row_of(world, mid) if mid is not None else None
    if not mrow or not _ge0(mrow.get('subMissile1')) or not cast.get('target'):
        return False
    u = casterCell(cast)
    t = cast['target']
    r = castNumber(cast, 'auraRange')
    if r != 0 and not sigmaWithin(u, t, r):
        t = sigmaPolar(u, r, sigmaAngle(u, t))
    if not t[0] or not t[1]:
        return False
    base = {'flags': 0x21, 'owner': cast.get('caster'), 'sourceCell': t, 'id': mid, 'skill': cast['skillId'],
            'level': cast.get('level'), 'ctx': cast.get('ctx')}
    _cm(world, base, target=[t[0] + (t[1] - u[1]), t[1] + (u[0] - t[0])])
    _cm(world, base, target=[t[0] - (t[1] - u[1]), t[1] + (t[0] - u[0])])
    return True


def _sk15(world, cast, row):
    """15 - D2Sigma 0x100a8980: count missiles flags 3 from the start point to random offsets."""
    mid = selected(row, cast)
    if not validId(world, mid):
        return False
    count = prgCount(row, cast)
    if count <= 0:
        return False
    frm = sigmaStartPoint(cast, False)
    if not frm:
        return False
    ps = world['playerSeed']
    seed = {'lo': (ps['lo'] * MULTIPLIER + ps['hi']) & MASK32, 'hi': 666}
    for _ in range(count):
        r1 = seedRand(seed, 40)
        r2 = seedRand(seed, 40)
        stirSeed(seed, r1)
        r3 = seedRand(seed, 40)
        r4 = seedRand(seed, 40)
        offset = [20 if r1 == 20 and r3 == 20 else r2 - 20, r4 - 20]
        m = _cm(world, flags=3, owner=cast.get('caster'), sourceCell=frm, id=mid, offset=offset,
                skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx'))
        if m:
            m['data28'] = i32(seed['lo'])
            m['data2c'] = i32((r3 << 16) + r1)
    return True


def _sk5(world, cast, row):
    """5 - 0x6faf1890: count lobbed missiles at random points of the square of auraRange round T."""
    mid = selected(row, cast)
    if not validId(world, mid) or not cast.get('target'):
        return False
    count = prgCount(row, cast)
    if count <= 0:
        return False
    r = castNumber(cast, 'auraRange')
    t = cast['target']
    u = casterCell(cast)
    world['playerSeed'] = seedOf(t[0], 666)
    for _ in range(count):
        px = t[0] + (seedRand(world['playerSeed'], 2 * r) if 2 * r > 0 else 0) - r
        py = t[1] + (seedRand(world['playerSeed'], 2 * r) if 2 * r > 0 else 0) - r
        if (px - u[0]) ** 2 + (py - u[1]) ** 2 >= 4:
            lob(world, cast, mid, u, [px, py])
    return True


def _sk33(world, cast, row):
    """33 - 0x6fb78c90: the corpse cltst 21 stored; cltmissilea / c at it, cltmissileb ring round it."""
    stored = world['stored'].get(cast['skillId'])
    mid = column(row, 1)
    if not validId(world, mid) or not stored or not stored.get('x') or not stored.get('y') \
            or stored.get('row') is None:
        return False
    base = {'flags': 0x2001, 'owner': cast.get('caster'), 'sourceCell': [stored['x'], stored['y']],
            'skill': cast['skillId'], 'ctx': cast.get('ctx')}
    first = _cm(world, base, id=mid, level=cast.get('level'))
    c = column(row, 3)
    if c is not None and c > 0 and _row_of(world, c):
        _cm(world, base, id=c, level=2)
    b = column(row, 2)
    if first and b is not None and b > 0 and _row_of(world, b):
        ringAround(world, first, b, 0, 2)
    return True


def _sk84(world, cast, row):
    """84 - 0x6fb24350: cltmissilea falling onto the target unit, then prgoverlay on it."""
    mid = column(row, 1)
    tu = cast.get('targetUnit')
    if not validId(world, mid) or not tu:
        return False
    m = _cm(world, flags=1, owner=cast.get('caster'), sourceCell=tu['cell'], id=mid, skill=cast['skillId'],
            level=cast.get('level'), ctx=cast.get('ctx'))
    if m:
        m['height'] = makeHeight(z=280, vz=-40)
    prg = (row.get('overlays') or {}).get('prg')
    if prg:
        _push_overlay(world, tu['id'], prg)
    return True


def _sk92(world, cast, row):
    """92 - 0x6fb795f0 (periodic skills' cltprgfunc1): cltmissilea / b fall in onto the point."""
    if castNumber(cast, 'auraRange') <= 0 or not cast.get('target'):
        return False
    a = cltCalcOf(row, 0, cast)
    b = cltCalcOf(row, 1, cast)
    c = cltCalcOf(row, 2, cast)
    if a <= 0 or b <= 0 or c <= 0:
        return False
    for k in (1, 2):
        mid = column(row, k)
        if not validId(world, mid):
            continue
        m = _cm(world, flags=1, owner=cast.get('caster'), sourceCell=cast['target'], id=mid, skill=cast['skillId'],
                level=cast.get('level'), ctx=cast.get('ctx'))
        if m:
            m['height'] = makeHeight(x=c * a, z=a * b, vx=-c, vz=-b)
    return True


def _sk70(world, cast, row):
    """70 - 0x6fb75a80: U -> T (flag 2), data28 / 2c = (-dy, dx)."""
    mid = selected(row, cast)
    if not validId(world, mid) or not cast.get('target'):
        return False
    u = casterCell(cast)
    d = [cast['target'][0] - u[0], cast['target'][1] - u[1]]
    m = _cm(world, flags=2, owner=cast.get('caster'), source=cast.get('caster'), id=mid, offset=d,
            skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx'))
    if m:
        m['data28'] = -d[1]
        m['data2c'] = d[0]
    return bool(m)


def _sk72(world, cast, row):
    """72 - 0x6fb75d20: U -> T timed to land (0x420), dropped from cltcalc2."""
    mid = selected(row, cast)
    if not validId(world, mid) or not cast.get('target'):
        return False
    m = _cm(world, flags=0x420, owner=cast.get('caster'), source=cast.get('caster'), id=mid, target=cast['target'],
            skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx'))
    if m:
        h = cltCalcOf(row, 1, cast)
        v = trunc(h / m['total']) if m['total'] else trunc(h / 2)
        m['height'] = makeHeight(z=h, vz=-v)
        stepHeight(m['height'])
    return bool(m)


def _sk73(world, cast, row):
    """73 - 0x6fb744d0: cltmissileb standing on the caster, level 1."""
    mid = column(row, 2)
    if not validId(world, mid):
        return True
    return bool(_cm(world, flags=1, owner=cast.get('caster'), sourceCell=casterCell(cast), id=mid,
                    skill=cast['skillId'], level=1, ctx=cast.get('ctx')))


CLIENT_SKILL_DO = {
    1: _sk1, 3: _sk3, 5: _sk5, 8: _sk8, 15: _sk15, 17: _sk17, 19: _sk19, 22: _sk22, 23: _sk23, 25: _sk25,
    26: _sk26, 28: _sk28, 29: _sk29, 30: _sk30, 33: _sk33, 35: _sk35, 36: _sk36, 43: _sk43, 57: _sk57,
    70: _sk70, 72: _sk72, 73: _sk73, 75: _sk75, 81: _sk81, 83: _sk83, 84: _sk84, 92: _sk92, 97: _sk97,
    98: _sk98, 99: _sk99,
}


# -- skill client start functions (cltstfunc) -------------------------------------------------------------------

def _st21(world, cast, row=None):
    """21 - 0x6fb78330: a corpse target's x / y / class stored on the skill for cltdo 33."""
    tu = cast.get('targetUnit')
    if not tu or not tu.get('corpse'):
        return False
    world['stored'][cast['skillId']] = {'x': tu['cell'][0], 'y': tu['cell'][1], 'row': tu.get('row')}
    return True


def _st24(world, cast, row):
    """24 - 0x6fb78620: the corpse's OverlayHeight picks cltmissile b / c / a."""
    tu = cast.get('targetUnit')
    if not tu or not tu.get('corpse'):
        return False
    oh = tu.get('overlayHeight')
    k = 2 if oh == 1 else 3 if oh == 3 else 1
    mid = column(row, k)
    if not validId(world, mid):
        return False
    return bool(_cm(world, flags=0x2000, owner=cast.get('caster'), source=tu, id=mid, skill=cast['skillId'],
                    level=cast.get('level'), ctx=cast.get('ctx')))


def _has_state(caster, state):
    states = (caster or {}).get('states')
    return states is not None and state in states


def _st45(world, cast, row):
    """45 - 0x6fb79420 (Werewolf Form): cltoverlaya on the caster, or b when it holds the aurastate."""
    ov = row.get('overlays') or {}
    a = ov.get('clta')
    if row.get('auraState') is None or not a:
        return False
    held = ov.get('cltb') and _has_state(cast.get('caster'), row['auraState'])
    caster = cast.get('caster')
    uid = caster.get('id') if caster and caster.get('id') is not None else 'player'
    _push_overlay(world, uid, ov['cltb'] if held else a)
    return True


def _st18(world, cast, row):
    """18 - 0x6fb785c0: cltmissilec from the caster to T."""
    mid = column(row, 3)
    if validId(world, mid) and cast.get('target'):
        _cm(world, flags=0x20, owner=cast.get('caster'), source=cast.get('caster'), id=mid, target=cast['target'],
            skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx'))
    return True


def _st19(world, cast, row):
    """19 - 0x6fb78f50: cltmissilec from 2 cells in front of the caster, aimed 5x the offset."""
    mid = column(row, 3)
    if not validId(world, mid) or not cast.get('target'):
        return False
    u = casterCell(cast)
    dx = cast['target'][0] - u[0]
    dy = cast['target'][1] - u[1]
    d = max(1, cellDistance(u, cast['target']))
    return bool(_cm(world, flags=3, owner=cast.get('caster'),
                    sourceCell=[u[0] + trunc(2 * dx / d), u[1] + trunc(2 * dy / d)], offset=[5 * dx, 5 * dy],
                    id=mid, skill=cast['skillId'], level=cast.get('level'), ctx=cast.get('ctx')))


def _st48(world, cast, row):
    """48 - 0x6fb74550: cltmissilea standing on the caster."""
    mid = column(row, 1)
    if validId(world, mid):
        _cm(world, flags=1, owner=cast.get('caster'), sourceCell=casterCell(cast), id=mid, skill=cast['skillId'],
            level=cast.get('level'), ctx=cast.get('ctx'))
    return True


def _st5(world, cast, row=None):
    return True


def _st7(world, cast, row):
    """7 - 0x6faf01a0 (Howl of the Spirits): starts iff the caster does not hold the aurastate."""
    return not (row.get('auraState') is not None and _has_state(cast.get('caster'), row['auraState']))


def _st17(world, cast, row=None):
    return bool(cast.get('target'))


CLIENT_SKILL_START = {21: _st21, 24: _st24, 45: _st45, 18: _st18, 19: _st19, 48: _st48, 5: _st5, 7: _st7,
                      17: _st17}


# -- what the arena draws ---------------------------------------------------------------------------------------

def drawList(world):
    """The client missiles and overlays to draw: missiles the server's copy does not stand in for (not
    `shadow`), past their InitSteps, overlays, the units' height offsets and the shake offset."""
    missiles = []
    for m in world['missiles']:
        if m['shadow'] or m['def'].get('noArt'):
            continue
        age = m['total'] - m['frames'] + (m.get('animStart') or 0)
        if m['def'].get('initSteps') and age <= m['def']['initSteps'] and m['velocity'] != 0:
            continue
        dirx, diry = m.get('drawDir') or (m['dirX'], m['dirY'])
        off = heightOffset(m['height'])
        missiles.append({'id': m['id'], 'defId': m['defId'], 'x': m['x'], 'y': m['y'], 'prevX': m['prevX'],
                         'prevY': m['prevY'], 'dirX': dirx, 'dirY': diry, 'drawDir64': m['drawDir64'], 'age': age,
                         'total': m['total'] + (m.get('animStart') or 0),
                         'offsetX': off['x'] if off else 0, 'offsetY': off['y'] if off else 0})
    unit_heights = {uid: heightOffset(h) for uid, h in world['unitHeights'].items()}
    so = world.get('shakeOffset') or {'x': 0, 'y': 0}
    return {'missiles': missiles,
            'overlays': [{'unitId': o['unitId'], 'name': o['name'], 'age': world['tick'] - o['born']}
                         for o in world['overlays']],
            'unitHeights': unit_heights, 'shake': {'x': so['x'], 'y': so['y']}}


# -- server missiles the server sends to clients (ClientSend rows) -----------------------------------------------

def releaseStandIn(world, m):
    """A stand-in shadow whose server copy never came: it is drawn after all."""
    if not m or m['dead'] or not m['standIn']:
        return
    m['standIn'] = False
    m['shadow'] = False
    missileSound(world, 'travel', m)


def mirrorServerMissile(world, server_missile, owner=None, ctx=None):
    """Starts the mirror of a server missile (engine missile: id, defId, x, y, frames, totalFrames, level)."""
    row = _row_of(world, server_missile['defId'])
    if not row or not row.get('clientSend'):
        return None
    m = _cm(world, flags=1, sourceCell=[cellOf(server_missile['x']), cellOf(server_missile['y'])], velocity=0,
            owner=owner, id=server_missile['defId'], skill=server_missile.get('skillId'),
            level=i32(server_missile.get('level')), ctx=ctx, shadow=True,
            exactPos=[server_missile['x'], server_missile['y']])
    if not m:
        return None
    m['mirror'] = server_missile['id']
    syncMirror(m, server_missile)
    return m


def syncMirror(m, server_missile):
    """Follows the server's copy (position, direction and frames)."""
    before = [cellOf(m['x']), cellOf(m['y'])]
    m['prevX'] = m['x']
    m['prevY'] = m['y']
    m['x'] = server_missile['x']
    m['y'] = server_missile['y']
    if server_missile.get('dirX') is not None:
        m['dirX'] = server_missile['dirX']
    if server_missile.get('dirY') is not None:
        m['dirY'] = server_missile['dirY']
    if server_missile.get('velocity') is not None:
        m['velocity'] = server_missile['velocity']
    if server_missile.get('totalFrames') is not None:
        m['total'] = server_missile['totalFrames']
    if server_missile.get('frames') is not None:
        m['frames'] = server_missile['frames']
    after = [cellOf(m['x']), cellOf(m['y'])]
    m['enteredCell'] = before[0] != after[0] or before[1] != after[1]
    if m['enteredCell']:
        m['cellsThisFrame'] = [after]


def endMirror(world, m, unit=None, rangeEnd=False, gone=True):
    """The server's copy hit `unit` (it may fly on) or ended (`unit` None; `rangeEnd` when its frames ran out)."""
    if not m or m['dead']:
        return
    hitHandler(world, m, unit, unit is None and not rangeEnd)
    if gone:
        m['dead'] = True


CLT_DO_READS = MappingProxyType({
    1: [], 2: [], 3: ['s1'], 4: ['s1'], 5: [], 6: ['s1', 's2', 's3'], 8: ['s1'], 9: ['s1', 's2'],
    10: ['s1', 's2'], 11: [], 12: [], 13: ['s1', 's2'], 15: ['s1'], 17: ['s1'], 18: ['s1'], 19: ['s1'], 20: [],
    27: ['s1'], 29: ['s1', 's2', 's3', 's1>s1'], 46: ['s1'], 48: ['s1', 's2'], 49: ['s1'], 50: ['s1'],
    52: ['s1'], 56: ['s1', 's2', 's3'], 57: ['s1'], 60: [], 69: ['s1'],
})
CLT_HIT_READS = MappingProxyType({
    1: ['h1?ml265'], 2: ['h1'], 4: ['h1'], 7: ['h1'], 10: [], 12: ['h1', 'h2', 'h3'], 14: ['h1', 'h2'], 16: [],
    18: ['h1', 'h2', 'h3', 'h4'], 19: ['h1', 'h2'], 24: ['h1'], 25: ['h1'], 30: ['h1'], 44: ['h1'], 51: ['h1'],
    52: ['h1', 'h3', 'ml456'], 54: ['h1'], 55: ['h1', 'h2', 'h3'],
})
TRANSLATED = MappingProxyType({
    'cltdo': sorted(CLT_DO), 'clthit': sorted(CLT_HIT), 'skilldo': sorted(CLIENT_SKILL_DO),
    'skillst': sorted(CLIENT_SKILL_START),
})


# -- the row adapter (gamedata.py rows -> the JS-style rows above) ----------------------------------------------

def _i(v, default=0):
    if v is None or v == '':
        return default
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).strip()
    for conv in (lambda x: int(x), lambda x: int(x, 0), lambda x: int(float(x))):
        try:
            return conv(s)
        except ValueError:
            pass
    return default


def ml_to_id(v, default=-1):
    """'ml123' / 123 / '' -> 123 (-1 when empty)."""
    if v is None or v == '':
        return default
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).strip()
    if s.lower().startswith('ml'):
        s = s[2:]
    return _i(s, default)


def id_to_ml(mid):
    return '' if mid is None or mid < 0 else 'ml%d' % mid


def adapt_missile_row(raw):
    """A gamedata.MIS row (string values) -> the JS-style missile row. Missing columns read as 0 / -1."""
    g = raw.get
    mid = ml_to_id(g('Missile'), -1)
    cel = g('CelFile')
    row = {
        'id': mid,
        'vel': _i(g('Vel')), 'velLev': _i(g('VelLev')), 'maxVel': _i(g('MaxVel')), 'accel': _i(g('Accel')),
        'range': _i(g('Range')), 'levRange': _i(g('LevRange')),
        'cltDo': _i(g('pCltDoFunc')), 'cltHit': _i(g('pCltHitFunc')),
        'cltParams': [_i(g('CltParam%d' % k)) for k in range(1, 6)],
        'cHitPar': [_i(g('cHitPar%d' % k)) for k in range(1, 4)],
        'cltSubMissiles': [ml_to_id(g('CltSubMissile%d' % k)) for k in range(1, 4)],
        'cltHitSubMissiles': [ml_to_id(g('CltHitSubMissile%d' % k)) for k in range(1, 5)],
        'hitSubMissiles': [ml_to_id(g('HitSubMissile%d' % k)) for k in range(1, 5)],
        'subMissile1': ml_to_id(g('SubMissile1')), 'subMissile2': ml_to_id(g('SubMissile2')),
        'subMissile3': ml_to_id(g('SubMissile3')),
        'explosionMissile': ml_to_id(g('ExplosionMissile')),
        'animLen': _i(g('AnimLen')), 'animSpeed': _i(g('AnimSpeed')), 'loopAnim': _i(g('LoopAnim')),
        'subLoop': _i(g('SubLoop')), 'subStart': _i(g('SubStart')), 'subStop': _i(g('SubStop')),
        'initSteps': _i(g('InitSteps')), 'activate': _i(g('Activate')), 'randStart': _i(g('RandStart')),
        'collideType': _i(g('CollideType')), 'collideKill': _i(g('CollideKill')),
        'collideFriend': _i(g('CollideFriend')), 'clientCol': _i(g('ClientCol')),
        'lastCollide': _i(g('LastCollide')), 'alwaysExplode': _i(g('AlwaysExplode')), 'size': _i(g('Size')),
        'progOverlay': _i(g('ProgOverlay')), 'clientSend': bool(_i(g('ClientSend'))),
        'server': False,   # set by build_client_rows
        'cltCalc': str(g('CltCalc1') if g('CltCalc1') is not None else ''),
        'sHitCalc': str(g('SHitCalc1') if g('SHitCalc1') is not None else ''),
        'params': [_i(g('Param%d' % k)) for k in range(1, 6)],
        'light': _i(g('Light')), 'rgb': [_i(g('Red')), _i(g('Green')), _i(g('Blue'))],
        'celFile': cel or '',
        'noArt': cel is not None and not str(cel).strip(),
    }
    return row


def adapt_skill_row(raw, sid):
    """A gamedata.SK row (string values) -> the JS-style skill row. Empty ids read as -1 / None."""
    g = raw.get

    def ov(key):
        v = g(key)
        return str(v) if v not in (None, '') else None

    aura = g('aurastate')
    return {
        'id': sid,
        'cltdo': _i(g('cltdofunc')), 'cltst': _i(g('cltstfunc')),
        'cltprg': [_i(g('cltprgfunc%d' % k)) for k in range(1, 4)],
        'cltMissiles': [ml_to_id(g(k)) for k in ('cltmissile', 'cltmissilea', 'cltmissileb', 'cltmissilec',
                                                  'cltmissiled')],
        'overlays': {'cast': ov('castoverlay'), 'tgt': ov('tgtoverlay'), 'srv': ov('srvoverlay'),
                     'clta': ov('cltoverlaya'), 'cltb': ov('cltoverlayb'), 'prg': ov('prgoverlay')},
        'srvdo': _i(g('srvdofunc')),
        'progressive': bool(_i(g('progressive'))), 'prgstack': bool(_i(g('prgstack'))),
        'lob': bool(_i(g('lob'))) if 'lob' in raw else False,
        'params': [_i(g('Param%d' % k)) for k in range(1, 9)],
        'cltCalcs': [g('cltcalc%d' % k) or '' for k in range(1, 4)],
        'calcs': [g('calc%d' % k) or '' for k in range(1, 5)],
        'prgCalcs': [g('prgcalc%d' % k) or '' for k in range(1, 4)],
        'auraState': None if aura in (None, '') else _i(aura),
        'auraRange': g('aurarangecalc') or '',
    }


def skill_ctx(row, level, evaluate=None):
    """The cast numbers the client functions read (ctx): calc1..4, auraRange, param3 / 4, prgCalc1, prgCalcs.
    `evaluate(text)` defaults to clientCalc (set CALC_EVALUATOR for '#cN' formulas)."""
    params = row.get('params') or []

    def ev(text):
        if evaluate:
            return evaluate(text)
        return clientCalc(text, level=level, params=params)

    calcs = row.get('calcs') or []
    prg = [ev(c) for c in row.get('prgCalcs') or []]
    return {'params': params, 'calc1': ev(_a(calcs, 0)), 'calc2': ev(_a(calcs, 1)), 'calc3': ev(_a(calcs, 2)),
            'calc4': ev(_a(calcs, 3)), 'auraRange': ev(row.get('auraRange')), 'param3': _z(params, 2),
            'param4': _z(params, 3), 'prgCalc1': _z(prg, 0), 'prgCalcs': [0] + prg}


def build_client_rows(gd):
    """(rows, skills) from a GameData-like object (.MIS dict 'mlN' -> raw, .SK list / dict of raw rows):
    int-keyed adapted dicts, with server=True on every missile reachable from a skill's srvmissile*
    columns through SubMissile* / HitSubMissile*."""
    rows = {}
    for key, raw in gd.MIS.items():
        r = adapt_missile_row(raw)
        if r['id'] < 0:
            r['id'] = ml_to_id(key)
        rows[r['id']] = r
    sk_items = gd.SK.items() if isinstance(gd.SK, dict) else enumerate(gd.SK)
    skills = {}
    server = []
    for sid, raw in sk_items:
        skills[sid] = adapt_skill_row(raw, sid)
        for col in ('srvmissile', 'srvmissilea', 'srvmissileb', 'srvmissilec'):
            mid = ml_to_id(raw.get(col))
            if mid >= 0:
                server.append(mid)
    seen = set()
    while server:
        mid = server.pop()
        if mid in seen or mid not in rows:
            continue
        seen.add(mid)
        r = rows[mid]
        r['server'] = True
        for sub in [r['subMissile1'], r['subMissile2'], r['subMissile3']] + r['hitSubMissiles']:
            if sub >= 0 and sub not in seen:
                server.append(sub)
    return rows, skills
