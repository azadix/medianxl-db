"""Median XL skill-animation emulator.

Engine core + built-in functions; skill and missile handlers live in plugins_a-d.py.
Speed: missile speed = (Vel + VelLev*lvl/8) * 3/64 subtiles per frame (create-missile code: fixed-point
velocity (Vel<<8)*75/100, and the flag-0x400 frame count dist*65536/(vel*16) => vel/4096 subtile a frame).
"""
import math, random, json, os, traceback
import numpy as np
from PIL import Image
from . import plugins_a, plugins_b, plugins_c, plugins_d, plugins_e
from . import client as CLT
from .gfx import JUNK, nearest_dir, safe, Sprites
from .calcvm import Calc
from .plugins_c import COS64, SIN64

VSCALE = 3 / 64.0
GIF_W, GIF_H = 800, 400
GIF_OUT_W, GIF_OUT_H = 600, 300
GIF_COLORS = 256
GIF_FRAME_MS = 40  # Diablo II runs at 25 fps
MIN_LOOP_FRAMES = 25
CASTER_SX, CASTER_SY = 100, 267
FLOOR_A = np.array([0, 0, 0], dtype=np.int32)
FLOOR_B = np.array([14, 14, 14], dtype=np.int32)
_FLOOR = None
plugins_b.VSCALE = VSCALE
plugins_c.VS_DEFAULT = VSCALE
GD = SPR = CALCVM = None
MIS, SK = {}, []


def init(gd):
    """Bind the engine to a loaded GameData."""
    global GD, SPR, CALCVM, MIS, SK
    GD, MIS, SK = gd, gd.MIS, gd.SK
    SPR = Sprites(gd)
    CALCVM = Calc(gd)


LVL = 20

PLUG = {}
for mod in (plugins_a, plugins_b, plugins_c, plugins_d, plugins_e):
    for k in dir(mod):
        if k.split('_')[0] in ('skill', 'mdo', 'mhit', 'cdo', 'chit') and callable(getattr(mod, k)):
            PLUG[k] = getattr(mod, k)

def n(r, c, d=0):
    try:
        return int(float((r or {}).get(c) or d))
    except (ValueError, TypeError):
        return d


def missile_draw_mode(trans):
    """missiles.bin Trans (+0x18d) -> D2gfx draw mode (D2Client 0x6fb1cf2a)."""
    t = n({'t': trans}, 't', 5)
    if t == 1:
        return 3  # additive
    if t == 2:
        return 4  # multiply
    return 5      # opaque


def overlay_draw_mode(trans):
    """overlay.bin Trans is the draw mode itself (blank = 0)."""
    try:
        t = int(float(trans))
    except (TypeError, ValueError):
        t = 0
    return t if 0 <= t <= 7 else 0


def missile_frame_at(age, anim_len, anim_speed, loop_anim, sub_loop, sub_start, sub_stop, total=None, start=0):
    """Client missile frame index (AnimSpeed << 4 per tick; SubStop never shown)."""
    count = max(int(anim_len or 1), 1) << 8
    speed = max(int(anim_speed or 16), 0) << 4
    fp = (int(start) << 8) + int(age) * speed
    if not loop_anim:
        fp = min(fp, count - 1) if count else 0
    elif sub_loop and total is not None:
        # While frames left exceed AnimLen - SubStop + 1, loop SubStart..SubStop-1.
        rem = max(int(total) - int(age), 0)
        threshold = max(int(anim_len or 1) - int(sub_stop or 0) + 1, 0)
        if rem > threshold:
            span = max((int(sub_stop or 0) - int(sub_start or 0)) << 8, 1)
            base = int(sub_start or 0) << 8
            # Advance within the loop window; SubStop itself is never shown.
            fp = base + (fp - base) % span
        else:
            fp = fp % count if count else 0
    else:
        fp = fp % count if count else 0
    return min(fp >> 8, max(int(anim_len or 1) - 1, 0))


def ring_vec(k):
    """64-dir ring, integer magnitude 30."""
    k %= 64
    return COS64[k], SIN64[k]


def vel_fp(row, lvl):
    """(((VelLev*lvl)>>3)+Vel)<<8, then *75/100."""
    v = ((n(row, 'VelLev') * int(lvl)) >> 3) + n(row, 'Vel')
    return int((v << 8) * 75 / 100)


def vel_subtiles(row, lvl):
    return vel_fp(row, lvl) / 4096.0


def _colored_light(row):
    if n(row, 'Light') <= 0:
        return False
    rgb = (n(row, 'Red'), n(row, 'Green'), n(row, 'Blue'))
    return rgb not in ((0, 0, 0), (255, 255, 255))


def tint_row(mid, seen=None):
    """Light RGB lives on the hit-sub art (Arrow, MissileDagger), not a null carrier."""
    if not mid or mid not in MIS:
        return {}
    r = MIS[mid]
    if _colored_light(r):
        return r
    cel = (r.get('CelFile') or '').lower()
    if cel and cel != 'null':
        return r
    seen = seen or set()
    if mid in seen:
        return r
    seen.add(mid)
    for col in ('HitSubMissile1', 'CltHitSubMissile1'):
        got = tint_row(r.get(col), seen)
        if _colored_light(got):
            return got
    return r


def own_cel(row):
    """True when the row ships its own DCC (Light RGB is then a glow, not a sprite tint)."""
    cel = ((row or {}).get('CelFile') or '').strip().lower()
    return bool(cel) and cel != 'null' and not JUNK.search(cel)


