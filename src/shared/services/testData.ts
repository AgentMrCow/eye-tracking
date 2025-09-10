import { z } from "zod";
import type { RowMap, WordWindow } from "@/shared/type";
import { getStatic, getTestImageRaw } from "@/shared/tauriClient";

export function rowMapTo<T>(row: RowMap, schema: z.ZodType<T>): T {
  if (schema instanceof z.ZodObject) {
    const shape = (schema as z.ZodObject<any>).shape;
    const norm: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      norm[key] = pick(row, key);
    }
    return (schema as z.ZodType<T>).parse(norm as unknown);
  }
  return schema.parse(row as unknown as Record<string, unknown>);
}

export function pick(row: RowMap, key: string): unknown {
  const r = row as unknown as Record<string, unknown>;
  return (
    r[key] ??
    r[key.replace(/_/g, " ")] ??
    r[key.replace(/ /g, "_")] ??
    r[key.toLowerCase()] ??
    r[key.toUpperCase()]
  );
}

export async function getWordWindows(params: {
  testName: string;
  timeline?: string | null;
}): Promise<WordWindow[]> {
  const s = await getStatic();
  const rows = (s.test_catalog ?? []) as RowMap[];

  const testRows = rows.filter(r => (pick(r, "test_name") ?? "") === params.testName);
  if (!testRows.length) return [];

  const row =
    (params.timeline
      ? testRows.find(r => (pick(r, "timeline") ?? "") === params.timeline)
      : undefined) ??
    testRows.find(r => (pick(r, "word_windows_json") ?? "").toString().trim().length) ??
    testRows[0];

  const wwJson = (pick(row, "word_windows_json") ?? "").toString().trim();
  if (!wwJson) return [];

  let arr: unknown;
  try { arr = JSON.parse(wwJson); } catch { return []; }

  const zItem = z.object({
    w: z.string().optional(),
    chinese_word: z.string().optional(),
    start: z.number().optional(),
    start_sec: z.number().optional(),
    end: z.number().optional(),
    end_sec: z.number().optional(),
  });
  const parsed = z.array(zItem).safeParse(arr);
  if (!parsed.success) return [];

  const timeline = (pick(row, "timeline") ?? "") as string;

  return parsed.data
    .map(x => ({
      chinese_word: x.chinese_word ?? x.w ?? "",
      start_sec: (x.start_sec ?? x.start ?? NaN) as number,
      end_sec: (x.end_sec ?? x.end ?? NaN) as number,
      test_name: params.testName,
      timeline,
    }))
    .filter(w => w.chinese_word && Number.isFinite(w.start_sec) && Number.isFinite(w.end_sec));
}

export async function getTestImage(params: {
  testName: string;
  timeline?: string | null;
}): Promise<string | null> {
  const raw = await getTestImageRaw(params);
  return raw as string | null;
}
