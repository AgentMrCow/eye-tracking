import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type {
  CatalogRow, GazeData, RecordingRow, TestMeta, TLRec, WordWindow
} from "../types";

const GazeSchema: z.ZodType<GazeData> = z.object({
  gaze_x: z.number().nullable(),
  gaze_y: z.number().nullable(),
  box_name: z.string(),
  timestamp: z.string(),
  participant: z.string(),
  test_name: z.string(),
  recording: z.string().optional(),
});

const WordWindowSchema: z.ZodType<WordWindow> = z.object({
  chinese_word: z.string(),
  start_sec: z.number(),
  end_sec: z.number(),
  test_name: z.string(),
  timeline: z.string(),
});

const TLRecSchema: z.ZodType<TLRec> = z.object({
  timeline: z.string(),
  recording: z.string(),
});

const CatalogRowSchema: z.ZodType<CatalogRow> = z.object({
  test_name: z.string(),
  group: z.string().nullable().optional(),
  correct_AOIs: z.string().nullable().optional(),
  potentially_correct_AOIs: z.string().nullable().optional(),
  incorrect_AOIs: z.string().nullable().optional(),
  correct_NULL: z.string().nullable().optional(),
  potentially_correct_NULL: z.string().nullable().optional(),
  incorrect_NULL: z.string().nullable().optional(),
});

const TestMetaSchema: z.ZodType<TestMeta> = z.object({
  test_name: z.string(),
  truth_value: z.string().nullable().optional(),
  only_position: z.string().nullable().optional(),
  morpheme: z.string().nullable().optional(),
  series: z.string().nullable().optional(),
  case_no: z.number().nullable().optional(),
});

const RecordingRowSchema: z.ZodType<RecordingRow> = z.object({
  recording: z.string(),
  gaze_samples: z.union([z.number(), z.string()]).nullable().optional(),
});

export async function getTestNames(): Promise<string[]> {
  const raw = await invoke<string[]>("get_test_names").catch(() => []);
  return z.array(z.string()).parse(raw);
}
export async function getParticipants(): Promise<string[]> {
  const raw = await invoke<string[]>("get_participants").catch(() => []);
  return z.array(z.string()).parse(raw);
}
export async function getAllTestMeta(): Promise<TestMeta[]> {
  const raw = await invoke<TestMeta[]>("get_all_test_meta").catch(() => []);
  return z.array(TestMetaSchema).parse(raw);
}
export async function getAllCatalog(): Promise<CatalogRow[]> {
  const raw = await invoke<CatalogRow[]>("get_all_test_catelog").catch(() => []);
  return z.array(CatalogRowSchema).parse(raw);
}
export async function getAllRecordings(): Promise<RecordingRow[]> {
  const raw = await invoke<RecordingRow[]>("get_all_recordings").catch(() => []);
  return z.array(RecordingRowSchema).parse(raw);
}
export async function getAoiMap(testName: string): Promise<{ region_id: string; rgb_hex?: string | null }[]> {
  const raw = await invoke<{ region_id: string; rgb_hex?: string | null }[]>("get_aoi_map", { testName }).catch(() => []);
  return z.array(z.object({ region_id: z.string(), rgb_hex: z.string().nullable().optional() })).parse(raw);
}
export async function getTimelineRecordings(params: { testName: string; participants: string[] }): Promise<TLRec[]> {
  const raw = await invoke<TLRec[]>("get_timeline_recordings", params).catch(() => []);
  return z.array(TLRecSchema).parse(raw);
}
export async function getGazeData(params: {
  testName: string; participants: string[]; timeline?: string | null; recording?: string | null
}): Promise<GazeData[]> {
  const raw = await invoke<GazeData[]>("get_gaze_data", params).catch(() => []);
  return z.array(GazeSchema).parse(raw);
}
export async function getBoxStats(params: {
  testName: string; participants: string[]; timeline?: string | null; recording?: string | null
}): Promise<{ box_percentages: Record<string, number> }> {
  const raw = await invoke<{ box_percentages: Record<string, number> }>("get_box_stats", params).catch(() => ({ box_percentages: {} }));
  return z.object({ box_percentages: z.record(z.number()) }).parse(raw);
}
export async function getWordWindows(params: { testName: string; timeline?: string | null }): Promise<WordWindow[]> {
  const raw = await invoke<WordWindow[]>("get_word_windows", params).catch(() => []);
  return z.array(WordWindowSchema).parse(raw);
}
export async function getTestImage(params: { testName: string; timeline?: string | null }): Promise<string | null> {
  const raw = await invoke<string | null>("get_test_image", params).catch(() => null);
  return raw;
}
