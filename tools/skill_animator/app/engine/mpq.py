"""Minimal MPQ (v1) reader with PKWARE DCL explode, zlib and bzip2 support."""
import struct, zlib, bz2, io, mmap

def _crypt_table():
    seed = 0x00100001
    table = {}
    for i in range(256):
        idx = i
        for j in range(5):
            seed = (seed * 125 + 3) % 0x2AAAAB
            t1 = (seed & 0xFFFF) << 0x10
            seed = (seed * 125 + 3) % 0x2AAAAB
            t2 = seed & 0xFFFF
            table[idx] = t1 | t2
            idx += 0x100
    return table
CT = _crypt_table()

def hash_str(s, t):
    s1, s2 = 0x7FED7FED, 0xEEEEEEEE
    for ch in s.upper().replace('/', '\\'):
        v = ord(ch)
        s1 = CT[(t << 8) + v] ^ ((s1 + s2) & 0xFFFFFFFF)
        s2 = (v + s1 + s2 + (s2 << 5) + 3) & 0xFFFFFFFF
    return s1

def decrypt(data, key):
    out = bytearray()
    s2 = 0xEEEEEEEE
    for i in range(0, len(data) - len(data) % 4, 4):
        s2 = (s2 + CT[0x400 + (key & 0xFF)]) & 0xFFFFFFFF
        v = struct.unpack_from('<I', data, i)[0]
        v = (v ^ (key + s2)) & 0xFFFFFFFF
        key = ((((~key) << 0x15) + 0x11111111) | (key >> 0x0B)) & 0xFFFFFFFF
        s2 = (v + s2 + (s2 << 5) + 3) & 0xFFFFFFFF
        out += struct.pack('<I', v)
    out += data[len(data) - len(data) % 4:]
    return bytes(out)

# ---------------- PKWARE DCL explode (port of zlib contrib/blast.c) ----------------
def _construct(rep):
    # rep: run-length encoded code lengths
    lengths = []
    for b in rep:
        n = (b >> 4) + 1
        l = b & 15
        lengths += [l] * n
    count = [0] * 14
    for l in lengths:
        count[l] += 1
    offs = [0] * 14
    for i in range(1, 13):
        offs[i + 1] = offs[i] + count[i]
    symbol = [0] * len(lengths)
    for s, l in enumerate(lengths):
        if l:
            symbol[offs[l]] = s
            offs[l] += 1
    return count, symbol

LITLEN = [11, 124, 8, 7, 28, 7, 188, 13, 76, 4, 10, 8, 12, 10, 12, 10, 8, 23, 8, 9, 7, 6, 7, 8, 7, 6, 55, 8, 23, 24, 12, 11, 7, 9, 11, 12, 6, 7, 22, 5, 7, 24, 6, 11, 9, 6, 7, 22, 7, 11, 38, 7, 9, 8, 25, 11, 8, 11, 9, 12, 8, 12, 5, 38, 5, 38, 5, 11, 7, 5, 6, 21, 6, 10, 53, 8, 7, 24, 10, 27, 44, 253, 253, 253, 252, 252, 252, 13, 12, 45, 12, 45, 12, 61, 12, 45, 44, 173]
LENLEN = [2, 35, 36, 53, 38, 23]
DISTLEN = [2, 20, 53, 230, 247, 151, 248]
BASE = [3, 2, 4, 5, 6, 7, 8, 9, 10, 12, 16, 24, 40, 72, 136, 264]
EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]
H_LIT = _construct(LITLEN); H_LEN = _construct(LENLEN); H_DIST = _construct(DISTLEN)

