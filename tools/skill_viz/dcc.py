"""Decode Diablo II DCC animations (OpenDiablo2 / Paul Siramy algorithm)."""

from __future__ import annotations

from dataclasses import dataclass, field

CRAZY_BIT_TABLE = (0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 26, 28, 30, 32)
PIXEL_MASK_LOOKUP = (0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4)
CELL_SIZE = 4
DCC_SIGNATURE = 0x74


class DccError(ValueError):
    pass


class BitMuncher:
    def __init__(self, data: bytes, bit_offset: int = 0):
        self.data = data
        self.offset = bit_offset
        self.bits_read = 0

    def copy(self) -> BitMuncher:
        other = BitMuncher(self.data, self.offset)
        other.bits_read = 0
        return other

    def get_bit(self) -> int:
        byte_index = self.offset // 8
        if byte_index >= len(self.data):
            raise DccError("DCC bitstream ran past end of file")
        bit = (self.data[byte_index] >> (self.offset % 8)) & 1
        self.offset += 1
        self.bits_read += 1
        return bit

    def skip_bits(self, bits: int) -> None:
        self.offset += bits
        self.bits_read += bits

    def get_bits(self, bits: int) -> int:
        if bits == 0:
            return 0
        result = 0
        for i in range(bits):
            result |= self.get_bit() << i
        return result

    def get_signed_bits(self, bits: int) -> int:
        return _make_signed(self.get_bits(bits), bits)

    def get_byte(self) -> int:
        return self.get_bits(8)

    def get_int32(self) -> int:
        return _make_signed(self.get_bits(32), 32)

    def get_uint32(self) -> int:
        return self.get_bits(32)


def _make_signed(value: int, bits: int) -> int:
    if bits == 0:
        return 0
    sign = 1 << (bits - 1)
    if value & sign:
        return value - (1 << bits)
    return value


def _crazy_bits(stream: BitMuncher) -> int:
    return CRAZY_BIT_TABLE[stream.get_bits(4)]


@dataclass
class Cell:
    width: int = 0
    height: int = 0
    x_offset: int = 0
    y_offset: int = 0
    last_width: int = -1
    last_height: int = -1
    last_x_offset: int = 0
    last_y_offset: int = 0


@dataclass
class PixelBufferEntry:
    frame: int = -1
    frame_cell_index: int = -1
    value: list[int] = field(default_factory=lambda: [0, 0, 0, 0])


@dataclass
class Frame:
    width: int = 0
    height: int = 0
    x_offset: int = 0
    y_offset: int = 0
    box_left: int = 0
    box_top: int = 0
    box_width: int = 0
    box_height: int = 0
    optional_bytes: int = 0
    coded_bytes: int = 0
    bottom_up: bool = False
    horizontal_cell_count: int = 0
    vertical_cell_count: int = 0
    cells: list[Cell] = field(default_factory=list)
    pixel_data: bytes = b""


@dataclass
class Direction:
    box_left: int = 0
    box_top: int = 0
    box_width: int = 0
    box_height: int = 0
    frames: list[Frame] = field(default_factory=list)


@dataclass
class DccFile:
    version: int
    directions: list[Direction]


def load_dcc(data: bytes) -> DccFile:
    stream = BitMuncher(data)
    signature = stream.get_byte()
    if signature != DCC_SIGNATURE:
        raise DccError(f"DCC signature expected 0x74, got 0x{signature:02x}")
    version = stream.get_byte()
    direction_count = stream.get_byte()
    frames_per_direction = stream.get_int32()
    if direction_count < 1 or frames_per_direction < 1:
        raise DccError("invalid DCC direction/frame count")
    if stream.get_int32() != 1:
        raise DccError("DCC sanity check failed")
    stream.get_int32()  # total size coded
    offsets = [stream.get_int32() for _ in range(direction_count)]
    directions = [
        _decode_direction(BitMuncher(data, offset * 8), frames_per_direction)
        for offset in offsets
    ]
    return DccFile(version=version, directions=directions)


