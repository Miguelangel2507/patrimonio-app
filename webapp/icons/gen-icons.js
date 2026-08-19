// One-off icon generator: draws a navy rounded-square badge with a white
// ascending-line + bar-chart mark ("Finzen" icon), encodes as PNG by hand
// (zlib only, no image deps available in this environment).
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

// distance from point (px,py) to segment (ax,ay)-(bx,by)
function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const abLen2 = abx * abx + aby * aby;
  let t = abLen2 > 0 ? (apx * abx + apy * aby) / abLen2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + abx * t, cy = ay + aby * t;
  const dx = px - cx, dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

// quadratic bezier point at t
function bezierPoint(p0, p1, p2, t) {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
    mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
  ];
}

function distToCurve(px, py, p0, p1, p2, steps) {
  let best = Infinity;
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const pt = bezierPoint(p0, p1, p2, i / steps);
    const d = distToSegment(px, py, prev[0], prev[1], pt[0], pt[1]);
    if (d < best) best = d;
    prev = pt;
  }
  return best;
}

// true inside a rect, with its top two corners rounded by radius rr
function inRoundedTopRect(x, y, bx, by, bw, bh, rr) {
  if (x < bx || x > bx + bw || y < by || y > by + bh) return false;
  if (y >= by + rr) return true; // below the rounded band, plain rect
  const cxL = bx + rr, cxR = bx + bw - rr;
  if (x >= cxL && x <= cxR) return true; // between the two corner circles
  const cx = x < cxL ? cxL : cxR;
  const dx = x - cx, dy = y - (by + rr);
  return dx * dx + dy * dy <= rr * rr;
}

function drawIcon(size) {
  const px = new Uint8ClampedArray(size * size * 4);
  const bg = [22, 35, 61];      // navy, top
  const bgDark = [14, 22, 40];  // navy, bottom (subtle vertical gradient)
  const white = [255, 255, 255];
  const r = size * 0.22; // baked-in squircle corners, matching the source logo

  // bars: increasing height, bottoms aligned on a shared baseline, rounded tops
  const baseline = size * 0.695;
  const barW = size * 0.115;
  const barGap = size * 0.05;
  const barRR = size * 0.028;
  const bar1X = size * 0.325, bar1H = size * 0.12;
  const bar2X = bar1X + barW + barGap, bar2H = size * 0.205;
  const bar3X = bar2X + barW + barGap, bar3H = size * 0.30;
  const bars = [
    [bar1X, baseline - bar1H, barW, bar1H],
    [bar2X, baseline - bar2H, barW, bar2H],
    [bar3X, baseline - bar3H, barW, bar3H],
  ];

  // gently curved ascending line, clear of the bars, ending in a dot above the tallest one
  const lineFrom = [size * 0.305, size * 0.545];
  const lineTo = [size * 0.665, size * 0.335];
  const lineCtrl = [size * 0.4775, size * 0.395];
  const lineWidth = size * 0.026;
  const dot = [size * 0.685, size * 0.315];
  const dotR = size * 0.042;

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

      const t = y / size;
      const base = [
        Math.round(bg[0] + (bgDark[0] - bg[0]) * t),
        Math.round(bg[1] + (bgDark[1] - bg[1]) * t),
        Math.round(bg[2] + (bgDark[2] - bg[2]) * t)
      ];
      setPx(i, base, 255);

      let isMark = false;
      for (const [bx, by, bw, bh] of bars) {
        if (inRoundedTopRect(x, y, bx, by, bw, bh, barRR)) { isMark = true; break; }
      }
      if (!isMark && distToCurve(x, y, lineFrom, lineCtrl, lineTo, 24) < lineWidth / 2) isMark = true;
      if (!isMark) {
        const ddx = x - dot[0], ddy = y - dot[1];
        if (ddx * ddx + ddy * ddy < dotR * dotR) isMark = true;
      }
      if (isMark) setPx(i, white, 255);
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
