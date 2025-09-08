import { CODE_TO_BOX, DEFAULT_COLORS, HUE_END, HUE_START } from "./constants";
import type { BoxTypes, GazeData, RecordingRow } from "./types";

export function parseAOISet(s?: string | null): BoxTypes[] {
  if (!s) return [];
  return s.replace(/[，；]/g, ",")
    .split(/[,\s]+/)
    .map(t => t.trim().toUpperCase())
    .filter(Boolean)
    .map(code => CODE_TO_BOX[code])
    .filter((v): v is BoxTypes => !!v);
}

export function parsePercentRow(r: RecordingRow): number | null {
  return parsePercent(r.gaze_samples);
}

export function parsePercent(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    if (v <= 1) return Math.round(v * 100);
    return Math.min(100, Math.max(0, Math.round(v)));
  }
  const m = String(v).trim().match(/([\d.]+)/);
  return m ? Math.min(100, Math.max(0, Math.round(parseFloat(m[1])))) : null;
}

export function calcWholeStats(samples: GazeData[]) {
  const total       = samples.length;
  const missing     = samples.filter(s => s.box_name === "missing").length;
  const outOfScreen = samples.filter(s => s.box_name === "out_of_screen").length;
  const inAoi       = samples.filter(s =>
    !["missing","out_of_screen","other"].includes(s.box_name)).length;
  const pct1 = total ? ((total - missing) / total) * 100 : 0;
  const denom2 = total - missing;
  const pct2   = denom2 ? ((denom2 - outOfScreen) / denom2) * 100 : 0;
  const pct3   = denom2 ? (inAoi / denom2) * 100 : 0;
  return {
    pct_including_missing: pct1,
    pct_excluding_missing: pct2,
    pct_excluding_missing_oob: pct3
  };
}

export function timeColor(norm: number) {
  const hue = HUE_START + (HUE_END - HUE_START) * norm;
  return `hsl(${hue},100%,50%)`;
}

export const COLORS = () => DEFAULT_COLORS;
