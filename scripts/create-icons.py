"""Render the game's original code-defined mascot into PWA PNG icons.

Uses only Python's standard library; no image package or network is needed.
This is a pixel renderer for the existing source sprite, not a generated image.
"""

from pathlib import Path
import re
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent
COLORS = {
    "O": "#080a07",
    "B": "#cefa63",
    "D": "#9cbe4b",
    "L": "#defb97",
    "H": "#fc7b8f",
    "W": "#f7f6d8",
    "E": "#080a07",
    "K": "#f8b667",
    "F": "#efa06f",
}
BACKGROUND = "#10120f"


def rgb(hex_color):
    return tuple(int(hex_color[index:index + 2], 16) for index in (1, 3, 5))


def sprite_rows():
    source = (ROOT / "src" / "game" / "render.ts").read_text(encoding="utf-8")
    sprite = re.search(r"const BIRD = \[(.*?)\n\]", source, re.S)
    if sprite is None:
        raise ValueError("The source mascot sprite was not found in src/game/render.ts")
    return re.findall(r"'([^']*)'", sprite.group(1))


def png_chunk(kind, payload):
    return (
        struct.pack(">I", len(payload))
        + kind
        + payload
        + struct.pack(">I", zlib.crc32(kind + payload) & 0xffffffff)
    )


def icon(size, rows):
    pixels = bytearray(rgb(BACKGROUND) * (size * size))

    def rectangle(x, y, width, height, color):
        for row in range(max(0, y), min(size, y + height)):
            start = (row * size + max(0, x)) * 3
            end = (row * size + min(size, x + width)) * 3
            pixels[start:end] = bytes(color) * ((end - start) // 3)

    # The mascot fits inside the maskable icon's central safe circle.
    pixel_size = size // 32
    left = (size - max(map(len, rows)) * pixel_size) // 2
    top = (size - len(rows) * pixel_size) // 2
    for row_index, row in enumerate(rows):
        for column_index, symbol in enumerate(row):
            if symbol in COLORS:
                rectangle(
                    left + column_index * pixel_size,
                    top + (row_index + 1) * pixel_size,
                    pixel_size,
                    pixel_size,
                    rgb("#000000"),
                )
    for row_index, row in enumerate(rows):
        for column_index, symbol in enumerate(row):
            if symbol in COLORS:
                rectangle(
                    left + column_index * pixel_size,
                    top + row_index * pixel_size,
                    pixel_size,
                    pixel_size,
                    rgb(COLORS[symbol]),
                )

    scanlines = b"".join(
        b"\x00" + pixels[row * size * 3:(row + 1) * size * 3]
        for row in range(size)
    )
    data = (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + png_chunk(b"IDAT", zlib.compress(scanlines, level=9))
        + png_chunk(b"IEND", b"")
    )
    return data


if __name__ == "__main__":
    destination = ROOT / "public" / "icons"
    destination.mkdir(parents=True, exist_ok=True)
    rows = sprite_rows()
    for dimension in (192, 512):
        output = destination / f"icon-{dimension}.png"
        output.write_bytes(icon(dimension, rows))
        print(f"Created {output.name}: {dimension} x {dimension}")
