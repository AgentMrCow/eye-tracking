export type RowMap = Record<string, string | null>;

export interface StaticData {
  test_catalog: RowMap[];
  test_group: RowMap[];
  recordings: RowMap[];
  participants: string[];
  test_names: string[];
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

export interface TimelineRecording {
  timeline: string;
  recording: string;
}
