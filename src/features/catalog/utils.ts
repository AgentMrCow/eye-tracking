import { AOI_CODE_TO_BOX, HUE_END, HUE_START } from "./constants";
import type { AoiKey, BoxTypes, TestCatalogRow } from "./types";

export function parseAoiList(s?: string | null): Set<BoxTypes> {
  const out = new Set<BoxTypes>();
  if (!s) return out;
  s
    .replace(/[，；]/g, ",")
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((code) => {
      const key = code.toUpperCase() as keyof typeof AOI_CODE_TO_BOX;
      const mapped = AOI_CODE_TO_BOX[key];
      if (mapped) out.add(mapped);
    });
  return out;
}

export function unionSets<T>(sets: Set<T>[]): Set<T> {
  const u = new Set<T>();
  sets.forEach((s) => s.forEach((v) => u.add(v)));
  return u;
}

export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export const labelForKey = (k: AoiKey, map: Record<string, string>) => map[k] ?? k;

export function timeColor(norm: number) {
  const hue = HUE_START + (HUE_END - HUE_START) * norm;
  return `hsl(${hue},100%,50%)`;
}

export function boxesFor(row: TestCatalogRow, keys: AoiKey[]): Set<BoxTypes> {
  const sets = keys.map((k) => {
    const fromMain = (row as any)[k] as string | null | undefined;
    const fromExtra = row.aoi_extra?.[k];
    return parseAoiList(fromMain ?? fromExtra ?? null);
  });
  return unionSets(sets);
}
