// Making stored artwork small, with nothing installed.
//
// libretro's box scans arrive as PNGs of photographed boxes, which is the worst
// possible pairing: a photograph compresses badly as PNG, so a 480x680 scan
// weighs 400-900 KB. A collection of a few hundred games was carrying sixty
// megabytes of art, and every fork and clone dragged it along.
//
// Node has no image codec of its own and this repo has no dependencies, so the
// two pieces needed are here in plain JavaScript: a PNG reader (the inflate
// step is the hard part, and zlib is built in) and a baseline JPEG writer. A
// scan comes out at about a tenth of the size with no difference you can see
// on a shelf tile.
//
// Only PNG is ever converted. A JPEG or WebP that arrives is already small and
// there is no decoder here for it, so it is stored as-is.

import { inflateSync } from 'node:zlib';

/** Longest side a stored picture is allowed; bigger is scaled down first. */
export const MAX_SIDE = 1200;

/** JPEG quality used when a PNG is re-encoded. 85 is visually transparent. */
export const QUALITY = 85;

/* --- PNG reading ---------------------------------------------------------- */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Decode a PNG to 8-bit RGBA. Returns null for anything this reader does not
 * handle (interlaced or sub-byte-depth images), which the caller treats as
 * "leave the file alone" rather than an error.
 */
export function decodePng(bytes) {
  if (bytes.length < 33 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null;

  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];

  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(pos);
    const type = bytes.toString('latin1', pos + 4, pos + 8);
    const data = bytes.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      trns = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length;
  }

  if (!width || !height || interlace !== 0) return null;
  if (depth !== 8 && depth !== 16) return null;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) return null;
  if (colorType === 3 && (!palette || depth !== 8)) return null;

  let raw;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }

  const bytesPerSample = depth / 8;
  const bpp = channels * bytesPerSample;
  const stride = width * bpp;
  if (raw.length < (stride + 1) * height) return null;

  // Undo the per-scanline filters in place; each line's filter byte says how
  // its bytes were predicted from the line above and the pixel to the left.
  const out = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      switch (filter) {
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
        default: break;
      }
      cur[i] = v & 0xff;
    }
    prev = cur;
  }

  // Expand whatever the colour type was into straight RGBA.
  const rgba = Buffer.alloc(width * height * 4);
  const sample = (offset) => out[offset * bytesPerSample]; // 16-bit: keep the high byte
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * channels;
    let r, g, b, a = 255;
    switch (colorType) {
      case 0: r = g = b = sample(s); break;
      case 2: r = sample(s); g = sample(s + 1); b = sample(s + 2); break;
      case 3: {
        const idx = out[i];
        r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
        if (trns && idx < trns.length) a = trns[idx];
        break;
      }
      case 4: r = g = b = sample(s); a = sample(s + 1); break;
      default: r = sample(s); g = sample(s + 1); b = sample(s + 2); a = sample(s + 3);
    }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { width, height, data: rgba };
}

/* --- Pixel work ----------------------------------------------------------- */

/**
 * Lay a picture with transparency onto a solid colour. The colour is the
 * average of its own opaque edge pixels, so the rounded corners of an Xbox
 * case come out the green of the case rather than a black notch.
 */
export function flatten({ width, height, data }) {
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) { hasAlpha = true; break; }
  if (!hasAlpha) return { width, height, data };

  let r = 0, g = 0, b = 0, n = 0;
  const consider = (x, y) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] === 255) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1; }
  };
  for (let x = 0; x < width; x++) { consider(x, 0); consider(x, height - 1); }
  for (let y = 0; y < height; y++) { consider(0, y); consider(width - 1, y); }
  const matte = n ? [r / n, g / n, b / n] : [24, 24, 24];

  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    out[i] = Math.round(data[i] * a + matte[0] * (1 - a));
    out[i + 1] = Math.round(data[i + 1] * a + matte[1] * (1 - a));
    out[i + 2] = Math.round(data[i + 2] * a + matte[2] * (1 - a));
    out[i + 3] = 255;
  }
  return { width, height, data: out };
}

/** Scale down so the longest side is at most `maxSide`, averaging pixels. */
export function downscale({ width, height, data }, maxSide = MAX_SIDE) {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height, data };
  const scale = maxSide / longest;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y / scale), y1 = Math.min(height, Math.max(y0 + 1, Math.floor((y + 1) / scale)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x / scale), x1 = Math.min(width, Math.max(x0 + 1, Math.floor((x + 1) / scale)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * width + xx) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n += 1;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { width: w, height: h, data: out };
}

/* --- JPEG writing --------------------------------------------------------- */

// The standard tables from the JPEG specification (ITU T.81, Annex K).

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];

const LUMA_QUANT = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

const CHROMA_QUANT = [
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
];

// Huffman tables: how many codes of each length 1..16, then the symbols in
// code order.
const DC_LUMA_COUNTS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_LUMA_SYMBOLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const DC_CHROMA_COUNTS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const DC_CHROMA_SYMBOLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const AC_LUMA_COUNTS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_LUMA_SYMBOLS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

