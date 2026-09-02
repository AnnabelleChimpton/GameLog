import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import {
  decodePng, encodeJpeg, flatten, downscale, shrinkImage, transparentFraction,
} from '../scripts/lib/shrink.mjs';

/* --- A PNG writer just for these tests ------------------------------------ */

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA pixels -> PNG bytes, using a different filter on every line. */
function makePng(width, height, rgba, { colorType = 6 } = {}) {
  const channels = { 2: 3, 6: 4, 0: 1 }[colorType];
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  const src = Buffer.alloc(stride * height);
  for (let i = 0; i < width * height; i++) {
    if (colorType === 6) rgba.copy(src, i * 4, i * 4, i * 4 + 4);
    else if (colorType === 2) rgba.copy(src, i * 3, i * 4, i * 4 + 3);
    else src[i] = rgba[i * 4];
  }
  const bpp = channels;
  for (let y = 0; y < height; y++) {
    const filter = y % 5;
    raw[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const x = src[y * stride + i];
      const a = i >= bpp ? src[y * stride + i - bpp] : 0;
      const b = y > 0 ? src[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= bpp ? src[(y - 1) * stride + i - bpp] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      raw[y * (stride + 1) + 1 + i] = (x - pred) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A photograph-like picture: smooth gradients with some noise, no alpha. */
function photo(width, height, { alphaCorners = false } = {}) {
  const data = Buffer.alloc(width * height * 4);
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 255 / width + rand() * 40) & 0xff;
      data[i + 1] = (y * 255 / height + rand() * 40) & 0xff;
      data[i + 2] = ((x + y) * 127 / (width + height) + rand() * 40) & 0xff;
      data[i + 3] = alphaCorners && x < 4 && y < 4 ? 0 : 255;
    }
  }
  return { width, height, data };
}

/* --- PNG reading ---------------------------------------------------------- */

test('decodePng reproduces the pixels through every filter type', () => {
  const img = photo(37, 23);
  for (const colorType of [6, 2, 0]) {
    const decoded = decodePng(makePng(img.width, img.height, img.data, { colorType }));
    assert.ok(decoded, `colour type ${colorType} decodes`);
    assert.equal(decoded.width, 37);
    assert.equal(decoded.height, 23);
    for (let i = 0; i < img.width * img.height; i++) {
      const want = colorType === 0
        ? [img.data[i * 4], img.data[i * 4], img.data[i * 4], 255]
        : colorType === 2
          ? [img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2], 255]
          : [...img.data.subarray(i * 4, i * 4 + 4)];
      assert.deepEqual([...decoded.data.subarray(i * 4, i * 4 + 4)], want, `pixel ${i}, type ${colorType}`);
    }
  }
});

test('decodePng refuses what is not a PNG rather than guessing', () => {
  assert.equal(decodePng(Buffer.from('not a png at all, not even close')), null);
  assert.equal(decodePng(Buffer.alloc(0)), null);
});

test('absurd declared dimensions are refused before anything is allocated', () => {
  // The header's numbers are a claim: a 33-byte file can declare itself four
  // gigapixels, and buffers would be sized from that claim.
  const claiming = (width, height) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr), chunk('IEND', Buffer.alloc(0)),
    ]);
  };
  assert.throws(() => decodePng(claiming(60000, 60000)), /larger/);
  assert.throws(() => decodePng(claiming(7000, 7000)), /larger/, 'the pixel-count cap holds too');
  // A sane claim gets past the cap and fails quietly on the missing pixel
  // data instead -- null, the usual "leave the file alone".
  assert.equal(decodePng(claiming(100, 100)), null);
});

/* --- JPEG writing --------------------------------------------------------- */

/** Walk the marker segments of a JPEG and return them by marker byte. */
function segments(jpeg) {
  assert.equal(jpeg[0], 0xff); assert.equal(jpeg[1], 0xd8);
  const out = [];
  let pos = 2;
  while (pos < jpeg.length) {
    assert.equal(jpeg[pos], 0xff, `marker at ${pos}`);
    const marker = jpeg[pos + 1];
    if (marker === 0xd9) { out.push({ marker }); break; }
    const len = jpeg.readUInt16BE(pos + 2);
    out.push({ marker, data: jpeg.subarray(pos + 4, pos + 2 + len) });
    pos += 2 + len;
    if (marker === 0xda) {
      // Entropy-coded data runs until the next real marker; 0xFF00 is stuffing.
      while (pos < jpeg.length && !(jpeg[pos] === 0xff && jpeg[pos + 1] !== 0 && jpeg[pos + 1] !== 0xff)) pos++;
    }
  }
  return out;
}

test('encodeJpeg writes a well-formed baseline file with the right dimensions', () => {
  const jpeg = encodeJpeg(photo(50, 30));
  const segs = segments(jpeg);
  const sof = segs.find((s) => s.marker === 0xc0);
  assert.ok(sof, 'has a baseline frame header');
  assert.equal(sof.data[0], 8, '8-bit samples');
  assert.equal(sof.data.readUInt16BE(1), 30, 'height');
  assert.equal(sof.data.readUInt16BE(3), 50, 'width');
  assert.equal(sof.data[5], 3, 'three components');
  assert.equal(segs.filter((s) => s.marker === 0xc4).length, 4, 'four Huffman tables');
  assert.equal(segs.filter((s) => s.marker === 0xdb).length, 1, 'one DQT segment');
  assert.ok(segs.some((s) => s.marker === 0xda), 'has a scan');
  assert.equal(segs.at(-1).marker, 0xd9, 'ends with EOI');
});

