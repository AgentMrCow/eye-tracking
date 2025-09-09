// src/shared/tauriClient.ts
import { invoke } from "@tauri-apps/api/core";
import type { StaticData } from "@/shared/type";

/** cache StaticData once per app run */
let _staticData: Promise<StaticData> | null = null;
export async function getStatic(): Promise<StaticData> {
  if (!_staticData) {
    _staticData = invoke<StaticData>("get_static_data").catch((err) => {
      _staticData = null; // allow retry
      throw err;
    });
  }
  return _staticData;
}

/** always provide BOTH keys expected by the Rust side */
export function bothTestNames(name?: string | null) {
  const v = (name ?? "").toString();
  return { test_name: v, testName: v };
}

/* ──────────────────────────────────────────────────────────────
   Thin wrappers returning raw JSON from Tauri.
   Feature APIs import these and add zod parsing.
   ────────────────────────────────────────────────────────────── */

export async function getTimelineRecordingsRaw(params: {
  testName: string;
  participants: string[];
}): Promise<unknown> {
  return invoke("get_timeline_recordings", {
    ...bothTestNames(params.testName),
    participants: params.participants,
  });
}

export async function getGazeDataRaw(params: {
  testName: string;
  participants: string[];
  timeline?: string | null;
  recording?: string | null;
  limit?: number | null;
  offset?: number | null;
}): Promise<unknown> {
  return invoke("get_gaze_data", {
    ...bothTestNames(params.testName),
    participants: params.participants,
    timeline: params.timeline ?? null,
    recording: params.recording ?? null,
    limit: params.limit ?? null,
    offset: params.offset ?? null,
  });
}

export async function getBoxStatsRaw(params: {
  testName: string;
  participants: string[];
  timeline?: string | null;
  recording?: string | null;
}): Promise<unknown> {
  return invoke("get_box_stats", {
    ...bothTestNames(params.testName),
    participants: params.participants,
    timeline: params.timeline ?? null,
    recording: params.recording ?? null,
  });
}

export async function getTestImageRaw(params: {
  testName: string;
  timeline?: string | null;
}): Promise<unknown> {
  return invoke("get_test_image", {
    ...bothTestNames(params.testName),
    timeline: params.timeline ?? null,
  });
}
