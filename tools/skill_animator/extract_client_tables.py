"""Extract CLIENT_TABLES (direction, circle rings, ownerStep) from D2 DLLs."""
import json
import os
import struct
import sys

GAME = r'C:\Games\median-xl'
OUT = os.path.join(os.path.dirname(__file__), 'app', 'engine', 'client_tables.json')


def pe_sections(data):
    if data[:2] != b'MZ':
        raise ValueError('not PE')
    e_lfanew = struct.unpack_from('<I', data, 0x3C)[0]
    if data[e_lfanew:e_lfanew + 4] != b'PE\0\0':
        raise ValueError('bad PE')
    coff = e_lfanew + 4
    nsec = struct.unpack_from('<H', data, coff + 2)[0]
    opt = coff + 20
    magic = struct.unpack_from('<H', data, opt)[0]
    opt_size = struct.unpack_from('<H', data, coff + 16)[0]
    image_base = struct.unpack_from('<I', data, opt + 28)[0] if magic == 0x10B else struct.unpack_from('<Q', data, opt + 24)[0]
    sec0 = opt + opt_size
    secs = []
    for i in range(nsec):
        off = sec0 + i * 40
        name = data[off:off + 8].split(b'\0')[0].decode('latin-1')
        vsize, va, rsize, raddr = struct.unpack_from('<IIII', data, off + 8)
        secs.append((name, va, vsize, raddr, rsize))
    return image_base, secs


def va_to_off(image_base, secs, va):
    rva = va - image_base
    for name, sva, vsize, raddr, rsize in secs:
        if sva <= rva < sva + max(vsize, rsize):
            return raddr + (rva - sva)
    raise KeyError('VA 0x%x not in sections (base 0x%x)' % (va, image_base))


def read_i32s(data, off, n):
    return list(struct.unpack_from('<%di' % n, data, off))


def read_i8s(data, off, n):
    return [struct.unpack_from('<b', data, off + i)[0] for i in range(n)]


