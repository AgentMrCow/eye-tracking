export type TestCatalogRow = {
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
  image_name?: string | null;
  timeline?: string | null;
  word_windows_json?: string | null;
  missing?: string | null;
  image_path?: string | null;

  aoi_extra?: Record<string, string | null>;
};

export type GazeData = {
  gaze_x: number | null;
  gaze_y: number | null;
  box_name: string;
  media_name: string;
  timeline: string;
  participant: string;
  recording: string;
  timestamp: string;
  test_name: string;
};

export type WordWindow = {
  chinese_word: string;
  start_sec: number;
  end_sec: number;
  test_name: string;
  timeline: string;
};

export type TimelineRecording = { timeline: string; recording: string };

export type BoxTypes =
  | "Animal 1" | "Object 1 for Animal 1" | "Object 2 for Animal 1"
  | "Animal 2" | "Object 1 for Animal 2" | "Object 2 for Animal 2"
  | "Animal 3" | "Object 1 for Animal 3" | "Object 2 for Animal 3"
  | "other" | "missing" | "out_of_screen";

export type AoiKey = string;

export type CompareBy = "group" | "truth_value" | "only_position" | "morpheme" | "series" | "case_no";
export type AggMode = "discrete" | "continuous";

export type DetailedRow = {
  test: string;
  group: string | null;
  truth: string | null;
  series: string | null;
  morph: string | null;
  pos: string | null;
  case_no: number | null;
  participant: string;
  recording: string;
  valid: number;
  total: number;
  blue: number;
  red: number;
  pctBlue: number;
};

export type ParticipantSummary = {
  participant: string;
  meanPct: number;
  weightedPct: number;
};
