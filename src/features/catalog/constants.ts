import type { AoiKey, BoxTypes, CompareBy, DetailedRow } from "./types";

export const AOI_CODE_TO_BOX: Record<string, Exclude<BoxTypes, "other" | "missing" | "out_of_screen">> = {
  S1: "Animal 1",  O1A: "Object 1 for Animal 1", O2A: "Object 2 for Animal 1",
  S2: "Animal 2",  O1B: "Object 1 for Animal 2", O2B: "Object 2 for Animal 2",
  S3: "Animal 3",  O3A: "Object 1 for Animal 3", O3B: "Object 2 for Animal 3",
};

export const BASE_AOI_KEYS: AoiKey[] = [
  "correct_AOIs",
  "potentially_correct_AOIs",
  "incorrect_AOIs",
  "correct_NULL",
  "potentially_correct_NULL",
  "incorrect_NULL",
];

export const EXTRA_AOI_KEYS: AoiKey[] = [
  "Mentioned character (Animal)",
  "Mentioned object",
  "Mentioned character's extra object [For Szinghai]",
  "Mentioned character's extra object [For Vzinghai]",
  "Competitor character (Animal) [Correct interpretation]",
  "Competitor object [Correct interpretation (optional)]",
  "Competitor's extra object [Potentially correct interpretation]",
  "Dangling character i (Animal) [Potentially correct interpretation]",
  "Dangling object ia (R) [Potentially correct interpretation]",
  "Dangling object ib (L) [Potentially correct interpretation]",
  "Dangling character ii (Animal) [Potentially correct interpretation]",
  "Dangling object iia (R) [Potentially correct interpretation]",
  "Dangling object iib (L) [Potentially correct interpretation]",
  "Dangling character i (Animal) [Critical incorrect interpretation]",
  "Dangling object ia (R) [Critical incorrect interpretation]",
  "Dangling object ib (L) [Critical incorrect interpretation]",
  "Dangling character ii (Animal) [Critical incorrect interpretation]",
  "Dangling object iia (R) [Critical incorrect interpretation]",
  "Dangling object iib (L) [Critical incorrect interpretation]",
];

export const ALL_AOI_KEYS: AoiKey[] = [...BASE_AOI_KEYS, ...EXTRA_AOI_KEYS];

export const AOI_KEY_LABEL: Record<string, string> = {
  correct_AOIs: "correct AOIs",
  potentially_correct_AOIs: "potentially correct AOIs",
  incorrect_AOIs: "incorrect AOIs",
  correct_NULL: "correct NULL",
  potentially_correct_NULL: "potentially correct NULL",
  incorrect_NULL: "incorrect NULL",
};

export const FIELD_MAP: Record<CompareBy, keyof DetailedRow> = {
  group: "group",
  truth_value: "truth",
  only_position: "pos",
  morpheme: "morph",
  series: "series",
  case_no: "case_no",
};

export const HUE_START = 220;
export const HUE_END = 0;
