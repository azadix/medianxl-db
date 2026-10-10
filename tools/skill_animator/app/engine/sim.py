"""Median XL skill-animation emulator.

Engine core + built-in functions; skill and missile handlers live in plugins_a-d.py.
Speed: missile speed = (Vel + VelLev*lvl/8) * 3/64 subtiles per frame (create-missile code: fixed-point
velocity (Vel<<8)*75/100, and the flag-0x400 frame count dist*65536/(vel*16) => vel/4096 subtile a frame).
"""
import math, random, json, os, traceback
import numpy as np
from PIL import Image
from . import plugins_a, plugins_b, plugins_c, plugins_d
from .gfx import JUNK, nearest_dir, safe, Sprites
from .calcvm import Calc
from .plugins_c import COS64, SIN64

VSCALE = 3 / 64.0
GIF_W, GIF_H = 800, 400
GIF_OUT_W, GIF_OUT_H = 600, 300
GIF_COLORS = 128
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
for mod in (plugins_a, plugins_b, plugins_c, plugins_d):
    for k in dir(mod):
        if k.split('_')[0] in ('skill', 'mdo', 'mhit', 'cdo', 'chit') and callable(getattr(mod, k)):
            PLUG[k] = getattr(mod, k)

# server functions that never spawn anything visible: client mirror visuals may run instead
SRV_SILENT_DO = {0, 1, 3}
SRV_SILENT_HIT = {0, 1, 6, 13, 14, 18, 21, 24, 69, 71, 73}


def n(r, c, d=0):
    try:
        return int(float((r or {}).get(c) or d))
    except (ValueError, TypeError):
        return d


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