test('the Huffman tables cover every symbol the encoder can emit', () => {
  const jpeg = encodeJpeg(photo(16, 16));
  const tables = segments(jpeg).filter((s) => s.marker === 0xc4).map((s) => {
    const counts = [...s.data.subarray(1, 17)];
    const total = counts.reduce((a, b) => a + b, 0);
    const symbols = new Set(s.data.subarray(17, 17 + total));
    return { cls: s.data[0] >> 4, id: s.data[0] & 15, counts, total, symbols };
  });
  for (const t of tables) {
    assert.equal(t.symbols.size, t.total, 'no symbol is listed twice');
    // Kraft: the code lengths must fit in a prefix code.
    const kraft = t.counts.reduce((sum, n, i) => sum + n / 2 ** (i + 1), 0);
    assert.ok(kraft <= 1, `table ${t.cls}/${t.id} is a valid prefix code`);
    if (t.cls === 0) {
      for (let size = 0; size <= 11; size++) assert.ok(t.symbols.has(size), `DC size ${size}`);
    } else {
      assert.equal(t.total, 162);
      assert.ok(t.symbols.has(0x00), 'EOB');
      assert.ok(t.symbols.has(0xf0), 'ZRL');
      for (let run = 0; run < 16; run++) {
        for (let size = 1; size <= 10; size++) assert.ok(t.symbols.has((run << 4) | size), `run ${run} size ${size}`);
      }
    }
  }
});

test('no 0xFF inside the entropy data is left unstuffed', () => {
  const jpeg = encodeJpeg(photo(64, 64));
  const sos = jpeg.indexOf(Buffer.from([0xff, 0xda]));
  const body = jpeg.subarray(sos + 2 + jpeg.readUInt16BE(sos + 2), jpeg.length - 2);
  for (let i = 0; i < body.length - 1; i++) {
    if (body[i] === 0xff) assert.equal(body[i + 1], 0x00, `byte ${i}`);
  }
});

/* --- Pixel work ----------------------------------------------------------- */

test('flatten mattes see-through pixels with the colour of the opaque edge', () => {
  const img = { width: 4, height: 4, data: Buffer.alloc(64) };
  for (let i = 0; i < 16; i++) img.data.set([10, 200, 30, 255], i * 4);
  img.data.set([255, 255, 255, 0], 0); // one clear corner
  const out = flatten(img);
  assert.deepEqual([...out.data.subarray(0, 4)], [10, 200, 30, 255]);
  assert.deepEqual([...out.data.subarray(4, 8)], [10, 200, 30, 255]);
});

test('downscale keeps the aspect and averages rather than drops', () => {
  const img = { width: 400, height: 200, data: Buffer.alloc(400 * 200 * 4) };
  for (let i = 0; i < 400 * 200; i++) img.data.set([(i % 2) * 200, 100, 100, 255], i * 4);
  const out = downscale(img, 100);
  assert.equal(out.width, 100);
  assert.equal(out.height, 50);
  assert.equal(out.data[0], 100, 'alternating 0/200 averages to 100');
  assert.equal(downscale(img, 1000).data, img.data, 'nothing to do keeps the pixels');
});

/* --- The entry point ------------------------------------------------------ */

test('a PNG of a photograph is stored as a much smaller JPEG', () => {
  const img = photo(320, 448);
  const png = makePng(img.width, img.height, img.data);
  const out = shrinkImage({ type: 'image/png', bytes: png });
  assert.equal(out.type, 'image/jpeg');
  assert.ok(out.shrunk);
  assert.ok(out.bytes.length < png.length * 0.5, `${out.bytes.length} vs ${png.length}`);
  assert.equal(out.from, png.length);
});

test('rounded corners are fine but a cut-out stays a PNG', () => {
  const corners = photo(64, 64, { alphaCorners: true });
  assert.ok(transparentFraction(corners) < 0.1);
  assert.equal(shrinkImage({ type: 'image/png', bytes: makePng(64, 64, corners.data) }).type, 'image/jpeg');

  const cutout = photo(64, 64);
  for (let i = 0; i < 64 * 64; i++) if (i % 2) cutout.data[i * 4 + 3] = 0;
  const png = makePng(64, 64, cutout.data);
  const out = shrinkImage({ type: 'image/png', bytes: png });
  assert.equal(out.type, 'image/png');
  assert.equal(out.bytes, png);
  assert.equal(out.shrunk, false);
});

test('anything that is not a PNG passes through untouched', () => {
  const bytes = Buffer.from('pretend jpeg');
  const out = shrinkImage({ type: 'image/jpeg', bytes });
  assert.equal(out.bytes, bytes);
  assert.equal(out.type, 'image/jpeg');
  assert.equal(out.shrunk, false);
});

test('a tiny PNG that would barely shrink is left alone', () => {
  // Flat colour compresses to almost nothing as PNG; JPEG cannot beat it by a quarter.
  const img = { width: 32, height: 32, data: Buffer.alloc(32 * 32 * 4, 128) };
  const png = makePng(32, 32, img.data);
  const out = shrinkImage({ type: 'image/png', bytes: png });
  assert.equal(out.type, 'image/png');
});