def _decode_direction(stream: BitMuncher, frames_per_direction: int) -> Direction:
    stream.get_uint32()  # outsize coded
    compression_flags = stream.get_bits(2)
    variable0_bits = _crazy_bits(stream)
    width_bits = _crazy_bits(stream)
    height_bits = _crazy_bits(stream)
    xoffset_bits = _crazy_bits(stream)
    yoffset_bits = _crazy_bits(stream)
    optional_bits = _crazy_bits(stream)
    coded_bits = _crazy_bits(stream)

    frames: list[Frame] = []
    min_x = 100000
    min_y = 100000
    max_x = -100000
    max_y = -100000
    for _ in range(frames_per_direction):
        stream.get_bits(variable0_bits)
        frame = Frame(
            width=stream.get_bits(width_bits),
            height=stream.get_bits(height_bits),
            x_offset=stream.get_signed_bits(xoffset_bits),
            y_offset=stream.get_signed_bits(yoffset_bits),
            optional_bytes=stream.get_bits(optional_bits),
            coded_bytes=stream.get_bits(coded_bits),
            bottom_up=stream.get_bit() == 1,
        )
        if frame.bottom_up:
            raise DccError("bottom-up DCC frames are not supported")
        frame.box_left = frame.x_offset
        frame.box_top = frame.y_offset - frame.height + 1
        frame.box_width = frame.width
        frame.box_height = frame.height
        min_x = min(min_x, frame.box_left)
        min_y = min(min_y, frame.box_top)
        max_x = max(max_x, frame.box_left + frame.box_width)
        max_y = max(max_y, frame.box_top + frame.box_height)
        frames.append(frame)

    box_left, box_top = min_x, min_y
    box_width = max_x - min_x
    box_height = max_y - min_y
    if optional_bits > 0:
        raise DccError("optional DCC bits are not supported")

    equal_cells_size = 0
    encoding_size = 0
    raw_pixel_size = 0
    if compression_flags & 0x2:
        equal_cells_size = stream.get_bits(20)
    pixel_mask_size = stream.get_bits(20)
    if compression_flags & 0x1:
        encoding_size = stream.get_bits(20)
        raw_pixel_size = stream.get_bits(20)

    palette_entries = bytearray(256)
    palette_count = 0
    for i in range(256):
        if stream.get_bit():
            palette_entries[palette_count] = i
            palette_count += 1

    equal_cells = stream.copy()
    stream.skip_bits(equal_cells_size)
    pixel_mask = stream.copy()
    stream.skip_bits(pixel_mask_size)
    encoding_type = stream.copy()
    stream.skip_bits(encoding_size)
    raw_pixels = stream.copy()
    stream.skip_bits(raw_pixel_size)
    pixel_code = stream.copy()

    horiz_cells = 1 + (box_width - 1) // CELL_SIZE
    vert_cells = 1 + (box_height - 1) // CELL_SIZE
    dir_cells = _direction_cells(box_width, box_height, horiz_cells, vert_cells)
    for frame in frames:
        _recalculate_frame_cells(frame, box_left, box_top)

    pixel_buffer = _fill_pixel_buffer(
        frames,
        horiz_cells,
        vert_cells,
        box_left,
        box_top,
        equal_cells_size,
        encoding_size,
        palette_entries,
        pixel_code,
        equal_cells,
        pixel_mask,
        encoding_type,
        raw_pixels,
    )
    _generate_frames(
        frames,
        dir_cells,
        horiz_cells,
        box_width,
        box_height,
        pixel_buffer,
        pixel_code,
    )
    if equal_cells.bits_read != equal_cells_size:
        raise DccError("equal-cell bitstream size mismatch")
    if pixel_mask.bits_read != pixel_mask_size:
        raise DccError("pixel-mask bitstream size mismatch")
    if encoding_type.bits_read != encoding_size:
        raise DccError("encoding-type bitstream size mismatch")
    if raw_pixels.bits_read != raw_pixel_size:
        raise DccError("raw-pixel bitstream size mismatch")
    stream.skip_bits(pixel_code.bits_read)
    return Direction(
        box_left=box_left,
        box_top=box_top,
        box_width=box_width,
        box_height=box_height,
        frames=frames,
    )


def _direction_cells(
    box_width: int, box_height: int, horiz_cells: int, vert_cells: int
) -> list[Cell]:
    widths = _span_sizes(box_width, horiz_cells)
    heights = _span_sizes(box_height, vert_cells)
    cells: list[Cell] = []
    y_offset = 0
    for y in range(vert_cells):
        x_offset = 0
        for x in range(horiz_cells):
            cells.append(Cell(width=widths[x], height=heights[y], x_offset=x_offset, y_offset=y_offset))
            x_offset += CELL_SIZE
        y_offset += CELL_SIZE
    return cells