def light_tint(rgb, row):
    """Recolor a missile sprite by missiles.txt Light RGB (luminance * tint)."""
    if not _colored_light(row):
        return rgb
    r, g, b = n(row, 'Red'), n(row, 'Green'), n(row, 'Blue')
    lum = rgb.max(axis=2, keepdims=True)
    peak = int(lum.max()) or 1
    return np.clip((lum * np.array([r, g, b], dtype=np.int32)) // peak, 0, 255)


def trans_mode(v):
    """missiles.txt / overlay.txt Trans -> D2 draw mode 0.7."""
    try:
        t = int(float(v))
    except (TypeError, ValueError):
        t = 3
    return t if 0 <= t <= 7 else 3


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
        s.trans = trans_mode(n(s.r, 'Trans'))
        s.add = s.trans in (5, 6)
        s.activate = n(s.r, 'Activate')
        s.loop = n(s.r, 'LoopAnim') > 0
        s.anim = (n(s.r, 'AnimRate') or 1024) / 1024.0
        if n(s.r, 'RandStart'):
            s.data['frame_offset'] = sim.rng.randrange(max(n(s.r, 'AnimLen'), 1))

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
                csub = s.r.get('CltSubMissile1')
                if csub and csub != sub:
                    sim.spawn(csub, s.x, s.y, vx, vy, sid=s.sid, lvl=s.lvl)
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
        # client visuals
        cf = n(s.r, 'pCltDoFunc')
        if cf == 9 and s.age == 0:
            c1, c3 = max(n(s.r, 'CltParam1'), 1), max(n(s.r, 'CltParam3'), 1)
            for col in ('CltSubMissile1', 'CltSubMissile2'):
                sub = s.r.get(col)
                if sub:
                    sim.spawn(sub, s.x, s.y, s.dx, s.dy, vel=0, z=c3 * c1, vz=c3, range=c1 + 1)
        elif f in SRV_SILENT_DO and 'cdo_%d' % cf in PLUG:
            r2 = PLUG['cdo_%d' % cf](s, sim)
            res = res or r2
        return res

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
        cf = n(s.r, 'pCltHitFunc')
        if f in SRV_SILENT_HIT:
            if cf == 18:
                sub = s.r.get('CltHitSubMissile1')
                if sub:
                    sim.spawn(sub, s.x, s.y, s.dx, s.dy, sid=s.sid, lvl=s.lvl)
            elif 'chit_%d' % cf in PLUG:
                try:
                    PLUG['chit_%d' % cf](s, sim, unit)
                except Exception:
                    sim.errors.append('chit_%d' % cf)
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
        s.tick_i += 1


def launch(sim, sid, tx, ty, cx=None, cy=None):
    row = SK[sid]
    cx, cy = (sim.caster if cx is None else (cx, cy))
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
    clt = row.get('cltmissile')
    if clt and clt != mid:
        sim.spawn(clt, cx, cy, tx - cx, ty - cy, target=(tx, ty), sid=sid)
    elif not mid and f in SRV_SILENT_DO and not row.get('srvmissilea'):
        for col in ('cltmissilea', 'cltmissileb'):
            cmid = row.get(col)
            if cmid:
                sim.spawn(cmid, cx, cy, tx - cx, ty - cy, target=(tx, ty), sid=sid)
                break
    for col, pos in (
        ('castoverlay', (cx, cy)),
        ('cltoverlaya', (cx, cy)),
        ('cltoverlayb', (cx, cy)),
        ('tgtoverlay', (tx, ty)),
    ):
        sim.add_overlay(row.get(col), *pos)


# ---------------------------------------------------------------- drawing
def screen(x, y):
    return (x - y) * 16, (x + y) * 8


def blit(c, X, Y, spr, trans=3):
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
    t = trans if not isinstance(trans, bool) else (5 if trans else 3)
    if t in (1, 2, 5, 6):
        mixed = np.clip(base + src - (base * src) // 255, 0, 255)
        base[mm] = mixed[mm]
    elif t == 7:
        mixed = (base * src) // 255
        base[mm] = mixed[mm]
    elif t == 4:
        mixed = (src + base) // 2
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
        i = int(m.frame)
    else:
        i = int(m.age * m.anim) + m.data.get('frame_offset', 0)
    i = i % len(fr) if m.loop or m.frame is not None else min(i, len(fr) - 1)
    ox, oy, rgb, mask = fr[i]
    return ox, oy, light_tint(rgb, getattr(m, 'tint_r', None) or m.r), mask




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
    for t in range(frames):
        sim.tick()
        snaps.append([(m.path, m, sprite_frame(m), m.x, m.y, m.z, m.trans)
                      for m in sorted(sim.ms, key=lambda m: m.x + m.y) if visible(m)])
        osnaps.append([(o['id'], o['x'], o['y'], o['age']) for o in sim.overlays])
        if not sim.ms and not sim.new and not sim.pending and not sim.overlays:
            break
    sim.overlay_snaps = osnaps
    return sim, snaps


def snaps_have_skill_gfx(snaps, overlay_snaps=None):
    """True if any missile sprite or loadable overlay would actually draw (ignores the caster)."""
    if any(item[2] is not None for fr in snaps or () for item in fr):
        return True
    for fr in overlay_snaps or ():
        for item in fr:
            oid = item[0] if item else None
            if oid not in (None, '', '0', '-1') and overlay_frame(oid, 0)[0] is not None:
                return True
    return False


def overlay_frame(oid, age, ang=0):
    if SPR is None:
        return None, 3
    path, rec = SPR.ovl_path(oid)
    if not path:
        return None, 3
    nd = SPR.ndir(path)
    d = nearest_dir(nd, ang) if nd > 1 else 0
    fr = SPR.sprite(path, d)
    if not fr:
        return None, 3
    rate = max(int(rec.get('AnimRate') or 16), 1)
    i = min(age * rate // 16, len(fr) - 1)
    ox, oy, rgb, m = fr[i]
    return (ox + rec.get('Xoffset', 0), oy + rec.get('Yoffset', 0), rgb, m), trans_mode(rec.get('Trans', 3))


def render(sim, snaps, maxw=GIF_W, maxh=GIF_H, focus=None):
    if not snaps_have_skill_gfx(snaps, getattr(sim, 'overlay_snaps', None)):
        return None
    cx, cy = CASTER_SX, CASTER_SY
    render.origin = (cx, cy)
    floor = _floor()
    out = []
    toward = sim.target or (8, -8)
    ang = _face_ang(sim.caster, toward)
    for t, fr in enumerate(snaps):
        c = floor.copy()
        for oid, ox, oy, age in (sim.overlay_snaps[t] if t < len(getattr(sim, 'overlay_snaps', ())) else ()):
            spr, tr = overlay_frame(oid, age, ang)
            if spr is None:
                continue
            X, Y = screen(ox, oy)
            blit(c, cx + X, cy + Y, spr, tr)
        for path, m, f, x, y, z, add in fr:
            if f is not None:
                X, Y = screen(x, y)
                blit(c, cx + X, cy + Y - z, f, add)
        # Units last so missile tints/palettes never recolor the amazon or dummy.
        for pos, spr in _actor_draws(sim, t):
            X, Y = screen(*pos)
            blit(c, cx + X, cy + Y, spr, 3)
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
    _quantize_save(imgs, path, colors, loop=0)
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
        if not snaps_have_skill_gfx(snaps, getattr(sim, 'overlay_snaps', None)):
            info['why'] = 'no missile or overlay graphics'
        else:
            info['why'] = 'nothing visible (this skill\'s graphics come from code the emulator does not cover)'
        return None, None, info
    fr, sc = r
    info.update(frames=len(fr), width=GIF_OUT_W, height=GIF_OUT_H)
    return fr, sc, info


def save_gif(frames, path, scale=1.0):
    """Write the GIF at 25 fps, 600x300, 128 colors."""
    save(frames, path, scale, colors=GIF_COLORS)
    return os.path.getsize(path)
