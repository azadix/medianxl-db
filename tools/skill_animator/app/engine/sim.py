"""Median XL skill-animation emulator.

Engine core + built-in functions; ported game functions live in plugins_a..d.py.
Speed: missile speed = (Vel + VelLev*lvl/8) * 3/64 subtiles per frame (create-missile code: fixed-point
velocity (Vel<<8)*75/100, and the flag-0x400 frame count dist*65536/(vel*16) => vel/4096 subtile a frame).
"""
import math, random, json, os, traceback
import numpy as np
from PIL import Image
from . import plugins_a, plugins_b, plugins_c, plugins_d
from .gfx import JUNK, nearest_dir, safe, Sprites
from .calcvm import Calc

VSCALE = 3 / 64.0
GIF_W, GIF_H = 800, 400
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
    a = 2 * math.pi * (k % 64) / 64
    return math.cos(a), math.sin(a)


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
        s.vel = vel if vel is not None else (n(s.r, 'Vel') + n(s.r, 'VelLev') * s.lvl / 8) * VSCALE
        s.maxvel = (n(s.r, 'MaxVel') or 0) * VSCALE
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
        s.ndir = SPR.ndir(s.path) if s.path else 1
        s.add = n(s.r, 'Trans') > 0
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
                if sub:
                    vx, vy = ring_vec(s.counter)
                    sim.spawn(sub, s.x, s.y, vx, vy, sid=s.sid, lvl=s.lvl)
                s.counter = (s.counter + P[1]) % 64
        elif f == 16:
            # 0x6fc60bd0: x' = (x - y)/2, y' = (x + y)/2 on the +0x28 (x) / +0x2c (y) path offset
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
        # stand-in enemies
        if s.sim.collide and s.vel > 0:
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
        s.charges = 0
        s.depth = 0

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


# ---------------------------------------------------------------- drawing
def screen(x, y):
    return (x - y) * 16, (x + y) * 8


def blit(c, X, Y, spr, add):
    ox, oy, rgb, m = spr
    h, w = m.shape
    H, W = c.shape[:2]
    X, Y = int(round(X + ox)), int(round(Y + oy))
    x1, y1, x2, y2 = max(X, 0), max(Y, 0), min(X + w, W), min(Y + h, H)
    if x1 >= x2 or y1 >= y2:
        return
    src = rgb[y1 - Y:y2 - Y, x1 - X:x2 - X]
    if add:
        base = c[y1:y2, x1:x2]
        c[y1:y2, x1:x2] = base + src - (base * src) // 255
    else:
        mm = m[y1 - Y:y2 - Y, x1 - X:x2 - X]
        region = c[y1:y2, x1:x2]
        region[mm] = src[mm]
        c[y1:y2, x1:x2] = region


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


def sprite_frame(m):
    d = nearest_dir(m.ndir, math.degrees(math.atan2(*screen(m.dx, m.dy)[::-1])))
    fr = SPR.sprite(m.path, d)
    if not fr:
        return None
    if m.frame is not None:
        i = int(m.frame)
    else:
        i = int(m.age * m.anim) + m.data.get('frame_offset', 0)
    i = i % len(fr) if m.loop or m.frame is not None else min(i, len(fr) - 1)
    return fr[i]




def visible(m):
    return m.path and not JUNK.search(m.r.get('CelFile', '') or '')


def simulate(sid, layout, frames=240, lvl=LVL, seed=7):
    sim = Sim(sid, lvl=lvl, seed=seed)
    sim.target = layout['target']
    sim.targets = layout.get('enemies', [])
    sim.collide = bool(sim.targets)
    launch(sim, sid, *sim.target)
    snaps = []
    for t in range(frames):
        sim.tick()
        snaps.append([(m.path, m, sprite_frame(m), m.x, m.y, m.z, m.add)
                      for m in sorted(sim.ms, key=lambda m: m.x + m.y) if visible(m)])
        if not sim.ms and not sim.new and not sim.pending:
            break
    return sim, snaps