def _span_sizes(total: int, count: int) -> list[int]:
    if count == 1:
        return [total]
    sizes = [CELL_SIZE] * (count - 1)
    sizes.append(total - CELL_SIZE * (count - 1))
    return sizes


def _recalculate_frame_cells(frame: Frame, dir_left: int, dir_top: int) -> None:
    first_w = CELL_SIZE - ((frame.box_left - dir_left) % CELL_SIZE)
    if (frame.width - first_w) <= 1:
        horiz = 1
    else:
        tmp = frame.width - first_w - 1
        horiz = 2 + (tmp // CELL_SIZE)
        if tmp % CELL_SIZE == 0:
            horiz -= 1
    first_h = CELL_SIZE - ((frame.box_top - dir_top) % CELL_SIZE)
    if (frame.height - first_h) <= 1:
        vert = 1
    else:
        tmp = frame.height - first_h - 1
        vert = 2 + (tmp // CELL_SIZE)
        if tmp % CELL_SIZE == 0:
            vert -= 1
    if horiz == 1:
        widths = [frame.width]
    else:
        widths = [first_w] + [CELL_SIZE] * (horiz - 2)
        widths.append(frame.width - first_w - CELL_SIZE * (horiz - 2))
    if vert == 1:
        heights = [frame.height]
    else:
        heights = [first_h] + [CELL_SIZE] * (vert - 2)
        heights.append(frame.height - first_h - CELL_SIZE * (vert - 2))
    frame.horizontal_cell_count = horiz
    frame.vertical_cell_count = vert
    cells: list[Cell] = []
    offset_y = frame.box_top - dir_top
    for y in range(vert):
        offset_x = frame.box_left - dir_left
        for x in range(horiz):
            cells.append(
                Cell(
                    width=widths[x],
                    height=heights[y],
                    x_offset=offset_x,
                    y_offset=offset_y,
                )
            )
            offset_x += widths[x]
        offset_y += heights[y]
    frame.cells = cells


def _fill_pixel_buffer(
    frames: list[Frame],
    horiz_cells: int,
    vert_cells: int,
    box_left: int,
    box_top: int,
    equal_cells_size: int,
    encoding_size: int,
    palette_entries: bytearray,
    pixel_code: BitMuncher,
    equal_cells: BitMuncher,
    pixel_mask_bits: BitMuncher,
    encoding_type: BitMuncher,
    raw_pixels: BitMuncher,
) -> list[PixelBufferEntry]:
    max_cells = sum(f.horizontal_cell_count * f.vertical_cell_count for f in frames)
    pixel_buffer = [PixelBufferEntry() for _ in range(max_cells)]
    cell_buffer: list[PixelBufferEntry | None] = [None] * (horiz_cells * vert_cells)
    pb_index = -1
    for frame_index, frame in enumerate(frames):
        origin_x = (frame.box_left - box_left) // CELL_SIZE
        origin_y = (frame.box_top - box_top) // CELL_SIZE
        for cell_y in range(frame.vertical_cell_count):
            current_y = cell_y + origin_y
            for cell_x in range(frame.horizontal_cell_count):
                current_cell = origin_x + cell_x + (current_y * horiz_cells)
                next_cell = False
                if cell_buffer[current_cell] is not None:
                    tmp = equal_cells.get_bit() if equal_cells_size > 0 else 0
                    if tmp == 0:
                        pixel_mask = pixel_mask_bits.get_bits(4)
                    else:
                        next_cell = True
                        pixel_mask = 0
                else:
                    pixel_mask = 0x0F
                if next_cell:
                    continue
                pixel_stack = [0, 0, 0, 0]
                last_pixel = 0
                number_of_pixel_bits = PIXEL_MASK_LOOKUP[pixel_mask]
                encoding = 0
                if number_of_pixel_bits != 0 and encoding_size > 0:
                    encoding = encoding_type.get_bit()
                decoded_pixel = 0
                for i in range(number_of_pixel_bits):
                    if encoding != 0:
                        pixel_stack[i] = raw_pixels.get_bits(8)
                    else:
                        pixel_stack[i] = last_pixel
                        displacement = pixel_code.get_bits(4)
                        pixel_stack[i] += displacement
                        while displacement == 15:
                            displacement = pixel_code.get_bits(4)
                            pixel_stack[i] += displacement
                    if pixel_stack[i] == last_pixel:
                        pixel_stack[i] = 0
                        break
                    last_pixel = pixel_stack[i]
                    decoded_pixel += 1
                old_entry = cell_buffer[current_cell]
                pb_index += 1
                cur_idx = decoded_pixel - 1
                for i in range(4):
                    if pixel_mask & (1 << i):
                        if cur_idx >= 0:
                            pixel_buffer[pb_index].value[i] = pixel_stack[cur_idx]
                            cur_idx -= 1
                        else:
                            pixel_buffer[pb_index].value[i] = 0
                    else:
                        pixel_buffer[pb_index].value[i] = 0 if old_entry is None else old_entry.value[i]
                cell_buffer[current_cell] = pixel_buffer[pb_index]
                pixel_buffer[pb_index].frame = frame_index
                pixel_buffer[pb_index].frame_cell_index = cell_x + (cell_y * frame.horizontal_cell_count)
    for i in range(pb_index + 1):
        for x in range(4):
            pixel_buffer[i].value[x] = palette_entries[pixel_buffer[i].value[x]]
    return pixel_buffer[: pb_index + 1]


def _generate_frames(
    frames: list[Frame],
    dir_cells: list[Cell],
    horiz_cells: int,
    box_width: int,
    box_height: int,
    pixel_buffer: list[PixelBufferEntry],
    pixel_code: BitMuncher,
) -> None:
    for cell in dir_cells:
        cell.last_width = -1
        cell.last_height = -1
    pixel_data = bytearray(box_width * box_height)
    pb_idx = 0
    for frame_index, frame in enumerate(frames):
        frame_pixels = bytearray(box_width * box_height)
        for cell_idx, cell in enumerate(frame.cells):
            cell_x = cell.x_offset // CELL_SIZE
            cell_y = cell.y_offset // CELL_SIZE
            buffer_cell = dir_cells[cell_x + (cell_y * horiz_cells)]
            pbe = pixel_buffer[pb_idx] if pb_idx < len(pixel_buffer) else PixelBufferEntry()
            if pbe.frame != frame_index or pbe.frame_cell_index != cell_idx:
                if cell.width != buffer_cell.last_width or cell.height != buffer_cell.last_height:
                    for y in range(cell.height):
                        row = (y + cell.y_offset) * box_width
                        for x in range(cell.width):
                            pixel_data[x + cell.x_offset + row] = 0
                else:
                    for fy in range(cell.height):
                        dst_row = (fy + cell.y_offset) * box_width
                        src_row = (fy + buffer_cell.last_y_offset) * box_width
                        for fx in range(cell.width):
                            pixel_data[fx + cell.x_offset + dst_row] = pixel_data[
                                fx + buffer_cell.last_x_offset + src_row
                            ]
                    for fy in range(cell.height):
                        row = (fy + cell.y_offset) * box_width
                        for fx in range(cell.width):
                            frame_pixels[fx + cell.x_offset + row] = pixel_data[fx + cell.x_offset + row]
            else:
                if pbe.value[0] == pbe.value[1]:
                    fill = pbe.value[0]
                    for y in range(cell.height):
                        row = (y + cell.y_offset) * box_width
                        for x in range(cell.width):
                            pixel_data[x + cell.x_offset + row] = fill
                else:
                    bits_to_read = 2 if pbe.value[1] != pbe.value[2] else 1
                    for y in range(cell.height):
                        row = (y + cell.y_offset) * box_width
                        for x in range(cell.width):
                            palette_index = pixel_code.get_bits(bits_to_read)
                            pixel_data[x + cell.x_offset + row] = pbe.value[palette_index]
                for fy in range(cell.height):
                    row = (fy + cell.y_offset) * box_width
                    for fx in range(cell.width):
                        frame_pixels[fx + cell.x_offset + row] = pixel_data[fx + cell.x_offset + row]
                pb_idx += 1
            buffer_cell.last_width = cell.width
            buffer_cell.last_height = cell.height
            buffer_cell.last_x_offset = cell.x_offset
            buffer_cell.last_y_offset = cell.y_offset
        frame.cells = []
        frame.pixel_data = bytes(frame_pixels)
        frame.box_left = 0
        frame.box_top = 0
        frame.box_width = box_width
        frame.box_height = box_height
