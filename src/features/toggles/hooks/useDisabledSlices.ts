import { createMemo, createResource, createSignal } from "solid-js";
import type { DisabledSlice } from "@/shared/type";
import { getDisabledSlices, listGazeSlices, toggleDisabledSlice } from "@/features/toggles/services/togglesApi";

export function useDisabledSlices() {
  const [testName, setTestName] = createSignal<string>("");
  const [participants, setParticipants] = createSignal<string[]>([]);

  const [disabled, { mutate: mutateDisabled, refetch: refetchDisabled }] = createResource(async () => getDisabledSlices());
  const [candidates] = createResource(() => ({ t: testName(), ps: participants() }), async (p) => listGazeSlices({ testName: p.t, participants: p.ps }));

  const isDisabled = (s: DisabledSlice) => {
    const d = disabled();
    if (!d) return false;
    return d.some(x => x.test_name === s.test_name && x.recording_name === s.recording_name && x.participant_name === s.participant_name);
  };

  const visible = createMemo(() => candidates() ?? []);

  async function setSlice(s: DisabledSlice, off: boolean) {
    await toggleDisabledSlice(s, off);
    // Optimistic update
    const cur = disabled() ?? [];
    if (off) {
      if (!isDisabled(s)) mutateDisabled([s, ...cur]);
    } else {
      mutateDisabled(cur.filter(x => !(x.test_name === s.test_name && x.recording_name === s.recording_name && x.participant_name === s.participant_name)));
    }
  }

  return {
    testName, setTestName,
    participants, setParticipants,
    disabled, refetchDisabled,
    candidates: visible,
    isDisabled,
    setSlice,
  };
}