def light_tint(rgb, row, drawn=None):
    """Recolor generic arrow/dagger art by missiles.txt Light RGB.

    Light/Red/Green/Blue is the in-game dynamic light. Applying it to a real
    CelFile (LightAndShadowStrike, etc.) washes the sprite to that color.
    """
    if drawn is not None and own_cel(drawn):
        return rgb
    if not _colored_light(row):
        return rgb
    r, g, b = n(row, 'Red'), n(row, 'Green'), n(row, 'Blue')
    lum = rgb.max(axis=2, keepdims=True)
    peak = int(lum.max()) or 1
    return np.clip((lum * np.array([r, g, b], dtype=np.int32)) // peak, 0, 255)


def hammer_step(m, sim):
    """Path type 0xe (D2Common 10647): Blessed-Hammer style spiral around the caster."""
    d = m.data
    ox, oy = d.get('hammer_c') or sim.caster
    ang = d.get('hammer_a')
    if ang is None:
        ang = math.atan2(m.dy, m.dx)
        d['hammer_c'] = (ox, oy)
        d['hammer_r'] = math.hypot(m.x - ox, m.y - oy)
    rad = d.get('hammer_r', 0.5) + max(m.vel, 0.12)
    ang += 0.28
    d['hammer_a'] = ang
    d['hammer_r'] = rad
    nx = ox + rad * math.cos(ang)
    ny = oy + rad * math.sin(ang)
    dx, dy = nx - m.x, ny - m.y
    L = math.hypot(dx, dy) or 1
    m.dx, m.dy = dx / L, dy / L
    m.x, m.y = nx, ny
    return 'nomove'


class M:
    def __init__(s, sim, mid, x, y, dx, dy, target=None, range=None, vel=None, z=0.0, vz=0.0,
                 homing=None, sid=None, lvl=None, **kw):
        s.sim, s.id, s.r = sim, mid, MIS[mid]
        s.x, s.y = float(x), float(y)
        if dx == 0 and dy == 0:
            dx, dy = 1, 1
        L = math.hypot(dx, dy)
        s.dx, s.dy = dx / L, dy / L
        s.sid = sid if sid is not None else sim.sid
        s.lvl = lvl or sim.lvl
        s.vel = vel if vel is not None else vel_subtiles(s.r, s.lvl)
        s.maxvel = vel_subtiles({'Vel': n(s.r, 'MaxVel'), 'VelLev': 0}, s.lvl) if n(s.r, 'MaxVel') else 0
        s.accel = n(s.r, 'Accel') * VSCALE / 8
        s.range = range if range is not None else max(n(s.r, 'Range') + n(s.r, 'LevRange') * s.lvl, 1)
        s.age = 0
        s.counter = 0
        s.z, s.vz = float(z), float(vz)
        s.dead = False
        s.homing = homing
        s.target = target
        s.data = {'d28': s.dx * 30, 'd2c': s.dy * 30}
        s.frame = None
        s.hitset = {u for u in sim.targets if math.hypot(u[0] - x, u[1] - y) < 1.5}
        s.path = SPR.mis_path(mid)
        s.tint_r = tint_row(mid)
        s.ndir = SPR.ndir(s.path) if s.path else 1
        s.trans = n(s.r, 'Trans')
        s.activate = n(s.r, 'Activate')
        s.loop = n(s.r, 'LoopAnim') > 0
        s.anim_len = max(n(s.r, 'AnimLen'), 1)
        s.anim_speed = n(s.r, 'AnimSpeed') or 16
        s.sub_loop = n(s.r, 'SubLoop') > 0
        s.sub_start = n(s.r, 'SubStart')
        s.sub_stop = n(s.r, 'SubStop')
        s.anim_start = 0
        if n(s.r, 'RandStart'):
            s.anim_start = sim.rng.randrange(s.anim_len)
            s.data['frame_offset'] = s.anim_start
        s.draw_mode = missile_draw_mode(n(s.r, 'Trans'))
        s.client_send = bool(s.r.get('ClientSend'))
        s.uid = sim.next_uid()
        s.exploded = False

    # -------- built-in server do
    def do(s):
        sim = s.sim
        f = n(s.r, 'pSrvDoFunc')
        P = [n(s.r, 'Param%d' % i) for i in range(1, 6)]
        res = None
        if f == 15:
            if s.age % max(P[0], 1) == 0:
                sub = s.r.get('SubMissile1')
                vx, vy = ring_vec(s.counter)
                if sub:
                    sim.spawn(sub, s.x, s.y, vx, vy, sid=s.sid, lvl=s.lvl)
                s.counter = (s.counter + P[1]) % 64
        elif f == 16:
            # x' = (x - y)/2, y' = (x + y)/2 on the +0x28 (x) / +0x2c (y) path offset
            if s.age < P[0] and s.age % max(P[1], 1) == 0:
                x, y = s.data['d28'], s.data['d2c']
                x, y = (x - y) / 2, (x + y) / 2
                s.data['d28'], s.data['d2c'] = x, y
                L = math.hypot(x, y) or 1
                s.dx, s.dy = x / L, y / L
        elif f == 28:
            if P[2] < s.age < P[3] and s.age % max(P[0], 1) == 0:
                sub = s.r.get('SubMissile1')
                if sub:
                    rx = sim.rng.randint(0, 2 * P[1]) - P[1]
                    ry = sim.rng.randint(0, 2 * P[1]) - P[1]
                    sim.spawn(sub, s.x + rx, s.y + ry, s.dx, s.dy, sid=s.sid, lvl=s.lvl)
        elif 'mdo_%d' % f in PLUG:
            res = PLUG['mdo_%d' % f](s, sim)
        return res

    def explode_stand_in(s):
        """Arena stand-in for ExplosionMissile (client hit handler draws it for server rows)."""
        if s.exploded:
            return
        mid = s.r.get('ExplosionMissile')
        if not mid or mid not in MIS:
            return
        s.exploded = True
        # flags 0x20 aimed at map origin: a MOVING explosion is refused (100-cell rule);
        # a standing one is made at the parent. Match that for the GIF stand-in.
        if CLT.rowMoves(CLT.ml_to_id(mid), s.lvl, getattr(s.sim, 'client_rows', None) or {}):
            return
        child = s.sim.spawn(mid, s.x, s.y, s.dx, s.dy, sid=s.sid, lvl=s.lvl, vel=0)
        if child is not None:
            child.data['explosion_stand_in'] = True

    def hit(s, unit=None):
        sim = s.sim
        f = n(s.r, 'pSrvHitFunc')
        res = None
        if f == 29:
            step = max(n(s.r, 'sHitPar1'), 1)
            sub = s.r.get('HitSubMissile1')
            if sub:
                for k in range(0, 64, step):
                    vx, vy = ring_vec(k)
                    sim.spawn(sub, s.x, s.y, vx, vy, sid=s.sid, lvl=s.lvl)
        elif f == 51:
            for col in ('HitSubMissile1', 'HitSubMissile2', 'HitSubMissile3'):
                sub = s.r.get(col)
                if sub:
                    sim.spawn(sub, s.x, s.y, s.dx, s.dy, sid=s.sid, lvl=s.lvl)
        elif f == 20:
            sub = s.r.get('HitSubMissile1')
            if sub:
                for tx, ty in sim.targets:
                    if math.hypot(tx - s.x, ty - s.y) <= sim.radius:
                        sim.spawn(sub, s.x, s.y, tx - s.x, ty - s.y, homing=(tx, ty), sid=s.sid, lvl=s.lvl)
        elif 'mhit_%d' % f in PLUG:
            try:
                res = PLUG['mhit_%d' % f](s, sim, unit)
            except Exception:
                sim.errors.append('mhit_%d %s' % (f, traceback.format_exc(limit=1)))
        if unit is not None:
            po = s.r.get('ProgOverlay')
            if po not in (None, '', '0', '65535'):
                sim.add_overlay(po, unit[0], unit[1])
        # Server missiles: explosion stand-in (client world handles ClientSend mirrors separately).
        s.explode_stand_in()
        return res

    def move(s):
        d = s.data
        if d.get('hammer') or d.get('pathtype') == 14:
            hammer_step(s, s.sim)
            return
        for key, fn in (('mover', None), ('path', plugins_d.path_step), ('wander', plugins_c.path_hook)):
            if d.get(key):
                fn = d['mover'] if key == 'mover' else fn
                r = fn(s, s.sim)
                if r == 'nomove':
                    return
        if s.homing:
            hx, hy = s.homing[0] - s.x, s.homing[1] - s.y
            L = math.hypot(hx, hy)
            if L > 1e-6:
                s.dx, s.dy = hx / L, hy / L
        if s.accel and s.maxvel:
            s.vel = min(s.vel + s.accel, s.maxvel)
        s.x += s.dx * s.vel
        s.y += s.dy * s.vel

    def step(s):
        try:
            r = s.do()
        except Exception:
            s.sim.errors.append('do %s %s' % (s.id, traceback.format_exc(limit=2)))
            r = None
        if r != 'nomove' and not s.dead:
            s.move()
        if s.vz:
            s.z = max(s.z - s.vz, 0)
        s.age += 1
        if s.dead:
            return
        # stand-in enemies (skip until Activate frame)
        act = s.data.get('activate', s.activate)
        if s.sim.collide and s.vel > 0 and s.age >= act:
            for u in s.sim.targets:
                if u not in s.hitset and math.hypot(u[0] - s.x, u[1] - s.y) < 0.9:
                    s.hitset.add(u)
                    if s.hit(u) != 'pierce':
                        s.dead = True
                        return
        if s.homing and math.hypot(s.homing[0] - s.x, s.homing[1] - s.y) < 0.8:
            s.dead = True
            return
        if s.age >= s.range:
            s.dead = True
            if n(s.r, 'AlwaysExplode') > 0:
                s.hit()
            else:
                # Range end without AlwaysExplode: no explosion (client hit handler rule).
                pass


class Sim:
    def __init__(s, sid, lvl=LVL, seed=7):
        s.sid, s.lvl = sid, lvl
        s.ms, s.new, s.rng = [], [], random.Random(seed)
        s.targets, s.radius, s.collide = [], 15, False
        s.caster, s.target = (0, 0), (8, -8)
        s.pending, s.errors = [], []
        s.vscale = VSCALE
        s.charges = 3
        s.depth = 0
        s.overlays = []
        s.tick_i = 0
        s._uid = 1
        s.client = None
        s.client_rows = {}
        s.client_skills = {}
        s.mirrors = {}  # server uid -> client missile
        s._born_server = {}  # mid_id -> last birth tick (stand-in pairing)

    def next_uid(s):
        u = s._uid
        s._uid += 1
        return u

    def add_overlay(s, oid, x, y):
        if oid in (None, '', '0', '-1'):
            return
        s.overlays.append({'id': oid, 'x': float(x), 'y': float(y), 'age': 0})

    # API used by plug-ins
    def spawn(s, mid, x, y, dx, dy, **kw):
        if not mid or mid not in MIS or len(s.ms) + len(s.new) > 3000:
            return None
        m = M(s, mid, x, y, dx, dy, **kw)
        s.new.append(m)
        return m

    def add(s, m):
        s.new.append(m)

    def calc(s, sid, expr, default=0):
        return CALCVM.value(sid, expr, s.lvl, default)

    def skill_row(s, sid):
        return SK[sid]

    def mis_row(s, mid):
        return MIS.get(mid)

    def ring_vec(s, k):
        return ring_vec(k)

    def after(s, frames, fn):
        s.pending.append([frames, fn])

    def cast_skill(s, sid, tx, ty, lvl=None, cx=None, cy=None):
        if s.depth > 3:
            return
        s.depth += 1
        try:
            launch(s, sid, tx, ty, cx, cy)
        finally:
            s.depth -= 1

    def _server_view(s, m):
        mid = CLT.ml_to_id(m.id)
        return {
            'id': m.uid,
            'defId': mid,
            'x': int(m.x * CLT.SUBTILE + CLT.SUBTILE // 2),
            'y': int(m.y * CLT.SUBTILE + CLT.SUBTILE // 2),
            'dirX': int(m.dx * 4096),
            'dirY': int(m.dy * 4096),
            'velocity': int(m.vel * 4096),
            'frames': max(m.range - m.age, 0),
            'totalFrames': m.range,
            'level': m.lvl,
            'skillId': m.sid,
        }

    def _sync_client(s):
        """Mirror ClientSend server missiles; settle stand-ins; step client world."""
        cw = s.client
        if not cw:
            return
        # Units: caster + stand-in enemies
        units = [{
            'id': 'player', 'x': int(s.caster[0] * CLT.SUBTILE + CLT.SUBTILE // 2),
            'y': int(s.caster[1] * CLT.SUBTILE + CLT.SUBTILE // 2),
            'cell': [int(math.floor(s.caster[0])), int(math.floor(s.caster[1]))],
            'size': 2, 'alive': True, 'hostile': False, 'player': True,
            'facing': [1, 1], 'local': True,
        }]
        for i, (tx, ty) in enumerate(s.targets):
            units.append({
                'id': 'enemy%d' % i,
                'x': int(tx * CLT.SUBTILE + CLT.SUBTILE // 2),
                'y': int(ty * CLT.SUBTILE + CLT.SUBTILE // 2),
                'cell': [int(math.floor(tx)), int(math.floor(ty))],
                'size': 2, 'alive': True, 'hostile': True, 'player': False,
            })
        live_uids = {m.uid for m in s.ms if not m.dead}
        # Create / sync mirrors for ClientSend rows
        for m in s.ms:
            if m.dead or not m.client_send:
                continue
            view = s._server_view(m)
            if m.uid not in s.mirrors:
                owner = units[0]
                cm = CLT.mirrorServerMissile(cw, view, owner=owner, ctx=CLT.skill_ctx(s.client_skills.get(s.sid) or {}, s.lvl))
                if cm:
                    s.mirrors[m.uid] = cm
            else:
                CLT.syncMirror(s.mirrors[m.uid], view)
        # End mirrors whose server twin is gone
        for uid in list(s.mirrors):
            if uid not in live_uids:
                CLT.endMirror(cw, s.mirrors.pop(uid), rangeEnd=True, gone=True)
        # Stand-in grace: hide client copies of server rows while a twin is live
        born = {}
        for m in s.ms:
            if not m.dead:
                mid = CLT.ml_to_id(m.id)
                born[mid] = s.tick_i
        for cm in list(cw.get('missiles') or []):
            if cm.get('dead') or not cm.get('standIn'):
                continue
            mid = cm.get('defId')
            age = cw.get('tick', 0) - cm.get('born', 0)
            if mid in born and age <= CLT.STAND_IN_GRACE:
                continue
            if mid not in born and age > CLT.STAND_IN_GRACE:
                CLT.releaseStandIn(cw, cm)
            elif mid in born:
                # still shadowed
                pass
            else:
                CLT.releaseStandIn(cw, cm)
        CLT.stepClientWorld(cw, units)

    def tick(s):
        p2 = []
        for item in s.pending:
            item[0] -= 1
            if item[0] <= 0:
                try:
                    item[1]()
                except Exception:
                    s.errors.append('pending')
            else:
                p2.append(item)
        s.pending = p2
        s.ms += s.new
        s.new = []
        for m in s.ms:
            if not m.dead:
                m.step()
        s.ms = [m for m in s.ms if not m.dead]
        s.ms += s.new
        s.new = []
        for o in s.overlays:
            o['age'] += 1
        s.overlays = [o for o in s.overlays if o['age'] < 48]
        s._sync_client()
        s.tick_i += 1


def _ensure_client(sim):
    if sim.client is not None:
        return
    if not hasattr(_ensure_client, '_cache') or _ensure_client._gd is not GD:
        rows, skills = CLT.build_client_rows(type('GD', (), {'MIS': MIS, 'SK': SK})())
        _ensure_client._cache = (rows, skills)
        _ensure_client._gd = GD
        # clientCalc('#cN', level, params) -> number via Calc VM (sid unknown: use 0).
        CLT.set_calc_evaluator(lambda expr, lvl, params=None: CALCVM.value(0, expr, lvl, 0) if expr else 0)
    rows, skills = _ensure_client._cache
    sim.client_rows, sim.client_skills = rows, skills
    sim.client = CLT.createClientWorld(missiles=rows, skills=skills, seed=7)
    # Player unit view for cast
    sim.client['player'] = {
        'id': 'player',
        'x': int(sim.caster[0] * CLT.SUBTILE + CLT.SUBTILE // 2),
        'y': int(sim.caster[1] * CLT.SUBTILE + CLT.SUBTILE // 2),
        'facing': [1, 1], 'local': True, 'states': {},
    }


def launch(sim, sid, tx, ty, cx=None, cy=None):
    row = SK[sid]
    cx, cy = (sim.caster if cx is None else (cx, cy))
    _ensure_client(sim)
    # Client cast start (swing begin)
    cast = {
        'skillId': sid,
        'level': sim.lvl,
        'caster': sim.client['player'],
        'target': [int(math.floor(tx)), int(math.floor(ty))],
        'targetUnit': {'id': 'enemy0', 'cell': [int(math.floor(tx)), int(math.floor(ty))],
                       'x': int(tx * CLT.SUBTILE + CLT.SUBTILE // 2),
                       'y': int(ty * CLT.SUBTILE + CLT.SUBTILE // 2),
                       'alive': True, 'hostile': True} if sim.targets else None,
        'ctx': CLT.skill_ctx(sim.client_skills.get(sid) or {}, sim.lvl),
        'charges': sim.charges,
    }
    try:
        CLT.clientCastStart(sim.client, cast)
    except Exception:
        sim.errors.append('clientCastStart %s' % traceback.format_exc(limit=1))
    f = n(row, 'srvdofunc')
    if f == 28 or f == 80:
        mid = row.get('srvmissilea')
        if mid:
            sim.spawn(mid, tx, ty, tx - cx, ty - cy, target=(tx, ty), sid=sid)
    elif 'skill_do_%d' % f in PLUG:
        try:
            PLUG['skill_do_%d' % f](sim, sid, row, cx, cy, tx, ty)
        except Exception:
            sim.errors.append('skill_do_%d %s' % (f, traceback.format_exc(limit=2)))
    elif f:
        sim.errors.append('missing skill_do_%d' % f)
    mid = row.get('srvmissile')
    if mid:
        cx, cy = sim.caster
        sim.spawn(mid, cx, cy, tx - cx, ty - cy, target=(tx, ty), sid=sid)
    # Client release (cltmissile tail + cltdofunc) — replaces the old cltmissile spawn
    try:
        CLT.clientCast(sim.client, cast)
    except Exception:
        sim.errors.append('clientCast %s' % traceback.format_exc(limit=1))
    # castoverlay at swing start (server/client both draw it)
    sim.add_overlay(row.get('castoverlay'), cx, cy)


# ---------------------------------------------------------------- drawing
def screen(x, y):
    return (x - y) * 16, (x + y) * 8


def blit(c, X, Y, spr, mode=5):
    """Blit spr with D2gfx draw mode: 0/1/2 alpha, 3 add, 4 multiply, 5/7 opaque."""
    ox, oy, rgb, m = spr
    h, w = m.shape
    H, W = c.shape[:2]
    X, Y = int(round(X + ox)), int(round(Y + oy))
    x1, y1, x2, y2 = max(X, 0), max(Y, 0), min(X + w, W), min(Y + h, H)
    if x1 >= x2 or y1 >= y2:
        return
    src = rgb[y1 - Y:y2 - Y, x1 - X:x2 - X]
    mm = m[y1 - Y:y2 - Y, x1 - X:x2 - X]
    base = c[y1:y2, x1:x2]
    t = mode if not isinstance(mode, bool) else (5 if mode else 3)
    if t == 3:
        mixed = np.clip(base + src, 0, 255)
        base[mm] = mixed[mm]
    elif t == 4:
        mixed = (base * src) // 255
        base[mm] = mixed[mm]
    elif t in (0, 1, 2):
        alpha = (64, 128, 192)[t]  # 25 / 50 / 75 %
        mixed = (base * (255 - alpha) + src * alpha) // 255
        base[mm] = mixed[mm]
    else:
        base[mm] = src[mm]
    c[y1:y2, x1:x2] = base


def _face_ang(src, dst):
    dx, dy = dst[0] - src[0], dst[1] - src[1]
    X, Y = screen(dx, dy)
    return math.degrees(math.atan2(Y, X))


def _unit_frame(kind, token, mode, src, dst, t, loop=True, wclass=None):
    anim = SPR.unit(kind, token, mode, wclass)
    if not anim:
        return None
    d = nearest_dir(anim['ndir'], _face_ang(src, dst))
    frs = anim['dirs'][d] if d < len(anim['dirs']) else []
    if not frs:
        return None
    i = t % len(frs) if loop else min(t, len(frs) - 1)
    return frs[i]


def _caster_sprite(sim, t):
    toward = sim.target or (8, -8)
    cast = SPR.unit('char', 'AM', 'SC')
    wc = cast['wclass'] if cast else None
    n_sc = 0
    if cast:
        d = nearest_dir(cast['ndir'], _face_ang(sim.caster, toward))
        n_sc = len(cast['dirs'][d]) if d < len(cast['dirs']) else 0
    if cast and t < n_sc:
        return _unit_frame('char', 'AM', 'SC', sim.caster, toward, t, loop=False, wclass=wc)
    idle_t = max(t - n_sc, 0)
    return _unit_frame('char', 'AM', 'NU', sim.caster, toward, idle_t, loop=True, wclass=wc)


def _actor_draws(sim, t):
    out = []
    spr = _caster_sprite(sim, t)
    if spr:
        out.append((sim.caster, spr))
    toward = sim.caster
    for i, p in enumerate(sim.targets):
        zspr = _unit_frame('monster', 'ZM', 'NU', p, toward, t + i * 3, loop=True)
        if zspr:
            out.append((p, zspr))
    return out


def _floor():
    global _FLOOR
    if _FLOOR is None:
        sy, sx = np.ogrid[:GIF_H, :GIF_W]
        wx = (sx - CASTER_SX) / 32.0 + (sy - CASTER_SY) / 16.0
        wy = (sy - CASTER_SY) / 16.0 - (sx - CASTER_SX) / 32.0
        odd = ((np.floor(wx).astype(np.int32) + np.floor(wy).astype(np.int32)) & 1) != 0
        _FLOOR = np.empty((GIF_H, GIF_W, 3), dtype=np.int32)
        _FLOOR[:] = FLOOR_A
        _FLOOR[odd] = FLOOR_B
    return _FLOOR


def _prog_overlay_frame(m):
    po = m.r.get('ProgOverlay')
    if po in (None, '', '0', '65535'):
        return None
    ang = math.degrees(math.atan2(*screen(m.dx, m.dy)[::-1]))
    spr, _tr = overlay_frame(po, m.age, ang)
    return spr


def sprite_frame(m):
    if not m.path:
        return _prog_overlay_frame(m)
    d = nearest_dir(m.ndir, math.degrees(math.atan2(*screen(m.dx, m.dy)[::-1])))
    fr = SPR.sprite(m.path, d)
    if not fr:
        return _prog_overlay_frame(m)
    if m.frame is not None:
        i = int(m.frame) % len(fr)
    else:
        i = missile_frame_at(
            m.age, m.anim_len, m.anim_speed, m.loop, m.sub_loop,
            m.sub_start, m.sub_stop, total=m.range, start=m.anim_start,
        )
        i = min(i, len(fr) - 1)
    ox, oy, rgb, mask = fr[i]
    return ox, oy, light_tint(rgb, getattr(m, 'tint_r', None) or m.r, drawn=m.r), mask


def client_missile_sprite(cm):
    """Draw a non-shadow client missile from the client world."""
    if cm.get('shadow') or cm.get('standIn') or cm.get('dead'):
        return None
    mid = CLT.id_to_ml(cm.get('defId'))
    if not mid or mid not in MIS:
        return None
    path = SPR.mis_path(mid)
    row = MIS[mid]
    if not path or JUNK.search(row.get('CelFile', '') or ''):
        po = row.get('ProgOverlay')
        if po in (None, '', '0', '65535'):
            return None
        ang = 0
        if cm.get('dirX') or cm.get('dirY'):
            ang = math.degrees(math.atan2(*screen(cm.get('dirX', 0) / 4096.0, cm.get('dirY', 0) / 4096.0)[::-1]))
        return overlay_frame(po, cm.get('total', 1) - cm.get('frames', 0), ang)[0]
    nd = SPR.ndir(path)
    dx = cm.get('dirX', 0) / 4096.0
    dy = cm.get('dirY', 0) / 4096.0
    ang = math.degrees(math.atan2(*screen(dx or 1, dy or 0)[::-1]))
    d = nearest_dir(nd, ang)
    fr = SPR.sprite(path, d)
    if not fr:
        return None
    age = max((cm.get('total') or 1) - (cm.get('frames') or 0), 0)
    i = missile_frame_at(
        age, n(row, 'AnimLen') or 1, n(row, 'AnimSpeed') or 16,
        n(row, 'LoopAnim') > 0, n(row, 'SubLoop') > 0,
        n(row, 'SubStart'), n(row, 'SubStop'),
        total=cm.get('total'), start=cm.get('animStart') or 0,
    )
    i = min(i, len(fr) - 1)
    ox, oy, rgb, mask = fr[i]
    return ox, oy, light_tint(rgb, tint_row(mid), drawn=row), mask




def visible(m):
    if m.path and not JUNK.search(m.r.get('CelFile', '') or ''):
        return True
    po = m.r.get('ProgOverlay')
    return po not in (None, '', '0', '65535') and SPR is not None and bool(SPR.ovl_path(po)[0])


def simulate(sid, layout, frames=240, lvl=LVL, seed=7):
    sim = Sim(sid, lvl=lvl, seed=seed)
    sim.target = layout['target']
    sim.targets = layout.get('enemies', [])
    sim.collide = bool(sim.targets)
    launch(sim, sid, *sim.target)
    snaps = []
    osnaps = []
    csnaps = []
    for t in range(frames):
        sim.tick()
        snaps.append([(m.path, m, sprite_frame(m), m.x, m.y, m.z, m.draw_mode)
                      for m in sorted(sim.ms, key=lambda m: m.x + m.y) if visible(m)])
        osnaps.append([(o['id'], o['x'], o['y'], o['age']) for o in sim.overlays])
        # Client overlays from clientCast (unit-attached) -> world coords
        if sim.client:
            for o in sim.client.get('overlays') or []:
                # place on caster / target by unitId
                uid = o.get('unitId')
                if uid == 'player':
                    ox, oy = sim.caster
                elif sim.targets:
                    ox, oy = sim.targets[0]
                else:
                    ox, oy = sim.target
                osnaps[-1].append((o.get('name'), ox, oy, sim.client.get('tick', 0) - o.get('born', 0)))
        frame_c = []
        if sim.client:
            for cm in sim.client.get('missiles') or []:
                if cm.get('shadow') or cm.get('standIn') or cm.get('dead'):
                    continue
                # Skip if a live server missile of the same row is drawn (stand-in already hidden)
                spr = client_missile_sprite(cm)
                if spr is None:
                    continue
                mid = CLT.id_to_ml(cm.get('defId'))
                mode = missile_draw_mode(n(MIS.get(mid) or {}, 'Trans'))
                hoff = CLT.heightOffset(cm.get('height')) or {'x': 0, 'y': 0}
                frame_c.append((cm, spr, mode, hoff['x'], hoff['y']))
        csnaps.append(frame_c)
        client_live = bool(sim.client and any(not m.get('dead') for m in (sim.client.get('missiles') or [])))
        if not sim.ms and not sim.new and not sim.pending and not sim.overlays and not client_live:
            break
    sim.overlay_snaps = osnaps
    sim.client_snaps = csnaps
    return sim, snaps


def snaps_have_skill_gfx(snaps, overlay_snaps=None, client_snaps=None):
    """True if any missile sprite or loadable overlay would actually draw (ignores the caster)."""
    if any(item[2] is not None for fr in snaps or () for item in fr):
        return True
    if any(fr for fr in client_snaps or ()):
        return True
    for fr in overlay_snaps or ():
        for item in fr:
            oid = item[0] if item else None
            if oid not in (None, '', '0', '-1') and overlay_frame(oid, 0)[0] is not None:
                return True
    return False


def overlay_frame(oid, age, ang=0, on_player=True):
    if SPR is None:
        return None, 5
    path, rec = SPR.ovl_path(oid)
    if not path:
        return None, 5
    nd = SPR.ndir(path)
    d = nearest_dir(nd, ang) if nd > 1 else 0
    fr = SPR.sprite(path, d)
    if not fr:
        return None, 5
    rate = max(int(rec.get('AnimRate') or 16), 1)
    i = min(age * rate // 16, len(fr) - 1)
    ox, oy, rgb, m = fr[i]
    # Player uses Height2 (k=1 -> Height1..4 index); k=0 would add +75.
    y_extra = rec.get('Height2', 0) if on_player else rec.get('Height1', 0)
    return (ox + rec.get('Xoffset', 0), oy + rec.get('Yoffset', 0) + y_extra, rgb, m), overlay_draw_mode(rec.get('Trans', 0))


def render(sim, snaps, maxw=GIF_W, maxh=GIF_H, focus=None):
    if not snaps_have_skill_gfx(snaps, getattr(sim, 'overlay_snaps', None), getattr(sim, 'client_snaps', None)):
        return None
    cx, cy = CASTER_SX, CASTER_SY
    render.origin = (cx, cy)
    floor = _floor()
    out = []
    toward = sim.target or (8, -8)
    ang = _face_ang(sim.caster, toward)
    client_snaps = getattr(sim, 'client_snaps', None) or []
    for t, fr in enumerate(snaps):
        c = floor.copy()
        for oid, ox, oy, age in (sim.overlay_snaps[t] if t < len(getattr(sim, 'overlay_snaps', ())) else ()):
            spr, tr = overlay_frame(oid, age, ang)
            if spr is None:
                continue
            X, Y = screen(ox, oy)
            blit(c, cx + X, cy + Y, spr, tr)
        for path, m, f, x, y, z, mode in fr:
            if f is not None:
                X, Y = screen(x, y)
                blit(c, cx + X, cy + Y - z, f, mode)
        # Client-only missiles (non-shadow)
        if t < len(client_snaps):
            for cm, spr, mode, hx, hy in client_snaps[t]:
                if spr is None:
                    continue
                x = cm['x'] / CLT.SUBTILE
                y = cm['y'] / CLT.SUBTILE
                X, Y = screen(x, y)
                blit(c, cx + X + hx, cy + Y + hy, spr, mode)
        # Units last so missile tints/palettes never recolor the amazon or dummy.
        for pos, spr in _actor_draws(sim, t):
            X, Y = screen(*pos)
            blit(c, cx + X, cy + Y, spr, 5)
        out.append(c)
    return out, 1.0


def _gif_save_kw(duration, loop):
    # Diff frames vs the previous full frame (optimize) and leave pixels in place
    # (disposal 1). Changed fire-to-floor pixels are rewritten, so nothing ghosts.
    # Duration stays 40 ms so playback matches Diablo II's 25 fps.
    kw = dict(save_all=True, duration=duration, optimize=True, disposal=1, interlace=False)
    if loop is not None:
        kw['loop'] = loop
    return kw


def _palette_ref(rgb_imgs):
    """First frame keeps unit colors; extra strip holds missile colors that appear later."""
    first = rgb_imgs[0]
    fa = np.asarray(first, dtype=np.int32)
    fx = []
    for im in rgb_imgs:
        a = np.asarray(im, dtype=np.int32)
        changed = np.abs(a - fa).sum(axis=2) > 48
        if changed.any():
            fx.append(a[changed])
    if not fx:
        return first
    samples = np.concatenate(fx, axis=0)
    if len(samples) > 20000:
        samples = samples[::len(samples) // 20000]
    w = 200
    h = max((len(samples) + w - 1) // w, 1)
    pad = h * w - len(samples)
    if pad:
        samples = np.vstack([samples, np.broadcast_to(samples[-1], (pad, 3))])
    strip = samples[:h * w].reshape(h, w, 3).astype(np.uint8)
    canvas = Image.new('RGB', (max(first.width, w), first.height + h))
    canvas.paste(first, (0, 0))
    canvas.paste(Image.fromarray(strip), (0, first.height))
    return canvas


def _quantize_save(imgs, path, colors, duration=GIF_FRAME_MS, loop=0):
    rgb = [im.convert('RGB') if im.mode != 'RGB' else im for im in imgs]
    pq = _palette_ref(rgb).quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    q = [im.quantize(palette=pq, dither=Image.Dither.NONE) for im in rgb]
    pal = q[0].palette
    q[0].save(path, append_images=q[1:], palette=pal, **_gif_save_kw(duration, loop))


def _drop_frames_to_fit(path, max_bytes, loop=0):
    from PIL import ImageSequence
    with Image.open(path) as im:
        fr = [x.copy() for x in ImageSequence.Iterator(im)]
    if len(fr) < 2:
        return
    n = len(fr)
    tmp = path + '.tmp.gif'
    try:
        while n > 4:
            n = max(4, n * 3 // 4)
            sub = fr[:n]
            sub[0].save(tmp, append_images=sub[1:], palette=sub[0].palette,
                        **_gif_save_kw(GIF_FRAME_MS, loop))
            if os.path.getsize(tmp) <= max_bytes:
                os.replace(tmp, path)
                return
            os.remove(tmp)
        sub = fr[:4]
        sub[0].save(tmp, append_images=sub[1:], palette=sub[0].palette,
                    **_gif_save_kw(GIF_FRAME_MS, loop))
        os.replace(tmp, path)
    finally:
        if os.path.isfile(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def save(frames, path, scale=1.0, maxframes=200, colors=GIF_COLORS):
    if len(frames) > maxframes:
        frames = frames[:maxframes]
    if len(frames) >= MIN_LOOP_FRAMES:
        frames = list(frames) + [frames[-1]] * 2     # short pause before the loop restarts
    imgs = []
    for f in frames:
        im = Image.fromarray(np.clip(f, 0, 255).astype(np.uint8)).convert('RGB')
        if im.size != (GIF_OUT_W, GIF_OUT_H):
            im = im.resize((GIF_OUT_W, GIF_OUT_H), Image.NEAREST)
        imgs.append(im)
    imgs[0].save(
        path,
        format='WEBP',
        save_all=True,
        append_images=imgs[1:],
        duration=GIF_FRAME_MS,
        loop=0,
        quality=80,
        method=4,
    )
    return imgs, 0


NEEDS_ENEMIES_HIT = {20, 12, 10, 72}
NEEDS_ENEMIES_SKILL = {11, 14, 80, 63}


def layout_for(sid, chain):
    row = SK[sid]
    lay = {'target': (8, -8)}
    hits = {n(MIS[m], 'pSrvHitFunc') for m in chain if m in MIS}
    if hits & NEEDS_ENEMIES_HIT or n(row, 'srvdofunc') in NEEDS_ENEMIES_SKILL:
        lay['enemies'] = [(8, -8)]
    return lay


def canvas_origin(sim, snaps):
    return render.origin


def frame_energy(frames):
    floor = _floor()
    return max((np.abs(f - floor).sum() for f in frames), default=0)




SUBC = ['SubMissile1', 'SubMissile2', 'SubMissile3', 'HitSubMissile1', 'HitSubMissile2', 'HitSubMissile3',
        'HitSubMissile4', 'CltSubMissile1', 'CltSubMissile2', 'CltSubMissile3', 'CltHitSubMissile1',
        'CltHitSubMissile2', 'CltHitSubMissile3', 'CltHitSubMissile4', 'ExplosionMissile']


def chain(sid):
    """All missiles a skill can create (srvmissile*/cltmissile* and their sub/hit missiles)."""
    sk = SK[sid]
    st = [sk.get(c) for c in ('srvmissile', 'srvmissilea', 'srvmissileb', 'srvmissilec', 'cltmissile',
                              'cltmissilea', 'cltmissileb', 'cltmissilec', 'cltmissiled')]
    seen = []
    while st:
        m = st.pop()
        if not m or m in seen or m not in MIS:
            continue
        seen.append(m)
        st += [MIS[m].get(c) for c in SUBC]
    return seen


def has_graphics(sid):
    for mid in chain(sid):
        r = MIS[mid]
        if SPR.mis_path(mid) and not JUNK.search(r.get('CelFile', '') or ''):
            return True
        po = r.get('ProgOverlay')
        if po not in (None, '', '0', '65535') and SPR.ovl_path(po)[0]:
            return True
    row = SK[sid]
    for col in ('castoverlay', 'cltoverlaya', 'cltoverlayb', 'tgtoverlay', 'srvoverlay'):
        oid = row.get(col)
        if oid not in (None, '', '0', '-1') and SPR.ovl_path(oid)[0]:
            return True
    return False


def render_skill(sid, lvl=LVL, distance=11, enemies='auto', max_w=GIF_W, max_h=GIF_H, max_frames=200, seed=7, zoom='auto'):
    """Simulate and draw one skill. Returns (frames, scale, info) or (None, None, info)."""
    d = distance / math.sqrt(2)
    lay = layout_for(sid, chain(sid))
    lay['target'] = (d, -d)
    if enemies == 'on' or (enemies == 'auto' and lay.get('enemies')):
        lay['enemies'] = [(d, -d)]
    else:
        lay.pop('enemies', None)
    sim, snaps = simulate(sid, lay, frames=max_frames, lvl=lvl, seed=seed)
    info = {'errors': sim.errors[:6], 'sim_frames': len(snaps)}
    r = render(sim, snaps)
    if not r or frame_energy(r[0]) < 2000:
        if not snaps_have_skill_gfx(snaps, getattr(sim, 'overlay_snaps', None), getattr(sim, 'client_snaps', None)):
            info['why'] = 'no missile or overlay graphics'
        else:
            info['why'] = 'nothing visible (this skill\'s graphics come from code the emulator does not cover)'
        return None, None, info
    fr, sc = r
    info.update(frames=len(fr), width=GIF_OUT_W, height=GIF_OUT_H)
    return fr, sc, info


def save_gif(frames, path, scale=1.0):
    """Write a looping 25 fps 600x300 WebP. Name kept for existing callers."""
    save(frames, path, scale)
    return os.path.getsize(path)