def render(sim, snaps, maxw=GIF_W, maxh=GIF_H, focus=None):
    if not any(f is not None for fr in snaps for path, m, f, x, y, z, add in fr):
        return None
    cx, cy = CASTER_SX, CASTER_SY
    render.origin = (cx, cy)
    floor = _floor()
    out = []
    for t, fr in enumerate(snaps):
        c = floor.copy()
        for pos, spr in _actor_draws(sim, t):
            X, Y = screen(*pos)
            blit(c, cx + X, cy + Y, spr, False)
        for path, m, f, x, y, z, add in fr:
            if f is not None:
                X, Y = screen(x, y)
                blit(c, cx + X, cy + Y - z, f, add)
        out.append(c)
    return out, 1.0


def _to_gif_size(im):
    im = im.convert('RGB')
    scale = min(GIF_W / im.width, GIF_H / im.height)
    nw = max(int(round(im.width * scale)), 1)
    nh = max(int(round(im.height * scale)), 1)
    if (nw, nh) != im.size:
        im = im.resize((nw, nh), Image.LANCZOS)
    if nw == GIF_W and nh == GIF_H:
        return im
    out = Image.new('RGB', (GIF_W, GIF_H), tuple(int(x) for x in FLOOR_A))
    out.paste(im, ((GIF_W - nw) // 2, (GIF_H - nh) // 2))
    return out


def _gif_save_kw(duration, loop):
    kw = dict(save_all=True, duration=duration, optimize=True)
    if loop is not None:
        kw['loop'] = loop
    return kw


def _quantize_save(imgs, path, colors, duration=40, loop=0):
    rgb = [im.convert('RGB') if im.mode != 'RGB' else im for im in imgs]
    ref = max(rgb, key=lambda im: np.asarray(im).astype(np.int64).sum())
    pq = ref.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    q = [im.quantize(palette=pq, dither=Image.Dither.NONE) for im in rgb]
    q[0].save(path, append_images=q[1:], **_gif_save_kw(duration, loop))


def _drop_frames_to_fit(path, max_bytes, loop=0):
    from PIL import ImageSequence
    with Image.open(path) as im:
        fr = [x.copy() for x in ImageSequence.Iterator(im)]
    for step in (2, 3, 4):
        sub = fr[::step]
        tmp = path + '.tmp.gif'
        sub[0].save(tmp, append_images=sub[1:], **_gif_save_kw(40 * step, loop))
        if os.path.getsize(tmp) <= max_bytes or step == 4:
            os.replace(tmp, path)
            break
        os.remove(tmp)


def save(frames, path, scale=1.0, maxframes=200, colors=128):
    if len(frames) > maxframes:
        frames = frames[:maxframes]
    once = len(frames) < MIN_LOOP_FRAMES
    if not once:
        frames = list(frames) + [frames[-1]] * 2     # short pause before the loop restarts
    imgs = [_to_gif_size(Image.fromarray(np.clip(f, 0, 255).astype(np.uint8))) for f in frames]
    loop = None if once else 0
    _quantize_save(imgs, path, colors, loop=loop)
    return imgs, loop


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
    return any(SPR.mis_path(m) and not JUNK.search(MIS[m].get('CelFile', '')) for m in chain(sid))


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
        info['why'] = 'nothing visible (this skill\'s graphics come from code the emulator does not cover)'
        return None, None, info
    fr, sc = r
    info.update(frames=len(fr), width=GIF_W, height=GIF_H)
    return fr, sc, info


def save_gif(frames, path, scale=1.0, max_bytes=250000):
    """Write the GIF; if it is bigger than max_bytes, drop frames then retry at 64 colors."""
    imgs, loop = save(frames, path, scale, colors=128)
    if max_bytes and os.path.getsize(path) > max_bytes:
        _drop_frames_to_fit(path, max_bytes, loop=loop)
    if max_bytes and os.path.getsize(path) > max_bytes:
        _quantize_save(imgs, path, 64, loop=loop)
        if os.path.getsize(path) > max_bytes:
            _drop_frames_to_fit(path, max_bytes, loop=loop)
    return os.path.getsize(path)
