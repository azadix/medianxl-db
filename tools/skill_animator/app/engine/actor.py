"""Compose player/monster COF animations into blit-ready frames."""
import numpy as np
from .dcc import decode

COMP = ('HD', 'TR', 'LG', 'RA', 'LA', 'RH', 'LH', 'SH', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8')
ARMOR_TRY = {
    'HD': ('CAP', 'LIT', 'SKP', 'MED', 'HVY'),
    'TR': ('LIT', 'MED'),
    'LG': ('LIT', 'MED'),
    'LA': ('LIT',),
    'RA': ('LIT',),
    'SH': ('BUC', 'KIT', 'LIT'),
    'S1': ('LIT',),
    'S2': ('LIT',),
    'RH': ('LIT',),
    'LH': ('LIT',),
}
WCLASS_TRY = ('HTH', '1HS', 'STF', '1HT', '2HS', 'BOW')
MONSTER_COMP = {'HD', 'TR', 'LG', 'RA', 'LA'}


def parse_cof(raw):
    if not raw or len(raw) < 28:
        raise ValueError('COF too small')
    n_layers, n_frames, n_dirs = raw[0], raw[1], raw[2]
    off = 28
    layers = []
    for _ in range(n_layers):
        chunk = raw[off:off + 9]
        if len(chunk) < 9:
            break
        wclass = chunk[5:9].split(b'\x00', 1)[0].decode('ascii', 'ignore').upper() or 'HTH'
        layers.append({'comp': int(chunk[0]), 'wclass': wclass})
        off += 9
    off += 6
    needed = n_dirs * n_frames * n_layers
    return {
        'layers': layers,
        'frames': n_frames,
        'dirs': n_dirs,
        'order': list(raw[off:off + needed]),
    }


def _read(gd, paths):
    for p in paths:
        data = gd.read(p)
        if data:
            return data
    return None


def _dcc_paths(kind, token, comp, armor, mode, wclass):
    name = '%s%s%s%s%s.dcc' % (token, comp, armor, mode, wclass)
    folder = 'chars' if kind == 'char' else 'monsters'
    return [
        'data\\global\\%s\\%s\\%s\\%s' % (folder, token, comp, name),
        'data\\global\\%s\\%s\\%s\\%s' % (folder, token, comp, name.lower()),
    ]


def _cof_paths(kind, token, mode, wclass):
    name = '%s%s%s.cof' % (token, mode, wclass)
    folder = 'chars' if kind == 'char' else 'monsters'
    return [
        'data\\global\\%s\\%s\\COF\\%s' % (folder, token, name),
        'data\\global\\%s\\%s\\cof\\%s' % (folder, token, name),
        'data\\global\\%s\\%s\\COF\\%s' % (folder, token, name.lower()),
        'data\\global\\%s\\%s\\cof\\%s' % (folder, token, name.lower()),
    ]


def _layer_dcc(gd, kind, token, comp_name, mode, wclass):
    armors = ARMOR_TRY.get(comp_name, ('LIT',))
    for armor in armors:
        if kind == 'monster' and armor in ('CAP', 'SKP'):
            continue
        data = _read(gd, _dcc_paths(kind, token, comp_name, armor, mode, wclass))
        if not data:
            continue
        try:
            return decode(data)
        except Exception:
            continue
    return None


def _compose_parts(parts, pal):
    if not parts:
        return None
    left = min(x for x, y, im in parts)
    top = min(y for x, y, im in parts)
    right = max(x + im.shape[1] for x, y, im in parts)
    bottom = max(y + im.shape[0] for x, y, im in parts)
    h, w = max(bottom - top, 1), max(right - left, 1)
    canvas = np.zeros((h, w), dtype=np.uint8)
    for x, y, im in parts:
        py, px = y - top, x - left
        hh, ww = im.shape
        dest = canvas[py:py + hh, px:px + ww]
        vis = im > 0
        dest[vis] = im[vis]
        canvas[py:py + hh, px:px + ww] = dest
    rgb = pal[canvas] * (canvas[..., None] > 0)
    return (left, top, rgb, canvas > 0)


def compose(gd, pal, kind, token, mode, wclass):
    raw = _read(gd, _cof_paths(kind, token, mode, wclass))
    if not raw:
        return None
    try:
        cof = parse_cof(raw)
    except ValueError:
        return None
    layers = []
    for layer in cof['layers']:
        idx = layer['comp']
        if idx >= len(COMP):
            layers.append(None)
            continue
        if kind == 'monster' and COMP[idx] not in MONSTER_COMP:
            layers.append(None)
            continue
        layers.append(_layer_dcc(gd, kind, token, COMP[idx], mode, layer['wclass'] or wclass))
    if not any(layers):
        return None
    n_dirs, n_frames, n_layers = cof['dirs'], cof['frames'], len(cof['layers'])
    dirs = []
    for d in range(n_dirs):
        frames = []
        for f in range(n_frames):
            parts = []
            for slot in range(n_layers):
                order_i = d * n_frames * n_layers + f * n_layers + slot
                if order_i >= len(cof['order']):
                    continue
                li = cof['order'][order_i]
                if li >= len(layers) or layers[li] is None:
                    continue
                dd = layers[li]
                di = d % len(dd) if dd else 0
                frs = dd[di] if dd and di < len(dd) else None
                if not frs or f >= len(frs) or frs[f] is None:
                    continue
                fr = frs[f]
                if not fr['w'] or not fr['h']:
                    continue
                idx = np.frombuffer(fr['pix'], dtype=np.uint8).reshape(fr['h'], fr['w'])
                parts.append((fr['x'], fr['y'], idx))
            spr = _compose_parts(parts, pal)
            if spr is not None:
                frames.append(spr)
        dirs.append(frames)
    if not any(dirs):
        return None
    return {'ndir': n_dirs, 'nframes': n_frames, 'wclass': wclass, 'dirs': dirs}


def load_unit(gd, pal, kind, token, mode, wclass=None):
    tries = (wclass,) if wclass else WCLASS_TRY
    for wc in tries:
        anim = compose(gd, pal, kind, token, mode, wc)
        if anim:
            return anim
    return None
