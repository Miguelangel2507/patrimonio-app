// One-off icon generator: draws a green rounded-square badge with a stylised "€" glyph,
// encodes as PNG by hand (zlib only, no image deps available in this environment).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // no filter
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function drawIcon(size) {
  const px = new Uint8ClampedArray(size * size * 4);
  const bg = [10, 132, 90]; // green, close to oklch(58% 0.15 155)
  const bgDark = [8, 110, 75];
  const white = [255, 255, 255];
  const r = 0; // no corner rounding: iOS/Android apply their own icon mask
  const cx = size / 2, cy = size / 2;
  const R = size * 0.30, T = size * 0.085;
  const barHalf = size * 0.038;
  const barOffset = size * 0.155;

  function setPx(i, color, alpha) {
    px[i] = color[0]; px[i + 1] = color[1]; px[i + 2] = color[2]; px[i + 3] = alpha;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-rect mask
      let inside = true;
      const dx = x < r ? r - x : (x > size - r ? x - (size - r) : 0);
      const dy = y < r ? r - y : (y > size - r ? y - (size - r) : 0);
      if (dx > 0 && dy > 0 && dx * dx + dy * dy > r * r) inside = false;
      if (!inside) { setPx(i, white, 0); continue; }

      // subtle vertical gradient background
      const t = y / size;
      const base = [
        Math.round(bg[0] + (bgDark[0] - bg[0]) * t),
        Math.round(bg[1] + (bgDark[1] - bg[1]) * t),
        Math.round(bg[2] + (bgDark[2] - bg[2]) * t)
      ];
      setPx(i, base, 255);

      // euro glyph: ring (open "C") + two bars, antialiased-ish via distance thresholds
      const ddx = x - cx, ddy = y - cy;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      const isRing = dist > R - T && dist < R && x < cx + R * 0.42;
      const inBar1 = Math.abs(ddy - (-barOffset)) < barHalf && ddx > -R * 1.15 && ddx < R * 0.18;
      const inBar2 = Math.abs(ddy - barOffset) < barHalf && ddx > -R * 1.15 && ddx < R * 0.18;
      if (isRing || inBar1 || inBar2) setPx(i, white, 255);
    }
  }
  return Buffer.from(px.buffer);
}

const sizes = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
];

for (const [name, size] of sizes) {
  const rgba = drawIcon(size);
  const png = encodePNG(size, size, rgba);
  fs.writeFileSync(path.join(__dirname, name), png);
  console.log('wrote', name, size);
}
