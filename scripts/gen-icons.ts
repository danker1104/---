/**
 * PWA 아이콘 생성기 (외부 의존성 없이 순수 Node로 PNG 인코딩).
 * 실행: pnpm gen:icons
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(size: number, rgba: Buffer): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

type Pt = { x: number; y: number };

function distToSegment(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function makeIcon(size: number): Buffer {
  const bg = [15, 23, 42]; // #0f172a (slate-900)
  const fg = [255, 255, 255];
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = bg[0]!;
    buf[i * 4 + 1] = bg[1]!;
    buf[i * 4 + 2] = bg[2]!;
    buf[i * 4 + 3] = 255;
  }

  const s = size / 512;
  const p0: Pt = { x: 150 * s, y: 265 * s };
  const p1: Pt = { x: 225 * s, y: 345 * s };
  const p2: Pt = { x: 370 * s, y: 172 * s };
  const half = (46 * s) / 2;
  const aa = 0.75;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = Math.min(distToSegment(px, py, p0, p1), distToSegment(px, py, p1, p2));
      const alpha = Math.max(0, Math.min(1, (half - d + aa) / (2 * aa)));
      if (alpha <= 0) continue;
      const i = (y * size + x) * 4;
      buf[i] = Math.round(bg[0]! + (fg[0]! - bg[0]!) * alpha);
      buf[i + 1] = Math.round(bg[1]! + (fg[1]! - bg[1]!) * alpha);
      buf[i + 2] = Math.round(bg[2]! + (fg[2]! - bg[2]!) * alpha);
      buf[i + 3] = 255;
    }
  }
  return encodePNG(size, buf);
}

const targets: ReadonlyArray<readonly [string, number]> = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/apple-touch-icon.png", 180],
];

for (const [path, size] of targets) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, makeIcon(size));
  console.log(`wrote ${path} (${size}x${size})`);
}
