import { z } from "zod";
import type {
  GazeData,
  TestCatalogRow as CatalogRow,
  TimelineRecording as TLRec,
} from "../types";
import type { RowMap } from "@/shared/type";
import { EXTRA_AOI_KEYS } from "../constants";
import {
  getStatic,
  getTimelineRecordingsRaw,
  getGazeDataRaw,
} from "@/shared/tauriClient";
import { rowMapTo, pick } from "@/shared/services/testData";
export { getWordWindows, getTestImage } from "@/shared/services/testData";

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
        image_name: (pick(raw, "image_name") as string | null) ?? base.image_name ?? null,
        timeline: (pick(raw, "timeline") as string | null) ?? base.timeline ?? null,
        word_windows_json: (pick(raw, "word_windows_json") as string | null) ?? base.word_windows_json ?? null,
        missing: (pick(raw, "missing") as string | null) ?? base.missing ?? null,
        image_path: (pick(raw, "image_path") as string | null) ?? base.image_path ?? null,
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

export async function getTimelineRecordings(params: {
  testName: string; participants: string[];
}): Promise<TLRec[]> {
  const raw = await getTimelineRecordingsRaw(params);
  return z.array(TLRecSchema).parse(raw);
}
