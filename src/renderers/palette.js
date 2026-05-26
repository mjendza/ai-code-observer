export const COLOR_BG     = "#000000";
export const COLOR_TEXT   = "rgb(235,235,235)";
export const COLOR_DIM    = "rgb(140,140,140)";
export const COLOR_TRACK  = "rgb(40,40,40)";
export const COLOR_GREEN  = "rgb(26,166,75)";
export const COLOR_YELLOW = "rgb(228,184,26)";
export const COLOR_RED    = "rgb(217,58,58)";

export function barColor(pct) {
  if (pct >= 90) return COLOR_RED;
  if (pct >= 70) return COLOR_YELLOW;
  return COLOR_GREEN;
}
