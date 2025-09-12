// src/shared/tauriClient.ts
import { invoke } from "@tauri-apps/api/core";
import { withLoading } from "@/shared/loading";
import type { StaticData, RowMap } from "@/shared/type";
import type { DisabledSlice, SearchTestRow, SearchSliceRow } from "@/shared/type";

/** cache StaticData once per app run */
let _staticData: Promise<StaticData> | null = null;
export async function getStatic(): Promise<StaticData> {
  if (!_staticData) {
    _staticData = withLoading(invoke<StaticData>("get_static_data")).catch((err) => {
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
  return withLoading(invoke("get_timeline_recordings", {
    ...bothTestNames(params.testName),
    participants: params.participants,
  }));
}

export async function getGazeDataRaw(params: {
  testName: string;
  participants: string[];
  timeline?: string | null;
  recording?: string | null;
  limit?: number | null;
  offset?: number | null;
}): Promise<unknown> {
  return withLoading(invoke("get_gaze_data", {
    ...bothTestNames(params.testName),
    participants: params.participants,
    timeline: params.timeline ?? null,
    recording: params.recording ?? null,
    limit: params.limit ?? null,
    offset: params.offset ?? null,
  }));
}

export async function getBoxStatsRaw(params: {
  testName: string;
  participants: string[];
  timeline?: string | null;
  recording?: string | null;
}): Promise<unknown> {
  return withLoading(invoke("get_box_stats", {
    ...bothTestNames(params.testName),
    participants: params.participants,
    timeline: params.timeline ?? null,
    recording: params.recording ?? null,
  }));
}

export async function getTestImageRaw(params: {
  testName: string;
  timeline?: string | null;
}): Promise<unknown> {
  return withLoading(invoke("get_test_image", {
    ...bothTestNames(params.testName),
    timeline: params.timeline ?? null,
  }));
}

export async function getParticipantsForTestRaw(params: { testName: string }): Promise<unknown> {
  return withLoading(invoke("get_participants_for_test", bothTestNames(params.testName)));
}

export async function getTestsForParticipantRaw(params: { participant: string }): Promise<unknown> {
  return withLoading(invoke("get_tests_for_participant", { participant: params.participant }));
}

// Disabled slices + listing helpers
export async function listGazeSlicesRaw(params: { testName?: string; participants?: string[] } = {}): Promise<unknown> {
  const t = params.testName ?? null;
  return withLoading(invoke("list_gaze_slices", {
    test_name: t,
    testName: t,
    participants: params.participants ?? [],
  }));
}

export async function getDisabledSlicesRaw(): Promise<DisabledSlice[]> {
  return withLoading(invoke("get_disabled_slices"));
}

export async function setDisabledSlicesRaw(slices: DisabledSlice[]): Promise<void> {
  return withLoading(invoke("set_disabled_slices", { slices }));
}

export async function toggleDisabledSliceRaw(slice: DisabledSlice, disabled: boolean): Promise<void> {
  return withLoading(invoke("toggle_disabled_slice", { slice, disabled }));
}

export async function searchTestsRaw(): Promise<SearchTestRow[]> {
  return withLoading(invoke("search_tests"));
}

export async function searchSlicesRaw(params: { testName?: string; participants?: string[] } = {}): Promise<SearchSliceRow[]> {
  const t = params.testName ?? null;
  return withLoading(invoke("search_slices", { test_name: t, testName: t, participants: params.participants ?? [] }));
}

// participants table (full rows)
export async function getParticipantsTableRaw(): Promise<RowMap[]> {
  return withLoading(invoke("get_participants"));
}

export async function getAllParticipantSessionsRaw(params: {
  tests: string[];
  participants: string[];
}): Promise<unknown> {
  return withLoading(invoke("get_all_participant_sessions", {
    tests: params.tests,
    participants: params.participants,
  }));
}

// (dedupe guard) — function defined once
