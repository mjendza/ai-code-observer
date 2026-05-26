import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GlobalFonts } from "@napi-rs/canvas";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_PATH = path.resolve(HERE, "..", "..", "assets", "DejaVuSans-Bold.ttf");

export const FONT_FAMILY = "meter";

let registered = false;

export function ensureFont() {
  if (registered) return;
  if (!fs.existsSync(FONT_PATH)) {
    throw new Error(
      `Bundled font missing at ${FONT_PATH}. ` +
      `Drop DejaVuSans-Bold.ttf into assets/ (download from https://dejavu-fonts.github.io/).`,
    );
  }
  GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
  registered = true;
}
