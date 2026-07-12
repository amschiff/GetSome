import assert from "node:assert/strict";
import test from "node:test";

import { base64ToBytes, buildImagePdf, bytesToBase64, jpegDimensions } from "../extension/pdf.js";

function tinyJpeg(width, height) {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

test("reads JPEG dimensions", () => {
  assert.deepEqual(jpegDimensions(tinyJpeg(320, 180)), { width: 320, height: 180 });
});

test("builds a two-page PDF with an xref table", () => {
  const jpeg = bytesToBase64(tinyJpeg(320, 180));
  const pdf = buildImagePdf([
    { base64: jpeg, cssWidth: 320, cssHeight: 180 },
    { base64: jpeg, cssWidth: 320, cssHeight: 90 },
  ]);
  const text = new TextDecoder("latin1").decode(pdf);
  assert.equal(text.slice(0, 8), "%PDF-1.4");
  assert.match(text, /\/Count 2/);
  assert.match(text, /xref\n0 9\n/);
  assert.match(text, /%%EOF\n$/);
});

test("round-trips data across base64 chunk boundaries", () => {
  const bytes = Uint8Array.from({ length: 0x6000 + 17 }, (_value, index) => index % 251);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});
