import { z } from "zod";
import type { RowMap } from "@/shared/type";
import { getStatic, getParticipantsTableRaw } from "@/shared/tauriClient";
import { pick } from "@/shared/services/testData";

export type ParticipantRow = { participant: string; is_qac: number | null };

const PSchema = z.object({
  participant: z.string(),
  is_qac: z.number().nullable(),
});

export async function getParticipantsTable(): Promise<ParticipantRow[]> {
  const rows = (await getParticipantsTableRaw().catch(() => [])) as RowMap[];
  return rows.map((r) => {
    const obj = {
      participant: (pick(r, "participant") ?? pick(r, "Participant") ?? pick(r, "Participant name") ?? "") as string,
      is_qac: (pick(r, "is_qac") as any) == null ? null : Number(pick(r, "is_qac") as any),
    };
    return PSchema.parse(obj) as ParticipantRow;
  });
}

export async function getTestsByParticipant(): Promise<Record<string, string[]>> {
  const s = await getStatic();
  return (s.tests_by_participant as Record<string, string[]>) || {};
}
