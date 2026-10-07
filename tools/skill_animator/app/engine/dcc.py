"""Diablo II DCC decoder (based on Paul Siramy's format notes / OpenDiablo2's implementation).

decode(data) -> list of directions; each direction is a list of frames;
each frame is dict(x, y, w, h, pix) where pix is a bytes-like w*h of palette indexes (0 = transparent),
and (x, y) is the frame's top-left relative to the sprite origin.
"""

CODE = [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 26, 28, 30, 32]


class Bits:
    def __init__(self, data, start_bit=0, length=None):
        self.d = data
        self.pos = start_bit
        self.end = start_bit + length if length is not None else len(data) * 8

    def read(self, n):
        v = 0
        for i in range(n):
            p = self.pos + i
            v |= ((self.d[p >> 3] >> (p & 7)) & 1) << i
        self.pos += n
        return v

    def sread(self, n):
        v = self.read(n)
        if n and v & (1 << (n - 1)):
            v -= 1 << n
        return v


def _cells(start, size):
    """Split a frame span into cells aligned to the direction's 4-pixel grid. start = offset from dir min."""
    w = 4 - (start % 4)
    if size - w <= 1:
        return [size]
    tmp = size - w - 1
    n = 2 + tmp // 4
    if tmp % 4 == 0:
        n -= 1
    out = [w] + [4] * (n - 2)
    out.append(size - sum(out))
    return out


def info(data):
    return data[2], int.from_bytes(data[3:7], 'little')


def decode(data, only=None):
    """Decode all directions, or only the direction indexes in `only` (others are None)."""
    ndirs = data[2]
    nframes = int.from_bytes(data[3:7], 'little')
    offs = [int.from_bytes(data[15 + 4 * i:19 + 4 * i], 'little') for i in range(ndirs)]
    return [(_direction(data, o, nframes) if (only is None or i in only) else None) for i, o in enumerate(offs)]


