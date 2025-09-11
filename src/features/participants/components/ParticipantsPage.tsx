import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextField, TextFieldInput } from "@/components/ui/text-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getParticipantsTable, getTestsByParticipant, type ParticipantRow } from "../services/participantsApi";
import JsonViewer from "@/components/ui/json-viewer";

export default function ParticipantsPage() {
  const [rows, setRows] = createSignal<ParticipantRow[]>([]);
  const [testsByP, setTestsByP] = createSignal<Record<string, string[]>>({});
  const [q, setQ] = createSignal("");
  const [onlyQac, setOnlyQac] = createSignal(false);
  const [onlyNonQac, setOnlyNonQac] = createSignal(false);

  createEffect(async () => {
    setRows(await getParticipantsTable());
    setTestsByP(await getTestsByParticipant());
  });

  const filtered = createMemo(() => {
    const term = q().toLowerCase().trim();
    return rows().filter((r) => {
      if (onlyQac() && (r.is_qac ?? 1) !== 1) return false;
      if (onlyNonQac() && (r.is_qac ?? 1) !== 0) return false;
      if (!term) return true;
      const tests = testsByP()[r.participant] || [];
      return [r.participant, String(r.is_qac ?? "")].concat(tests).some((v) => (v || "").toLowerCase().includes(term));
    });
  });

  const counts = createMemo(() => {
    const arr = rows();
    return {
      total: arr.length,
      qac: arr.filter((r) => (r.is_qac ?? 1) === 1).length,
      nonqac: arr.filter((r) => (r.is_qac ?? 1) === 0).length,
    };
  });

  return (
    <div class="space-y-6">
      <Card>
        <CardHeader><CardTitle>Participants</CardTitle></CardHeader>
        <CardContent>
          <div class="flex flex-wrap items-center gap-3">
            <div class="text-sm text-muted-foreground">
              Total: <b>{counts().total}</b> · QAC: <b>{counts().qac}</b> · non-QAC: <b>{counts().nonqac}</b>
            </div>
            <TextField value={q()} onChange={setQ}>
              <TextFieldInput placeholder="Search participants or tests…" class="w-72" />
            </TextField>
            <label class="inline-flex items-center gap-2 text-sm">
              <Checkbox checked={onlyQac()} onChange={(v) => { setOnlyQac(!!v); if (v) setOnlyNonQac(false); }} /> QAC only
            </label>
            <label class="inline-flex items-center gap-2 text-sm">
              <Checkbox checked={onlyNonQac()} onChange={(v) => { setOnlyNonQac(!!v); if (v) setOnlyQac(false); }} /> non-QAC only
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Roster</CardTitle></CardHeader>
        <CardContent>
          <div class="rounded border overflow-auto">
            <div class="min-w-[700px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Participant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tests</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <Show when={filtered().length} fallback={
                    rows().length === 0
                      ? Array.from({ length: 8 }).map(() => (<TableRow><TableCell colSpan={3}><Skeleton class="h-5 w-full" /></TableCell></TableRow>))
                      : (<TableRow><TableCell colSpan={3} class="text-center">No results.</TableCell></TableRow>)
                  }>
                    <For each={filtered()}>
                      {(r) => (
                        <TableRow>
                          <TableCell class="font-medium">{r.participant}</TableCell>
                          <TableCell>{(r.is_qac ?? 1) === 1 ? "QAC" : "non-QAC"}</TableCell>
                          <TableCell class="text-xs text-muted-foreground">
                            {(testsByP()[r.participant] || []).join(", ")}
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </Show>
                </TableBody>
              </Table>
            </div>
          </div>
          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <JsonViewer title="Participants table" data={rows()} />
            <JsonViewer title="Tests by participant" data={testsByP()} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
