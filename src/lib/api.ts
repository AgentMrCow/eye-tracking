import { invoke } from "@tauri-apps/api/core";

export type RecordingRow = {
  Recording: string;
  Participant: string;
  Timeline: string;
  Duration?: string | null;
  Date?: string | null;
  "Gaze samples"?: number | null;
};

export type AoiMapRow = {
  test_name: string;
  tag: string;
  region_id: string;
  rgb_hex?: string | null;
};

export type TestCatalogFullRow = {
  test_name: string;
  sentence?: string | null;
  group?: string | null;

  correct_AOIs?: string | null;
  potentially_correct_AOIs?: string | null;
  incorrect_AOIs?: string | null;
  correct_NULL?: string | null;
  potentially_correct_NULL?: string | null;
  incorrect_NULL?: string | null;

  truth_value?: string | null;
  only_position?: string | null;
  morpheme?: string | null;
  series?: string | null;
  case_no?: number | null;
  "Image name"?: string | null;
  timeline?: string | null;
  word_windows_json?: string | null;
  image_path?: string | null;

  // Extra AOI columns (1:1 with DB column names)
  "Mentioned character (Animal)"?: string | null;
  "Mentioned object"?: string | null;
  "Mentioned character's extra object [For Szinghai]"?: string | null;
  "Mentioned character's extra object [For Vzinghai]"?: string | null;
  "Competitor character (Animal) [Correct interpretation]"?: string | null;
  "Competitor object [Correct interpretation (optional)]"?: string | null;
  "Competitor's extra object [Potentially correct interpretation]"?: string | null;
  "Dangling character i (Animal) [Potentially correct interpretation]"?: string | null;
  "Dangling object ia (R) [Potentially correct interpretation]"?: string | null;
  "Dangling object ib (L) [Potentially correct interpretation]"?: string | null;
  "Dangling character ii (Animal) [Potentially correct interpretation]"?: string | null;
  "Dangling object iia (R) [Potentially correct interpretation]"?: string | null;
  "Dangling object iib (L) [Potentially correct interpretation]"?: string | null;
  "Dangling character i (Animal) [Critical incorrect interpretation]"?: string | null;
  "Dangling object ia (R) [Critical incorrect interpretation]"?: string | null;
  "Dangling object ib (L) [Critical incorrect interpretation]"?: string | null;
  "Dangling character ii (Animal) [Critical incorrect interpretation]"?: string | null;
  "Dangling object iia (R) [Critical incorrect interpretation]"?: string | null;
  "Dangling object iib (L) [Critical incorrect interpretation]"?: string | null;
};

export type InitialData = {
  test_catalog: TestCatalogFullRow[];
  aoi_map: AoiMapRow[];
  recordings: RecordingRow[];
  participants: string[];
  test_names: string[];
};

export type GazeData = {
  gaze_x?: number | null;
  gaze_y?: number | null;
  box_name: string;
  media_name: string;
  timeline: string;
  participant: string;
  recording: string;
  timestamp: string;
  test_name: string;
};

export type GazeStats = {
  box_percentages: Record<string, number>;
  total_points: number;
};

export type TimelineRecording = {
  timeline: string;
  recording: string;
};

// Bootstrap (one call on app load)
export function loadInitial(): Promise<InitialData> {
  return invoke("get_initial_data");
}

// Images (use the path you already have from test_catalog.image_path)
export function fetchImageByPath(imagePath: string): Promise<string | null> {
  return invoke("get_image_by_path", { imagePath });
}

// Gaze
export function fetchGazeData(args: {
  testName: string;
  participants: string[];
  timeline?: string;
  recording?: string;
  limit?: number;
  offset?: number;
}): Promise<GazeData[]> {
  return invoke("get_gaze_data", {
    testName: args.testName,
    participants: args.participants,
    timeline: args.timeline ?? null,
    recording: args.recording ?? null,
    limit: args.limit ?? null,
    offset: args.offset ?? null,
  });
}

export function fetchBoxStats(args: {
  testName: string;
  participants: string[];
  timeline?: string;
  recording?: string;
}): Promise<GazeStats> {
  return invoke("get_box_stats", {
    testName: args.testName,
    participants: args.participants,
    timeline: args.timeline ?? null,
    recording: args.recording ?? null,
  });
}

export function fetchTimelineRecordings(args: {
  testName: string;
  participants: string[];
}): Promise<TimelineRecording[]> {
  return invoke("get_timeline_recordings", {
    testName: args.testName,
    participants: args.participants,
  });
}
