import { z } from "zod";
import type { SearchTestRow, SearchSliceRow } from "@/shared/type";
import { searchTestsRaw, searchSlicesRaw } from "@/shared/tauriClient";

const SearchTestRowSchema: z.ZodType<SearchTestRow> = z.object({
  test_name: z.string(),
  group: z.string().nullable().optional(),
  image_name: z.string().nullable().optional(),
  sentence: z.string().nullable().optional(),
  avg_pair_duration_seconds: z.number().nullable().optional(),
  occurrences: z.number().nullable().optional(),
  mp4_triples: z.number().nullable().optional(),
  png_triples: z.number().nullable().optional(),
});

export async function searchTests(): Promise<SearchTestRow[]> {
  const raw = await searchTestsRaw();
  return z.array(SearchTestRowSchema).parse(raw);
}

const SearchSliceRowSchema: z.ZodType<SearchSliceRow> = z.object({
  test_name: z.string(),
  recording_name: z.string(),
  participant_name: z.string(),
  group: z.string().nullable().optional(),
  image_name: z.string().nullable().optional(),
  sentence: z.string().nullable().optional(),
  pair_duration_seconds: z.number().nullable().optional(),
  mp4_duration_seconds: z.number().nullable().optional(),
  png_duration_seconds: z.number().nullable().optional(),
});

export async function searchSlices(params: { testName?: string; participants?: string[] } = {}): Promise<SearchSliceRow[]> {
  const raw = await searchSlicesRaw(params);
  return z.array(SearchSliceRowSchema).parse(raw);
}
