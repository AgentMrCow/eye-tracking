export type RowMap = Record<string, string | null>;

export interface StaticData {
  test_catalog: RowMap[];
  test_group: RowMap[];
  recordings: RowMap[];
  participants: string[];
  test_names: string[];
  participants_by_test?: Record<string, string[]>;
  tests_by_participant?: Record<string, string[]>;
}

export interface GazeData {
  gaze_x: number | null;
  gaze_y: number | null;
  box_name: string;
  media_name: string;
  timeline: string;
  participant: string;
  recording: string;
  timestamp: string;
  test_name: string;
}

export interface GazeStats {
  box_percentages: Record<string, number>;
  total_points: number;
}

export interface DisabledSlice {
  test_name: string;
  recording_name: string;
  participant_name: string;
}

export interface SearchTestRow {
  test_name: string;
  group?: string | null;
  image_name?: string | null;
  sentence?: string | null;
  avg_pair_duration_seconds?: number | null;
  occurrences?: number | null;
  mp4_triples?: number | null;
  png_triples?: number | null;
}

export interface TimelineRecording {
  timeline: string;
  recording: string;
}

export interface WordWindow {
  chinese_word: string;
  start_sec: number;
  end_sec: number;
  test_name: string;
  timeline: string;
}

export interface SearchSliceRow {
  test_name: string;
  recording_name: string;
  participant_name: string;
  group?: string | null;
  image_name?: string | null;
  sentence?: string | null;
  pair_duration_seconds?: number | null;
  mp4_duration_seconds?: number | null;
  png_duration_seconds?: number | null;
}
