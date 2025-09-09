import { z } from "zod";
import type {
  GazeData,
  TestCatalogRow as CatalogRow,
  TimelineRecording as TLRec,
  WordWindow,
} from "../types";
import type { RowMap } from "@/shared/type";
import { EXTRA_AOI_KEYS } from "../constants";
import {
  getStatic,
  getTimelineRecordingsRaw,
  getGazeDataRaw,
  getTestImageRaw,
} from "@/shared/tauriClient";

/* Schemas tailored for catalog pages */
const CatalogRowSchema: z.ZodType<CatalogRow> = z
  .object({
    test_name: z.string(),
    sentence: z.string().nullable().optional(),
    group: z.string().nullable().optional(),

    // base AOI fields
    correct_AOIs: z.string().nullable().optional(),
    potentially_correct_AOIs: z.string().nullable().optional(),
    incorrect_AOIs: z.string().nullable().optional(),
    correct_NULL: z.string().nullable().optional(),
    potentially_correct_NULL: z.string().nullable().optional(),
    incorrect_NULL: z.string().nullable().optional(),

    // meta filters
    truth_value: z.string().nullable().optional(),
    only_position: z.string().nullable().optional(),
    morpheme: z.string().nullable().optional(),
    series: z.string().nullable().optional(),
    case_no: z.coerce.number().nullable().optional(),

    // pass-through columns we also want available from test_catalog
    image_name: z.string().nullable().optional(),
    timeline: z.string().nullable().optional(),
    word_windows_json: z.string().nullable().optional(),
    missing: z.string().nullable().optional(),
    image_path: z.string().nullable().optional(),

    // the bucket for “extra AOI” columns
    aoi_extra: z.record(z.string(), z.string().nullable()).optional(),
  })
  .catchall(z.any());

const TLRecSchema: z.ZodType<TLRec> = z.object({
  timeline: z.string(),
  recording: z.string(),
});

const GazeSchema: z.ZodType<GazeData> = z
  .object({
    gaze_x: z.number().nullable(),
    gaze_y: z.number().nullable(),
    box_name: z.string(),
    media_name: z.string(),
    timeline: z.string(),
    participant: z.string(),
    recording: z.string(),
    timestamp: z.string(),
    test_name: z.string(),
  })
  .catchall(z.any());

function rowMapTo<T>(row: RowMap, schema: z.ZodType<T>): T {
  return schema.parse(row as unknown as Record<string, unknown>);
}

// tolerant key getter for RowMap (spaces/underscores/case)
function pick(row: RowMap, key: string): string | null | undefined {
  const r = row as unknown as Record<string, string | null | undefined>;
  return (
    r[key] ??
    r[key.replace(/_/g, " ")] ??
    r[key.replace(/ /g, "_")] ??
    r[key.toLowerCase()] ??
    r[key.toUpperCase()]
  );
}

/* Public API for catalog */
export async function getCatalog(): Promise<CatalogRow[]> {
  const s = await getStatic();
  const rows = (s.test_catalog ?? []) as RowMap[];

  return rows.map((raw) => {
    // Parse the known/base fields first (keeps type safety)
    const base = rowMapTo(raw, CatalogRowSchema);

    // Lift all extra AOI columns we know about
    const extra: Record<string, string | null> = {};
    for (const k of EXTRA_AOI_KEYS) {
      const v = pick(raw, k);
      if (v != null && String(v).trim() !== "") extra[k] = String(v);
    }

    // Preserve pass-through columns that some cards need later
    const merged: CatalogRow = {
      ...base,
      image_name: (pick(raw, "image_name") ?? base.image_name) ?? null,
      timeline: (pick(raw, "timeline") ?? base.timeline) ?? null,
      word_windows_json: (pick(raw, "word_windows_json") ?? base.word_windows_json) ?? null,
      missing: (pick(raw, "missing") ?? base.missing) ?? null,
      image_path: (pick(raw, "image_path") ?? base.image_path) ?? null,
      aoi_extra: Object.keys(extra).length ? extra : undefined,
    };

    return merged;
  });
}


export async function getParticipants(): Promise<string[]> {
  const s = await getStatic();
  return s.participants ?? [];
}

export async function getGazeData(params: {
  testName: string; participants: string[];
  timeline?: string | null; recording?: string | null;
}) {
  const raw = await getGazeDataRaw(params);
  return z.array(GazeSchema).parse(raw);
}

export async function getWordWindows(params: {
  testName: string; timeline?: string | null;
}): Promise<WordWindow[]> {
  const s = await getStatic();
  const rows = (s.test_catalog ?? []) as RowMap[];

  // 1) pick rows for the test
  const testRows = rows.filter(r => (pick(r, "test_name") ?? "") === params.testName);
  if (!testRows.length) return [];

  // 2) prefer exact timeline row when available, else first non-empty JSON row
  const byTl =
    (params.timeline
      ? testRows.find(r => (pick(r, "timeline") ?? "") === params.timeline)
      : undefined) ??
    testRows.find(r => (pick(r, "word_windows_json") ?? "").trim().length) ??
    testRows[0];

  const wwJson = (pick(byTl, "word_windows_json") ?? "").trim();
  if (!wwJson) return [];

  let arr: unknown;
  try { arr = JSON.parse(wwJson); } catch { return []; }

  // Support both {w,start,end} and {chinese_word,start_sec,end_sec}
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

  const timelineStr = (pick(byTl, "timeline") ?? "") as string;

  return parsed.data
    .map(x => ({
      chinese_word: x.chinese_word ?? x.w ?? "",
      start_sec: (x.start_sec ?? x.start ?? NaN) as number,
      end_sec: (x.end_sec ?? x.end ?? NaN) as number,
      test_name: params.testName,
      timeline: timelineStr,
    }))
    .filter(w => w.chinese_word && Number.isFinite(w.start_sec) && Number.isFinite(w.end_sec));
}


export async function getTimelineRecordings(params: {
  testName: string; participants: string[];
}): Promise<TLRec[]> {
  const raw = await getTimelineRecordingsRaw(params);
  return z.array(TLRecSchema).parse(raw);
}

export async function getTestImage(params: {
  testName: string; timeline?: string | null;
}): Promise<string | null> {
  const raw = await getTestImageRaw(params);
  return raw as string | null;
}
