import test from "node:test";
import assert from "node:assert/strict";
import { decode as decodeJpeg } from "jpeg-js";

import * as renderers from "../src/renderers/index.js";

function assertJpeg(buf) {
  assert.ok(Buffer.isBuffer(buf), "render() must return a Buffer");
  assert.ok(buf.length > 100, `buffer too small (${buf.length}B) — likely empty render`);
  assert.equal(buf[0], 0xff, "missing JPEG SOI marker byte 0");
  assert.equal(buf[1], 0xd8, "missing JPEG SOI marker byte 1");
  assert.equal(buf[buf.length - 2], 0xff, "missing JPEG EOI marker byte 0");
  assert.equal(buf[buf.length - 1], 0xd9, "missing JPEG EOI marker byte 1");
}

test("photo240 renders a valid 240x240 JPEG", () => {
  const renderer = renderers.get("photo240");
  const buf = renderer.render(42, "in 1h 30m", 75, "Mon 9:00 AM");

  assertJpeg(buf);
  const img = decodeJpeg(buf, { useTArray: true });
  assert.equal(img.width, 240, "photo240 width must be 240");
  assert.equal(img.height, 240, "photo240 height must be 240");
});

test("gif80 renders a valid 80x80 JPEG payload", () => {
  const renderer = renderers.get("gif80");
  const buf = renderer.render(42, "in 1h 30m", 75, "Mon 9:00 AM");

  assertJpeg(buf);
  const img = decodeJpeg(buf, { useTArray: true });
  assert.equal(img.width, 80, "gif80 width must be 80");
  assert.equal(img.height, 80, "gif80 height must be 80");
});

test("renderers handle 0% and clamp >100% without crashing", () => {
  for (const mode of ["photo240", "gif80"]) {
    const r = renderers.get(mode);
    assertJpeg(r.render(0, "soon", 0, "soon"));
    assertJpeg(r.render(250, "in 2h", 999, "Fri 5:00 PM"));
  }
});

test("renderers.get() rejects unknown modes", () => {
  assert.throws(() => renderers.get("bogus"), /unknown render mode/);
});
