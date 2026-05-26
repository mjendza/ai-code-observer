import { Gif80Renderer } from "./gif80.js";
import { Photo240Renderer } from "./photo240.js";

export function get(mode) {
  if (mode === "gif80") return new Gif80Renderer();
  if (mode === "photo240") return new Photo240Renderer();
  throw new Error(`unknown render mode: ${JSON.stringify(mode)} (expected 'gif80' or 'photo240')`);
}
