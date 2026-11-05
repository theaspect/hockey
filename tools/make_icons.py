"""Рисует иконки приложения (PNG) без сторонних библиотек: площадка, вратарь, шайба.

Запуск: python tools/make_icons.py — кладёт icons/icon-180.png, icon-192.png, icon-512.png.
"""
import math
import struct
import zlib
from pathlib import Path

BG = (36, 55, 94)
ICE = (244, 251, 255)
RED = (229, 57, 53)
BLUE_LINE = (30, 99, 214)
HELMET = (38, 50, 56)
WHITE = (255, 255, 255)
BLACK = (17, 17, 17)
GLOVE = (255, 179, 0)

# Фигуры в координатах 0..1: (тип, параметры, цвет). Рисуются по порядку, последняя сверху.
SHAPES = [
    ("rrect", (0.08, 0.16, 0.92, 0.84, 0.16), ICE),
    ("rect", (0.495, 0.16, 0.505, 0.84), RED),
    ("ring", (0.5, 0.5, 0.17, 0.012), BLUE_LINE),
    ("line", (0.30, 0.62, 0.58, 0.50, 0.03), (141, 85, 36)),  # клюшка
    ("circle", (0.30, 0.50, 0.17), WHITE),
    ("circle", (0.30, 0.50, 0.15), RED),
    ("circle", (0.31, 0.50, 0.085), HELMET),
    ("circle", (0.35, 0.47, 0.022), WHITE),
    ("circle", (0.35, 0.53, 0.022), WHITE),
    ("circle", (0.27, 0.34, 0.06), GLOVE),
    ("circle", (0.66, 0.48, 0.055), BLACK),
]


def inside(shape, params, x, y):
    if shape == "circle":
        cx, cy, r = params
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    if shape == "ring":
        cx, cy, r, w = params
        return abs(math.hypot(x - cx, y - cy) - r) <= w
    if shape == "rect":
        x0, y0, x1, y1 = params
        return x0 <= x <= x1 and y0 <= y <= y1
    if shape == "rrect":
        x0, y0, x1, y1, r = params
        if not (x0 <= x <= x1 and y0 <= y <= y1):
            return False
        cx = min(max(x, x0 + r), x1 - r)
        cy = min(max(y, y0 + r), y1 - r)
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    if shape == "line":
        x0, y0, x1, y1, w = params
        dx, dy = x1 - x0, y1 - y0
        t = max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)))
        return math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)) <= w
    raise ValueError(shape)


def pixel(x, y):
    color = BG
    for shape, params, c in SHAPES:
        if inside(shape, params, x, y):
            color = c
    return color


def render(size, samples=3):
    rows = []
    for py in range(size):
        row = bytearray([0])  # тип фильтра PNG
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(samples):
                for sx in range(samples):
                    c = pixel((px + (sx + 0.5) / samples) / size, (py + (sy + 0.5) / samples) / size)
                    for i in range(3):
                        acc[i] += c[i]
            n = samples * samples
            row.extend(round(v / n) for v in acc)
        rows.append(bytes(row))
    return b"".join(rows)


def png(size, raw):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def main():
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    for size in (180, 192, 512):
        (out / f"icon-{size}.png").write_bytes(png(size, render(size)))
        print("icon", size)


if __name__ == "__main__":
    main()