def main():
    client = open(os.path.join(GAME, 'D2Client.dll'), 'rb').read()
    common = open(os.path.join(GAME, 'D2Common.dll'), 'rb').read()
    c_base, c_secs = pe_sections(client)
    m_base, m_secs = pe_sections(common)
    print('D2Client base=0x%x secs=%s' % (c_base, [s[0] for s in c_secs]))
    print('D2Common base=0x%x secs=%s' % (m_base, [s[0] for s in m_secs]))

    # D2Client 1.13c circle tables (VISUALS.md / clientVisuals.js)
    # 0x6fb863e0 / 0x6fb862e0 = radius-30 64-step circle (circleX/Y)
    # Nearby: 0x6fb84390 / 0x6fb84290 also cited as radius-30
    candidates = {
        'circle30_a': (0x6FB84390, 0x6FB84290),
        'circle30_b': (0x6FB863E0, 0x6FB862E0),
    }
    circles = {}
    for name, (xa, ya) in candidates.items():
        try:
            xo = va_to_off(c_base, c_secs, xa)
            yo = va_to_off(c_base, c_secs, ya)
            xs = read_i32s(client, xo, 64)
            ys = read_i32s(client, yo, 64)
            circles[name] = (xs, ys)
            print(name, 'x0..3', xs[:4], 'y0..3', ys[:4], 'max', max(abs(v) for v in xs + ys))
        except Exception as e:
            print(name, 'FAIL', e)

    # Scan .data / .rdata for other 64-int signed rings with small radii (4, 19)
    data_secs = [s for s in c_secs if s[0] in ('.data', '.rdata', 'DATA', 'RDATA') or 'data' in s[0].lower()]
    found_rings = []
    for name, sva, vsize, raddr, rsize in data_secs:
        span = min(vsize, rsize)
        blob = client[raddr:raddr + span]
        for i in range(0, max(0, len(blob) - 64 * 4), 4):
            try:
                xs = read_i32s(blob, i, 64)
            except struct.error:
                break
            mx = max(abs(v) for v in xs)
            if mx not in (4, 5, 8, 10, 12, 16, 19, 20, 24, 30):
                continue
            # look like a ring: starts near (r,0) or (0,r), has both signs
            if not (xs[0] in (0, mx, -mx) or xs[16] in (0, mx, -mx)):
                continue
            if min(xs) >= 0 or max(xs) <= 0:
                continue
            # paired Y table often immediately before/after
            for yoff in (i - 64 * 4, i + 64 * 4):
                if yoff < 0 or yoff + 64 * 4 > len(blob):
                    continue
                ys = read_i32s(blob, yoff, 64)
                my = max(abs(v) for v in ys)
                if my != mx:
                    continue
                if min(ys) >= 0 or max(ys) <= 0:
                    continue
                va_x = c_base + sva + i
                va_y = c_base + sva + yoff
                found_rings.append((mx, va_x, va_y, xs, ys))
                break
    # unique by radius, prefer first
    by_r = {}
    for mx, vx, vy, xs, ys in found_rings:
        by_r.setdefault(mx, (vx, vy, xs, ys))
        print('ring r=%d VA x=0x%x y=0x%x sample x=%s y=%s' % (mx, vx, vy, xs[:4], ys[:4]))

    # Direction table: D2Common sub_6fd5cf40 uses a 128*2 word/int table.
    # Scan for a 256-int table where entry 0 pair is (0, 4096) and last ~ (2896, 2896).
    dir_table = None
    for name, sva, vsize, raddr, rsize in m_secs:
        span = min(vsize, rsize)
        blob = common[raddr:raddr + span]
        for i in range(0, max(0, len(blob) - 256 * 4), 4):
            a0 = struct.unpack_from('<i', blob, i)[0]
            a1 = struct.unpack_from('<i', blob, i + 4)[0]
            if a0 != 0 or a1 != 4096:
                continue
            vals = read_i32s(blob, i, 256)
            # ratio 127: both near 2896
            s127, l127 = vals[127 * 2], vals[127 * 2 + 1]
            if 2500 <= s127 <= 3200 and 2500 <= l127 <= 3200 and abs(s127 - l127) < 200:
                # monotonic-ish growth of short
                shorts = [vals[k * 2] for k in range(128)]
                if shorts[0] == 0 and shorts[64] > 1000 and shorts[127] > shorts[64]:
                    dir_table = vals
                    print('direction @ VA 0x%x short[0,64,127]=%s long[0,64,127]=%s' % (
                        m_base + sva + i,
                        (shorts[0], shorts[64], shorts[127]),
                        (vals[1], vals[64 * 2 + 1], vals[127 * 2 + 1]),
                    ))
                    break
        if dir_table:
            break

    # Pick circles
    circleX, circleY = COS64_FALLBACK()
    if 'circle30_b' in circles:
        circleX, circleY = circles['circle30_b']
    elif 'circle30_a' in circles:
        circleX, circleY = circles['circle30_a']

    circle4X = circle4Y = None
    circle19X = circle19Y = None
    if 4 in by_r:
        _, _, circle4X, circle4Y = by_r[4][0], by_r[4][1], by_r[4][2], by_r[4][3]
        # fix unpack - by_r values are (vx, vy, xs, ys)
    if 4 in by_r:
        circle4X, circle4Y = by_r[4][2], by_r[4][3]
    if 19 in by_r:
        circle19X, circle19Y = by_r[19][2], by_r[19][3]
    elif 20 in by_r:
        # scale 20 -> 19 if exact 19 missing
        xs, ys = by_r[20][2], by_r[20][3]
        circle19X = [int(round(v * 19 / 20)) for v in xs]
        circle19Y = [int(round(v * 19 / 20)) for v in ys]
        print('scaled circle19 from r=20')

    if circle4X is None:
        circle4X, circle4Y = scale_ring(circleX, circleY, 4)
        print('synthesized circle4')
    if circle19X is None:
        circle19X, circle19Y = scale_ring(circleX, circleY, 19)
        print('synthesized circle19')

    if dir_table is None:
        dir_table = synth_direction()
        print('synthesized direction table')

    tables = {
        'direction': dir_table,
        'circleX': circleX,
        'circleY': circleY,
        'circle4X': circle4X,
        'circle4Y': circle4Y,
        'circle19X': circle19X,
        'circle19Y': circle19Y,
        'ownerStep': {
            'x': [0, -1, -2, -1, 0, 1, 2, 1],
            'y': [2, 1, 0, -1, -2, -1, 0, 1],
        },
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(tables, f, separators=(',', ':'))
    print('wrote', OUT, 'keys', list(tables), 'dirlen', len(dir_table))


def COS64_FALLBACK():
    cos64 = [30, 29, 29, 28, 27, 26, 24, 23, 21, 19, 16, 14, 11, 8, 5, 2, 0, -2, -5, -8, -11, -14, -16, -19, -21,
             -23, -24, -26, -27, -28, -29, -29, -30, -29, -29, -28, -27, -26, -24, -23, -21, -19, -16, -14, -11,
             -8, -5, -2, 0, 2, 5, 8, 11, 14, 16, 19, 21, 23, 24, 26, 27, 28, 29, 29]
    sin64 = cos64[48:] + cos64[:48]
    return cos64, sin64


def scale_ring(xs, ys, radius):
    mx = max(abs(v) for v in xs) or 1
    return (
        [int(round(v * radius / mx)) for v in xs],
        [int(round(v * radius / mx)) for v in ys],
    )


def synth_direction():
    """Approximate D2Common direction pairs for ratio 0..127 (short, long) totaling ~4096 hypot."""
    out = []
    for r in range(128):
        # minor/major = r/127
        if r == 0:
            out.extend([0, 4096])
            continue
        t = r / 127.0
        # long = 4096 / sqrt(1+t^2), short = long * t
        import math
        long = int(round(4096 / math.sqrt(1 + t * t)))
        short = int(round(long * t))
        out.extend([short, long])
    return out


if __name__ == '__main__':
    main()
