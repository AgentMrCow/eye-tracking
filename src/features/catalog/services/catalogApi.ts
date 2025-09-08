import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type {
  GazeData,
  TestCatalogRow as CatalogRow,
  TimelineRecording as TLRec,
  WordWindow,
} from "../types";
import type { StaticData, RowMap } from "@/shared/type";

/* Schemas */
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

/* StaticData bootstrap (cached) */
let _staticData: Promise<StaticData> | null = null;
async function getStatic(): Promise<StaticData> {
  if (!_staticData) {
    _staticData = invoke<StaticData>("get_static_data").catch((err) => {
      _staticData = null; // allow retry next call
      throw err;
    });
  }
  return _staticData;
}

function rowMapTo<T>(row: RowMap, schema: z.ZodType<T>): T {
  return schema.parse(row as unknown as Record<string, unknown>);
}

/* Public API */
export async function getCatalog(): Promise<CatalogRow[]> {
  const s = await getStatic();
  return (s.test_catalog ?? []).map((r) => rowMapTo(r, CatalogRowSchema));
}

export async function getParticipants(): Promise<string[]> {
  const s = await getStatic();
  return s.participants ?? [];
}

export async function getGazeData(params: {
  testName: string;
  participants: string[];
  timeline?: string | null;
  recording?: string | null;
}) {
  const raw = await invoke("get_gaze_data", {
    test_name: params.testName,
    participants: params.participants,
    timeline: params.timeline ?? null,
    recording: params.recording ?? null,
  });
  return z.array(GazeSchema).parse(raw);
}

export async function getWordWindows(_params: {
  testName: string;
  timeline?: string | null;
}): Promise<WordWindow[]> {
  return [];
}

export async function getTimelineRecordings(params: {
  testName: string;
  participants: string[];
}): Promise<TLRec[]> {
  const raw = await invoke("get_timeline_recordings", {
    test_name: params.testName,
    participants: params.participants,
  });
  return z.array(TLRecSchema).parse(raw);
}

export async function getTestImage(params: {
  testName: string;
  timeline?: string | null;
}): Promise<string | null> {
  const raw = await invoke("get_test_image", {
    test_name: params.testName,
    timeline: params.timeline ?? null,
  });
  return raw as string | null;
}
