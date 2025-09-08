import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type {
  CatalogRow, GazeData, RecordingRow, TestMeta, TLRec, WordWindow
} from "../types";
import type { StaticData, RowMap } from "@/shared/type";

/* Schemas */
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
    test_name: z.string(),
    participant: z.string(),
    recording: z.string(),
    valid: z.coerce.number().nullable().optional(),
    total: z.coerce.number().nullable().optional(),
    blue: z.coerce.number().nullable().optional(),
    red: z.coerce.number().nullable().optional(),
    pctBlue: z.coerce.number().nullable().optional(),
  })
  .catchall(z.any());

/* StaticData bootstrap (cached) */
let _staticData: Promise<StaticData> | null = null;
async function getStatic(): Promise<StaticData> {
  if (!_staticData) {
    _staticData = invoke<StaticData>("get_static_data").catch((err) => {
      _staticData = null;
      throw err;
    });
  }
  return _staticData;
}

function rowMapTo<T>(row: RowMap, schema: z.ZodType<T>): T {
  return schema.parse(row as unknown as Record<string, unknown>);
}

/* --- helper: normalize test name param --- */
function pickTestName(p: { testName?: string; test_name?: string }): string {
  return (p.test_name ?? p.testName) ?? "";
}

/* API mirrored by hooks */
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
  // derive meta straight from test_catalog; test_group is not shipped
  return (s.test_catalog ?? []).map((r) =>
    rowMapTo(r, TestMetaSchema)
  );
}

export async function getAllCatalog(): Promise<CatalogRow[]> {
  const s = await getStatic();
  return (s.test_catalog ?? []).map((r) => rowMapTo(r, CatalogRowSchema));
}

export async function getAllRecordings(): Promise<RecordingRow[]> {
  const s = await getStatic();
  return (s.recordings ?? []).map((r) => rowMapTo(r, RecordingRowSchema));
}

export async function getAoiMap(_testName: string): Promise<RowMap[]> {
  return [];
}

export async function getTimelineRecordings(params: {
  testName?: string; test_name?: string; participants: string[];
}): Promise<TLRec[]> {
  const raw = await invoke("get_timeline_recordings", {
    test_name: pickTestName(params),
    participants: params.participants,
  });
  return z.array(TLRecSchema).parse(raw);
}

export async function getGazeData(params: {
  testName?: string; test_name?: string;
  participants: string[];
  timeline?: string | null;
  recording?: string | null;
  limit?: number | null;
  offset?: number | null;
}): Promise<GazeData[]> {
  const raw = await invoke("get_gaze_data", {
    test_name: pickTestName(params),
    participants: params.participants,
    timeline: params.timeline ?? null,
    recording: params.recording ?? null,
    limit: params.limit ?? null,
    offset: params.offset ?? null,
  });
  return z.array(GazeSchema).parse(raw);
}

export async function getBoxStats(params: {
  testName?: string; test_name?: string;
  participants: string[];
  timeline?: string | null;
  recording?: string | null;
}): Promise<{ box_percentages: Record<string, number> }> {
  const raw = await invoke("get_box_stats", {
    test_name: pickTestName(params),
    participants: params.participants,
    timeline: params.timeline ?? null,
    recording: params.recording ?? null,
  });
  return z.object({ box_percentages: z.record(z.string(), z.number()) }).parse(raw);
}

export async function getWordWindows(_params: {
  testName?: string; test_name?: string; timeline?: string | null;
}): Promise<WordWindow[]> {
  return [];
}

export async function getTestImage(params: {
  testName?: string; test_name?: string; timeline?: string | null;
}): Promise<string | null> {
  const raw = await invoke("get_test_image", {
    test_name: pickTestName(params),
    timeline: params.timeline ?? null,
  });
  return raw as string | null;
}
