import { z } from "zod";
import type { DisabledSlice } from "@/shared/type";
import {
  listGazeSlicesRaw,
  getDisabledSlicesRaw,
  toggleDisabledSliceRaw,
  setDisabledSlicesRaw,
} from "@/shared/tauriClient";

const DisabledSliceSchema: z.ZodType<DisabledSlice> = z.object({
  test_name: z.string(),
  recording_name: z.string(),
  participant_name: z.string(),
});

export async function listGazeSlices(params: { testName?: string; participants?: string[] } = {}) {
  const raw = await listGazeSlicesRaw({ testName: params.testName, participants: params.participants ?? [] });
  return z.array(DisabledSliceSchema).parse(raw);
}

export async function getDisabledSlices(): Promise<DisabledSlice[]> {
  const raw = await getDisabledSlicesRaw();
  return z.array(DisabledSliceSchema).parse(raw);
}

export async function toggleDisabledSlice(slice: DisabledSlice, disabled: boolean) {
  await toggleDisabledSliceRaw(slice, disabled);
}

export async function setDisabledSlices(slices: DisabledSlice[]) {
  await setDisabledSlicesRaw(slices);
}

// validity flows removed for now