const AC_CHROMA_COUNTS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
const AC_CHROMA_SYMBOLS = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
  0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
  0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
  0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
  0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

/** Canonical Huffman codes from a counts/symbols pair: symbol -> [code, length]. */
function buildHuffman(counts, symbols) {
  const table = new Array(256);
  let code = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < counts[len - 1]; i++) {
      table[symbols[k++]] = [code, len];
      code += 1;
    }
    code <<= 1;
  }
  return table;
}

/** Scale a base table to a quality, the way libjpeg does. */
function scaledQuant(base, quality) {
  const q = Math.min(100, Math.max(1, quality));
  const factor = q < 50 ? 5000 / q : 200 - q * 2;
  return base.map((v) => Math.min(255, Math.max(1, Math.floor((v * factor + 50) / 100))));
}

const COS = Array.from({ length: 8 }, (_, x) =>
  Array.from({ length: 8 }, (_, u) => Math.cos(((2 * x + 1) * u * Math.PI) / 16)));
const C = (u) => (u === 0 ? Math.SQRT1_2 : 1);

/** Forward 8x8 DCT of a block of samples already shifted by -128. */
function dct(block, out) {
  const tmp = new Float64Array(64);
  for (let y = 0; y < 8; y++) {
    for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let x = 0; x < 8; x++) s += block[y * 8 + x] * COS[x][u];
      tmp[y * 8 + u] = s;
    }
  }
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let y = 0; y < 8; y++) s += tmp[y * 8 + u] * COS[y][v];
      out[v * 8 + u] = (C(u) * C(v) * s) / 4;
    }
  }
}

class BitWriter {
  constructor() { this.chunks = []; this.buf = Buffer.alloc(1 << 16); this.n = 0; this.acc = 0; this.bits = 0; }
  byte(b) {
    if (this.n === this.buf.length) { this.chunks.push(this.buf); this.buf = Buffer.alloc(1 << 16); this.n = 0; }
    this.buf[this.n++] = b;
  }
  bytes(list) { for (const b of list) this.byte(b); }
  word(w) { this.byte((w >> 8) & 0xff); this.byte(w & 0xff); }
  write(code, length) {
    this.acc = (this.acc << length) | code;
    this.bits += length;
    while (this.bits >= 8) {
      const b = (this.acc >> (this.bits - 8)) & 0xff;
      this.byte(b);
      if (b === 0xff) this.byte(0); // byte stuffing: a data 0xFF is never a marker
      this.bits -= 8;
      this.acc &= (1 << this.bits) - 1;
    }
  }
  flush() { if (this.bits) this.write((1 << (8 - this.bits)) - 1, 8 - this.bits); }
  finish() { this.chunks.push(this.buf.subarray(0, this.n)); return Buffer.concat(this.chunks); }
}

/** How many bits a coefficient needs, and the bits themselves. */
function category(v) {
  const a = Math.abs(v);
  let size = 0;
  while ((a >> size) > 0) size += 1;
  const bits = v >= 0 ? v : v + (1 << size) - 1;
  return [size, bits];
}

/**
 * Encode 8-bit RGBA as a baseline JPEG with 4:2:0 chroma subsampling. Alpha is
 * ignored; flatten() first if it matters.
 */
