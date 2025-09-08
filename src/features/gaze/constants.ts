import type { BoxTypes } from "./types";

export const DEF_INTERVAL_MS = 100;
export const DEF_PX_PER_SEC  = 40;
export const DEF_SPAN_SEC    = 15;
export const DEF_VIEW_SEC    = 15;

export const DEFAULT_COLORS: Record<BoxTypes, string> = {
  "Animal 1":"red","Object 1 for Animal 1":"darkred","Object 2 for Animal 1":"firebrick",
  "Animal 2":"blue","Object 1 for Animal 2":"darkblue","Object 2 for Animal 2":"royalblue",
  "Animal 3":"green","Object 1 for Animal 3":"darkgreen","Object 2 for Animal 3":"limegreen",
  "other":"grey","missing":"#999999","out_of_screen":"#666666",
};

export const CODE_TO_BOX: Record<string, BoxTypes> = {
  S1:"Animal 1", S2:"Animal 2", S3:"Animal 3",
  O1A:"Object 1 for Animal 1", O1B:"Object 2 for Animal 1",
  O2A:"Object 1 for Animal 2", O2B:"Object 2 for Animal 2",
  O3A:"Object 1 for Animal 3", O3B:"Object 2 for Animal 3",
};

export const HUE_START = 220;
export const HUE_END = 0;
