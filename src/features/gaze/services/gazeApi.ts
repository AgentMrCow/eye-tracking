import { z } from "zod";
import type {
  CatalogRow,
  GazeData,
  RecordingRow,
  TestMeta,
  TLRec,
} from "../types";
import type { RowMap } from "@/shared/type";

import {
  getStatic,
  getTimelineRecordingsRaw,
  getGazeDataRaw,
  getBoxStatsRaw,
} from "@/shared/tauriClient";
import { getParticipantsForTestRaw, getTestsForParticipantRaw } from "@/shared/tauriClient";
import { rowMapTo, pick } from "@/shared/services/testData";
export { getWordWindows, getTestImage } from "@/shared/services/testData";

/* Schemas specific to gaze */
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

const TLRecSchema: z.ZodType<TLRec> = z.object({
  timeline: z.string(),
  recording: z.string(),
});

const CatalogRowSchema: z.ZodType<CatalogRow> = z
  .object({
    test_name: z.string(),
    sentence: z.string().nullable().optional(),
    group: z.string().nullable().optional(),
    self_AOIs: z.string().nullable().optional(),
    correct_AOIs: z.string().nullable().optional(),
    potentially_correct_AOIs: z.string().nullable().optional(),
    incorrect_AOIs: z.string().nullable().optional(),
    correct_NULL: z.string().nullable().optional(),
    potentially_correct_NULL: z.string().nullable().optional(),
    incorrect_NULL: z.string().nullable().optional(),
    truth_value: z.string().nullable().optional(),
    only_position: z.string().nullable().optional(),
    morpheme: z.string().nullable().optional(),
    series: z.string().nullable().optional(),
    case_no: z.coerce.number().nullable().optional(),
  })
  .catchall(z.any());

const TestMetaSchema: z.ZodType<TestMeta> = z
  .object({
    test_name: z.string(),
    truth_value: z.string().nullable().optional(),
    only_position: z.string().nullable().optional(),
    morpheme: z.string().nullable().optional(),
    series: z.string().nullable().optional(),
  })
  .catchall(z.any());

const RecordingRowSchema: z.ZodType<RecordingRow> = z
  .object({
    recording: z.string(),
    gaze_samples: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .catchall(z.any());

/* Lists + static data */
export async function getTestNames(): Promise<string[]> {
  const s = await getStatic();
  return s.test_names ?? [];
}
export async function getParticipants(): Promise<string[]> {
  const s = await getStatic();
  return s.participants ?? [];
}

export async function getAllTestMeta(): Promise<TestMeta[]> {
  const s = await getStatic();
  // derive meta from test_catalog (test_group is intentionally not shipped)
  return (s.test_catalog ?? []).map((r) => rowMapTo(r, TestMetaSchema));
}
export async function getAllCatalog(): Promise<CatalogRow[]> {
  const s = await getStatic();
  return (s.test_catalog ?? []).map((r) => rowMapTo(r, CatalogRowSchema));
}

export async function getAllRecordings(): Promise<RecordingRow[]> {
  const s = await getStatic();
  const rows = (s.recordings ?? []) as RowMap[];

  return rows.map((r) =>
    RecordingRowSchema.parse({
      recording: (pick(r, "Recording") ?? pick(r, "recording") ?? pick(r, "Recording name") ?? "") as string,
      gaze_samples: (pick(r, "Gaze samples") ?? pick(r, "gaze_samples") ?? null) as number | string | null,
    })
  );
}


/* AOI map not yet backed by DB */
export async function getAoiMap(_testName: string): Promise<RowMap[]> {
  return [];
}

/* Commands (parsed) */
export async function getTimelineRecordings(params: {
  testName: string; participants: string[];
}): Promise<TLRec[]> {
  const raw = await getTimelineRecordingsRaw(params);
  return z.array(TLRecSchema).parse(raw);
}

export async function getGazeData(params: {
  testName: string; participants: string[];
  timeline?: string | null; recording?: string | null;
  limit?: number | null; offset?: number | null;
}): Promise<GazeData[]> {
  const raw = await getGazeDataRaw(params);
  return z.array(GazeSchema).parse(raw);
}

export async function getBoxStats(params: {
  testName: string; participants: string[];
  timeline?: string | null; recording?: string | null;
}): Promise<{ box_percentages: Record<string, number> }> {
  const raw = await getBoxStatsRaw(params);
  return z.object({ box_percentages: z.record(z.string(), z.number()) }).parse(raw);
}

export async function getParticipantsForTest(testName: string): Promise<string[]> {
  const raw = await getParticipantsForTestRaw({ testName });
  return z.array(z.string()).parse(raw);
}

export async function getTestsForParticipant(participant: string): Promise<string[]> {
  const raw = await getTestsForParticipantRaw({ participant });
  return z.array(z.string()).parse(raw);
}