export function encodeJpeg({ width, height, data }, quality = QUALITY) {
  const yq = scaledQuant(LUMA_QUANT, quality);
  const cq = scaledQuant(CHROMA_QUANT, quality);
  const dcY = buildHuffman(DC_LUMA_COUNTS, DC_LUMA_SYMBOLS);
  const acY = buildHuffman(AC_LUMA_COUNTS, AC_LUMA_SYMBOLS);
  const dcC = buildHuffman(DC_CHROMA_COUNTS, DC_CHROMA_SYMBOLS);
  const acC = buildHuffman(AC_CHROMA_COUNTS, AC_CHROMA_SYMBOLS);

  // Planes, padded to a whole number of 16x16 MCUs by repeating the edge.
  const pw = Math.ceil(width / 16) * 16;
  const ph = Math.ceil(height / 16) * 16;
  const Y = new Float32Array(pw * ph), Cb = new Float32Array(pw * ph), Cr = new Float32Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    const sy = Math.min(y, height - 1);
    for (let x = 0; x < pw; x++) {
      const sx = Math.min(x, width - 1);
      const i = (sy * width + sx) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const o = y * pw + x;
      Y[o] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
      Cb[o] = -0.168736 * r - 0.331264 * g + 0.5 * b;
      Cr[o] = 0.5 * r - 0.418688 * g - 0.081312 * b;
    }
  }

  const w = new BitWriter();
  w.word(0xffd8);
  // JFIF header
  w.word(0xffe0); w.word(16); w.bytes([0x4a, 0x46, 0x49, 0x46, 0]); w.word(0x0101); w.byte(0); w.word(1); w.word(1); w.byte(0); w.byte(0);
  // Quantisation tables, in zigzag order
  w.word(0xffdb); w.word(2 + 65 * 2);
  w.byte(0); for (let i = 0; i < 64; i++) w.byte(yq[ZIGZAG[i]]);
  w.byte(1); for (let i = 0; i < 64; i++) w.byte(cq[ZIGZAG[i]]);
  // Frame header: 8-bit, three components, Y at 2x2 against 1x1 chroma
  w.word(0xffc0); w.word(17); w.byte(8); w.word(height); w.word(width); w.byte(3);
  w.bytes([1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  // Huffman tables
  const dht = (cls, id, counts, symbols) => {
    w.word(0xffc4); w.word(2 + 1 + 16 + symbols.length);
    w.byte((cls << 4) | id); w.bytes(counts); w.bytes(symbols);
  };
  dht(0, 0, DC_LUMA_COUNTS, DC_LUMA_SYMBOLS);
  dht(1, 0, AC_LUMA_COUNTS, AC_LUMA_SYMBOLS);
  dht(0, 1, DC_CHROMA_COUNTS, DC_CHROMA_SYMBOLS);
  dht(1, 1, AC_CHROMA_COUNTS, AC_CHROMA_SYMBOLS);
  // Scan header
  w.word(0xffda); w.word(12); w.byte(3); w.bytes([1, 0x00, 2, 0x11, 3, 0x11]); w.bytes([0, 63, 0]);

  const block = new Float64Array(64);
  const coeffs = new Float64Array(64);
  const quantised = new Int32Array(64);
  const prevDc = [0, 0, 0];

  const encodeBlock = (comp, quant, dcTable, acTable) => {
    dct(block, coeffs);
    for (let i = 0; i < 64; i++) quantised[i] = Math.round(coeffs[ZIGZAG[i]] / quant[ZIGZAG[i]]);

    const diff = quantised[0] - prevDc[comp];
    prevDc[comp] = quantised[0];
    const [dsize, dbits] = category(diff);
    w.write(...dcTable[dsize]);
    if (dsize) w.write(dbits, dsize);

    let run = 0;
    for (let i = 1; i < 64; i++) {
      const v = quantised[i];
      if (v === 0) { run += 1; continue; }
      while (run > 15) { w.write(...acTable[0xf0]); run -= 16; }
      const [size, bits] = category(v);
      w.write(...acTable[(run << 4) | size]);
      w.write(bits, size);
      run = 0;
    }
    if (run) w.write(...acTable[0x00]);
  };

  const fillBlock = (plane, x0, y0) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) block[y * 8 + x] = plane[(y0 + y) * pw + x0 + x];
  };
  const fillSubsampled = (plane, x0, y0) => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const px = x0 + x * 2, py = y0 + y * 2;
        block[y * 8 + x] = (plane[py * pw + px] + plane[py * pw + px + 1]
          + plane[(py + 1) * pw + px] + plane[(py + 1) * pw + px + 1]) / 4;
      }
    }
  };

  for (let my = 0; my < ph; my += 16) {
    for (let mx = 0; mx < pw; mx += 16) {
      for (const [dx, dy] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
        fillBlock(Y, mx + dx, my + dy);
        encodeBlock(0, yq, dcY, acY);
      }
      fillSubsampled(Cb, mx, my); encodeBlock(1, cq, dcC, acC);
      fillSubsampled(Cr, mx, my); encodeBlock(2, cq, dcC, acC);
    }
  }

  w.flush();
  w.word(0xffd9);
  return w.finish();
}

/* --- The one entry point -------------------------------------------------- */

/**
 * Take an image about to be stored and return the version worth keeping.
 *
 * A PNG becomes a JPEG when that is smaller, which for a photograph of a box
 * is always. An oversized picture of any decodable kind is scaled down first.
 * Anything this cannot read, or that would not get smaller, is returned
 * untouched, so storing never fails because of this step.
 */
export function shrinkImage({ type, bytes }, { quality = QUALITY, maxSide = MAX_SIDE } = {}) {
  const keep = { type, bytes, shrunk: false };
  if (type !== 'image/png') return keep;
  const decoded = decodePng(bytes);
  if (!decoded) return keep;
  // A picture that is mostly transparent is a cut-out -- a console on a clear
  // background, a logo -- and flattening it would paint in a backdrop. Box
  // scans have at most rounded corners, a few percent.
  if (transparentFraction(decoded) > CUTOUT_THRESHOLD) return keep;
  const jpeg = encodeJpeg(downscale(flatten(decoded), maxSide), quality);
  // Not worth a lossy re-encode unless it buys real space.
  if (jpeg.length > bytes.length * (1 - MIN_SAVING)) return keep;
  return { type: 'image/jpeg', bytes: jpeg, shrunk: true, from: bytes.length };
}

/** Share of pixels that are not fully opaque. */
export function transparentFraction({ width, height, data }) {
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) n += 1;
  return n / (width * height);
}

/** Above this share of see-through pixels, a PNG is a cut-out and stays one. */
export const CUTOUT_THRESHOLD = 0.1;

/** A conversion has to save at least this much of the file to be worth it. */
export const MIN_SAVING = 0.25;