def _direction(data, off, nframes):
    b = Bits(data, off * 8)
    b.read(32)  # outsize
    comp = b.read(2)
    v0b, wb, hb, xb, yb, ob, cb = [CODE[b.read(4)] for _ in range(7)]
    frames = []
    for _ in range(nframes):
        b.read(v0b)
        w = b.read(wb); h = b.read(hb)
        xo = b.sread(xb); yo = b.sread(yb)
        opt = b.read(ob); b.read(cb)
        bottom_up = b.read(1)
        frames.append(dict(w=w, h=h, x=xo, y=(yo if bottom_up else yo - h + 1), opt=opt))
    if sum(f['opt'] for f in frames):
        b.pos = (b.pos + 7) & ~7
        b.pos += 8 * sum(f['opt'] for f in frames)
    eq_size = b.read(20) if comp & 2 else 0
    pm_size = b.read(20)
    et_size = rp_size = 0
    if comp & 1:
        et_size = b.read(20); rp_size = b.read(20)
    pal = [i for i in range(256) if b.read(1)]
    p = b.pos
    EQ = Bits(data, p, eq_size); p += eq_size
    PM = Bits(data, p, pm_size); p += pm_size
    ET = Bits(data, p, et_size); p += et_size
    RP = Bits(data, p, rp_size); p += rp_size
    PC = Bits(data, p)

    xmin = min(f['x'] for f in frames); ymin = min(f['y'] for f in frames)
    xmax = max(f['x'] + f['w'] - 1 for f in frames); ymax = max(f['y'] + f['h'] - 1 for f in frames)
    DW, DH = xmax - xmin + 1, ymax - ymin + 1
    CW, CH = 1 + (DW - 1) // 4, 1 + (DH - 1) // 4

    for f in frames:
        fx, fy = f['x'] - xmin, f['y'] - ymin
        f['cw'] = _cells(fx, f['w']); f['ch'] = _cells(fy, f['h'])
        f['cx0'] = fx // 4; f['cy0'] = fy // 4
        f['fx'], f['fy'] = fx, fy

    # stage 1: pixel buffer
    cellbuf = [None] * (CW * CH)
    pb = []
    for fi, f in enumerate(frames):
        ncw = len(f['cw'])
        for cy in range(len(f['ch'])):
            for cx in range(ncw):
                ci = (f['cy0'] + cy) * CW + f['cx0'] + cx
                skip = False
                if cellbuf[ci] is not None:
                    t = EQ.read(1) if eq_size else 0
                    if t == 0:
                        mask = PM.read(4)
                    else:
                        skip = True
                else:
                    mask = 0x0F
                if skip:
                    continue
                rd = [0, 0, 0, 0]; last = 0; dec = 0
                nb = bin(mask).count('1')
                enc = ET.read(1) if (nb and et_size) else 0
                for i in range(nb):
                    if enc:
                        rd[i] = RP.read(8)
                    else:
                        rd[i] = last
                        d = PC.read(4); rd[i] += d
                        while d == 15:
                            d = PC.read(4); rd[i] += d
                    if rd[i] == last:
                        rd[i] = 0
                        break
                    last = rd[i]; dec += 1
                old = cellbuf[ci]
                val = [0, 0, 0, 0]
                k = dec - 1
                for i in range(4):
                    if mask & (1 << i):
                        if k >= 0:
                            val[i] = rd[k]; k -= 1
                    else:
                        val[i] = old['val'][i]
                e = dict(val=val, frame=fi, idx=cy * ncw + cx)
                pb.append(e)
                cellbuf[ci] = e
    for e in pb:
        e['val'] = [pal[v] if v < len(pal) else 0 for v in e['val']]

    # stage 2: build frames
    bmp = bytearray(DW * DH)
    prev = [None] * (CW * CH)   # (x, y, w, h) of the cell last drawn at this grid position
    k = 0
    out = []
    for fi, f in enumerate(frames):
        ncw = len(f['cw'])
        y0 = f['fy']
        for cy, ch in enumerate(f['ch']):
            x0 = f['fx']
            for cx, cw in enumerate(f['cw']):
                ci = (f['cy0'] + cy) * CW + f['cx0'] + cx
                if k < len(pb) and pb[k]['frame'] == fi and pb[k]['idx'] == cy * ncw + cx:
                    v = pb[k]['val']; k += 1
                    if v[0] == v[1]:
                        for yy in range(ch):
                            r = (y0 + yy) * DW + x0
                            bmp[r:r + cw] = bytes([v[0]]) * cw
                    else:
                        nbit = 1 if v[1] == v[2] else 2
                        for yy in range(ch):
                            r = (y0 + yy) * DW + x0
                            for xx in range(cw):
                                bmp[r + xx] = v[PC.read(nbit)]
                else:
                    pv = prev[ci]
                    if pv is not None and (pv[0], pv[1], pv[2], pv[3]) != (x0, y0, cw, ch):
                        px, py, pw, ph = pv
                        blk = [bytes(bmp[(py + yy) * DW + px:(py + yy) * DW + px + min(pw, cw)]) for yy in range(min(ph, ch))]
                        for yy in range(ch):
                            r = (y0 + yy) * DW + x0
                            if yy < len(blk):
                                bmp[r:r + len(blk[yy])] = blk[yy]
                    elif pv is None:
                        for yy in range(ch):
                            r = (y0 + yy) * DW + x0
                            bmp[r:r + cw] = bytes(cw)
                prev[ci] = (x0, y0, cw, ch)
                x0 += cw
            y0 += ch
        pix = bytearray(f['w'] * f['h'])
        for yy in range(f['h']):
            r = (f['fy'] + yy) * DW + f['fx']
            pix[yy * f['w']:(yy + 1) * f['w']] = bmp[r:r + f['w']]
        out.append(dict(x=f['x'], y=f['y'], w=f['w'], h=f['h'], pix=bytes(pix)))
    return out
