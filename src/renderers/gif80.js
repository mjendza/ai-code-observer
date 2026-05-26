import { createCanvas } from "@napi-rs/canvas";

import { COLOR_BG, COLOR_DIM, COLOR_TRACK, barColor } from "./palette.js";
import { FONT_FAMILY, ensureFont } from "./font.js";
import { encode as encodeJpeg } from "../vendor/jpeg-encoder.js";

const WIDTH = 80;
const HEIGHT = 80;

// JFIF APP0 segment from the vendor converter's output (96x96 DPI density).
// Firmware silently rejects frames using the encoder's default density.
const APP0_BYTES = Buffer.from("ffe000104a46494600010101006000600000", "hex");

// Baseline JPEG quantization tables extracted from converter output. Natural
// (raster) order — same convention as Pillow's `qtables` argument.
const LUMA_QTABLE = [
  3, 2, 2, 3, 2, 2, 3, 3, 3, 3, 4, 3, 3, 4, 5, 8,
  5, 5, 4, 4, 5, 10, 7, 7, 6, 8, 12, 10, 12, 12, 11, 10,
  11, 11, 13, 14, 18, 16, 13, 14, 17, 14, 11, 11, 16, 22, 16, 17,
  19, 20, 21, 21, 21, 12, 15, 23, 24, 22, 20, 24, 18, 20, 21, 20,
];
const CHROMA_QTABLE = [
  3, 4, 4, 5, 4, 5, 9, 5, 5, 9, 20, 13, 11, 13, 20, 20,
  20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20,
  20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20,
  20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20,
];

export class Gif80Renderer {
  render(fivePct /* fiveReset */, _fiveReset, weekPct /* weekReset */, _weekReset) {
    ensureFont();
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textBaseline = "top";

    const drawRow = (y, label, pct) => {
      const pctClamped = Math.max(0, Math.min(pct, 999));
      const barPct = Math.min(pctClamped, 100);
      const color = barColor(pctClamped);
      const pctText = `${Math.round(pctClamped)}%`;

      ctx.font = `12px ${FONT_FAMILY}`;
      ctx.fillStyle = COLOR_DIM;
      ctx.fillText(label, 4, y);

      ctx.font = `20px ${FONT_FAMILY}`;
      const pctW = ctx.measureText(pctText).width;
      ctx.fillStyle = color;
      ctx.fillText(pctText, 76 - pctW, y - 2);

      const barY = y + 22;
      ctx.fillStyle = COLOR_TRACK;
      ctx.fillRect(4, barY, 72, 6);
      const filled = Math.floor(72 * barPct / 100);
      if (filled > 0) {
        ctx.fillStyle = color;
        ctx.fillRect(4, barY, filled, 6);
      }
    };

    drawRow(2,  "5h", fivePct);
    drawRow(42, "7d", weekPct);

    const rgba = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
    const jpg = encodeJpeg(
      { data: rgba, width: WIDTH, height: HEIGHT },
      LUMA_QTABLE,
      CHROMA_QTABLE,
    );

    // Replace APP0 bytes [2..20] with the vendor-density variant.
    return Buffer.concat([jpg.subarray(0, 2), APP0_BYTES, jpg.subarray(20)]);
  }
}
