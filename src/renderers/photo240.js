import { createCanvas } from "@napi-rs/canvas";

import { COLOR_BG, COLOR_DIM, COLOR_TEXT, COLOR_TRACK, barColor } from "./palette.js";
import { FONT_FAMILY, ensureFont } from "./font.js";

const WIDTH = 240;
const HEIGHT = 240;

export class Photo240Renderer {
  render(fivePct, fiveReset, weekPct, weekReset) {
    ensureFont();
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textBaseline = "top";

    ctx.font = `20px ${FONT_FAMILY}`;
    ctx.fillStyle = COLOR_TEXT;
    ctx.fillText("Claude usage", 12, 8);

    const drawSection = (y, label, pct, reset) => {
      const pctClamped = Math.max(0, Math.min(pct, 999));
      const barPct = Math.min(pctClamped, 100);
      const color = barColor(pctClamped);

      ctx.font = `14px ${FONT_FAMILY}`;
      ctx.fillStyle = COLOR_DIM;
      ctx.fillText(label, 12, y);

      ctx.font = `34px ${FONT_FAMILY}`;
      const pctText = `${Math.round(pctClamped)}%`;
      const pctW = ctx.measureText(pctText).width;
      ctx.fillStyle = color;
      ctx.fillText(pctText, 216 - pctW, y - 4);

      const barX = 12, barY = y + 38, barW = 216, barH = 14;
      ctx.fillStyle = COLOR_TRACK;
      ctx.fillRect(barX, barY, barW, barH);
      const filled = Math.floor(barW * barPct / 100);
      if (filled > 0) {
        ctx.fillStyle = color;
        ctx.fillRect(barX, barY, filled, barH);
      }

      ctx.font = `14px ${FONT_FAMILY}`;
      ctx.fillStyle = COLOR_DIM;
      ctx.fillText(`resets ${reset}`, 12, barY + barH + 4);
    };

    drawSection(40,  "5h session", fivePct, fiveReset);
    drawSection(140, "7d weekly",  weekPct, weekReset);

    return canvas.toBuffer("image/jpeg", 90);
  }
}