def explode(data):
    pos = 0; bitbuf = 0; bitcnt = 0
    def bits(need):
        nonlocal pos, bitbuf, bitcnt
        val = bitbuf
        while bitcnt < need:
            val |= data[pos] << bitcnt
            pos += 1
            bitcnt += 8
        bitbuf = val >> need
        bitcnt -= need
        return val & ((1 << need) - 1)
    def decode(h):
        count, symbol = h
        code = first = index = 0
        for ln in range(1, 14):
            code |= bits(1) ^ 1
            c = count[ln]
            if code < first + c:
                return symbol[index + (code - first)]
            index += c; first += c; first <<= 1; code <<= 1
        raise ValueError('bad code')
    lit = bits(8)
    dictsz = bits(8)
    out = bytearray()
    while True:
        if bits(1):
            sym = decode(H_LEN)
            ln = BASE[sym] + bits(EXTRA[sym])
            if ln == 519:
                break
            sym = 2 if ln == 2 else dictsz
            dist = decode(H_DIST) << sym
            dist += bits(sym)
            dist += 1
            for _ in range(ln):
                out.append(out[-dist])
        else:
            sym = decode(H_LIT) if lit else bits(8)
            out.append(sym)
    return bytes(out)

def decompress(data):
    m = data[0]
    d = data[1:]
    if m & 0x10:
        d = bz2.decompress(d)
    if m & 0x08:
        d = explode(d)
    if m & 0x02:
        d = zlib.decompress(d)
    if m & ~(0x10 | 0x08 | 0x02):
        raise ValueError(f'unsupported compression {m:#x}')
    return d

class MPQ:
    def __init__(self, path):
        self._fh = open(path, 'rb')
        self.f = mmap.mmap(self._fh.fileno(), 0, access=mmap.ACCESS_READ)
        off = 0
        while self.f[off:off + 4] != b'MPQ\x1a':
            off += 512
        self.base = off
        (hs, arch, fmt, sshift, hpos, bpos, hcount, bcount) = struct.unpack_from('<IIHHIIII', self.f, off + 4)
        self.sector = 512 << sshift
        ht = decrypt(self.f[off + hpos: off + hpos + hcount * 16], hash_str('(hash table)', 3))
        bt = decrypt(self.f[off + bpos: off + bpos + bcount * 16], hash_str('(block table)', 3))
        self.hash = [struct.unpack_from('<IIHHI', ht, i * 16) for i in range(hcount)]
        self.block = [struct.unpack_from('<IIII', bt, i * 16) for i in range(bcount)]

    def find(self, name):
        n = len(self.hash)
        h = hash_str(name, 0) % n
        a, b = hash_str(name, 1), hash_str(name, 2)
        for k in range(n):
            e = self.hash[(h + k) % n]
            if e[4] == 0xFFFFFFFF:
                return None
            if e[0] == a and e[1] == b:
                return e[4]
        return None

    def read(self, name):
        bi = self.find(name)
        if bi is None:
            return None
        fpos, csize, fsize, flags = self.block[bi]
        raw = self.f[self.base + fpos: self.base + fpos + csize]
        key = None
        if flags & 0x00010000:
            key = hash_str(name.replace('/', '\\').split('\\')[-1], 3)
            if flags & 0x00020000:
                key = (key + fpos) ^ fsize
        if flags & 0x01000000:   # single unit
            d = decrypt(raw, key) if key is not None else raw
            return decompress(d) if (flags & 0x200 and csize < fsize) else d
        if not (flags & 0x0000FF00):   # not compressed
            return raw if key is None else b''.join(decrypt(raw[i:i + self.sector], key + i // self.sector) for i in range(0, len(raw), self.sector))
        nsec = (fsize + self.sector - 1) // self.sector
        tbl = raw[:(nsec + 1) * 4]
        if key is not None:
            tbl = decrypt(tbl, key - 1)
        offs = struct.unpack('<%dI' % (nsec + 1), tbl)
        out = bytearray()
        for s in range(nsec):
            chunk = raw[offs[s]:offs[s + 1]]
            if key is not None:
                chunk = decrypt(chunk, key + s)
            expect = min(self.sector, fsize - s * self.sector)
            if len(chunk) < expect:
                if flags & 0x100:     # PKWARE imploded file
                    chunk = explode(chunk)
                else:
                    chunk = decompress(chunk)
            out += chunk
        return bytes(out)
