export type BoxTypes =
  | "Animal 1" | "Object 1 for Animal 1" | "Object 2 for Animal 1"
  | "Animal 2" | "Object 1 for Animal 2" | "Object 2 for Animal 2"
  | "Animal 3" | "Object 1 for Animal 3" | "Object 2 for Animal 3"
  | "other" | "missing" | "out_of_screen";

export interface GazeData {
  gaze_x: number | null;
  gaze_y: number | null;
  box_name: string;
  timestamp: string;
  participant: string;
  test_name: string;
  recording?: string;
}

export interface SelectOption { label: string; value: string; }

export type TLRec = { timeline: string; recording: string };

export type CatalogRow = {
  test_name: string;
  group?: string | null;
  self_AOIs?: string | null;
  correct_AOIs?: string | null;
  potentially_correct_AOIs?: string | null;
  incorrect_AOIs?: string | null;
  correct_NULL?: string | null;
  potentially_correct_NULL?: string | null;
  incorrect_NULL?: string | null;
};

export type RecordingRow = {
  recording: string;
  gaze_samples?: number | string | null;
};

export type TestMeta = {
  test_name: string;
  truth_value?: string | null;
  only_position?: string | null;
  morpheme?: string | null;
  series?: string | null;
  case_no?: number | null;
};

export type MetaKey =
  | "self_AOIs" | "correct_AOIs" | "potentially_correct_AOIs" | "incorrect_AOIs"
  | "correct_NULL" | "potentially_correct_NULL" | "incorrect_NULL";

export type { WordWindow } from "@/shared/type";
