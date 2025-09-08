import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { GazeData, TestCatalogRow, TimelineRecording, WordWindow } from "../types";

const CatalogRowSchema: z.ZodType<TestCatalogRow> = z.object({
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
  case_no: z.number().nullable().optional(),
  image_name: z.string().nullable().optional(),
  timeline: z.string().nullable().optional(),
  word_windows_json: z.string().nullable().optional(),
  missing: z.string().nullable().optional(),
  image_path: z.string().nullable().optional(),
  aoi_extra: z.record(z.string().nullable()).optional(),
});

const GazeSchema: z.ZodType<GazeData> = z.object({
  gaze_x: z.number().nullable(),
  gaze_y: z.number().nullable(),
  box_name: z.string(),
  media_name: z.string(),
  timeline: z.string(),
  participant: z.string(),
  recording: z.string(),
  timestamp: z.string(),
  test_name: z.string(),
});

const WordWindowSchema: z.ZodType<WordWindow> = z.object({
  chinese_word: z.string(),
  start_sec: z.number(),
  end_sec: z.number(),
  test_name: z.string(),
  timeline: z.string(),
});

const TLRecSchema: z.ZodType<TimelineRecording> = z.object({
  timeline: z.string(),
  recording: z.string(),
});

export async function getCatalog(): Promise<TestCatalogRow[]> {
  const raw = await invoke<TestCatalogRow[]>("get_all_test_catelog").catch(() => []);
  return z.array(CatalogRowSchema).parse(raw);
}

export async function getParticipants(): Promise<string[]> {
  const raw = await invoke<string[]>("get_participants").catch(() => []);
  return z.array(z.string()).parse(raw);
}

export async function getGazeData(params: {
  testName: string;
  participants: string[];
  timeline?: string | null;
  recording?: string | null;
}): Promise<GazeData[]> {
  const raw = await invoke<GazeData[]>("get_gaze_data", params).catch(() => []);
  return z.array(GazeSchema).parse(raw);
}

export async function getWordWindows(params: { testName: string; timeline?: string | null }): Promise<WordWindow[]> {
  const raw = await invoke<WordWindow[]>("get_word_windows", params).catch(() => []);
  return z.array(WordWindowSchema).parse(raw);
}

export async function getTimelineRecordings(params: { testName: string; participants: string[] }): Promise<TimelineRecording[]> {
  const raw = await invoke<TimelineRecording[]>("get_timeline_recordings", params).catch(() => []);
  return z.array(TLRecSchema).parse(raw);
}

export async function getTestImage(params: { testName: string; timeline?: string | null }): Promise<string | null> {
  const raw = await invoke<string | null>("get_test_image", params).catch(() => null);
  return raw;
}
