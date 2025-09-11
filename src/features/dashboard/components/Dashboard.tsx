import { For, Show, createEffect, createSignal } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField, TextFieldInput } from "@/components/ui/text-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SearchTestRow } from "@/shared/type";
import { searchTests } from "@/features/toggles/services/searchApi";
import JsonViewer from "@/components/ui/json-viewer";

const fmt = (n?: number | null, d = 2) => (n == null ? "" : n.toFixed(d));

export default function Dashboard() {
  const [rows, setRows] = createSignal<SearchTestRow[]>([]);
  const [q, setQ] = createSignal("");

  createEffect(async () => { setRows(await searchTests().catch(() => [])); });

  const filtered = () => {
    const term = q().toLowerCase().trim();
    if (!term) return rows();
    return rows().filter(r => [r.test_name, r.group ?? "", r.image_name ?? "", r.sentence ?? ""].some(v => (v ?? "").toLowerCase().includes(term)));
  };

  const totals = () => {
    const arr = rows();
    return {
      tests: arr.length,
      withPairs: arr.filter(r => (r.occurrences ?? 0) > 0).length,
      avgPair: arr.reduce((a, r) => a + (r.avg_pair_duration_seconds || 0), 0) / (arr.filter(r => r.avg_pair_duration_seconds != null).length || 1),
    };
  };

  return (
    <div class="space-y-6">
      <Card>
        <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
        <CardContent>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div class="rounded border p-3"><div class="text-muted-foreground">Total tests</div><div class="text-xl font-semibold">{totals().tests}</div></div>
            <div class="rounded border p-3"><div class="text-muted-foreground">Tests with video+image pairs</div><div class="text-xl font-semibold">{totals().withPairs}</div></div>
            <div class="rounded border p-3"><div class="text-muted-foreground">Avg pair duration</div><div class="text-xl font-semibold">{fmt(totals().avgPair)}s</div></div>
          </div>
          <div class="mt-4">
            <JsonViewer title="Search results (tests)" data={filtered()} getExplanation={() =>
              'Aggregated by test from test_catalog and test_group; durations are mp4+png per unique triple.'} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="flex items-center justify-between">
          <CardTitle>Tests</CardTitle>
          <div class="ml-auto">
            <TextField value={q()} onChange={setQ}>
              <TextFieldInput placeholder="Search tests…" class="w-64" />
            </TextField>
          </div>
        </CardHeader>
        <CardContent>
          <div class="rounded border overflow-auto">
            <div class="min-w-[900px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>Sentence</TableHead>
                    <TableHead class="text-right">Avg pair (s)</TableHead>
                    <TableHead class="text-right">Pairs</TableHead>
                    <TableHead class="text-right">Triples (mp4/png)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <Show when={filtered().length} fallback={
                    rows().length === 0
                      ? Array.from({ length: 8 }).map(() => (
                          <TableRow><TableCell colSpan={7}><Skeleton class="h-5 w-full" /></TableCell></TableRow>
                        ))
                      : (<TableRow><TableCell colSpan={7} class="text-center">No results.</TableCell></TableRow>)
                  }>
                    <For each={filtered()}>
                      {(r) => (
                        <TableRow>
                          <TableCell class="font-medium">{r.test_name}</TableCell>
                          <TableCell>{r.group ?? ""}</TableCell>
                          <TableCell>{r.image_name ?? ""}</TableCell>
                          <TableCell>{r.sentence ?? ""}</TableCell>
                          <TableCell class="text-right tabular-nums">{fmt(r.avg_pair_duration_seconds)}</TableCell>
                          <TableCell class="text-right tabular-nums">{r.occurrences ?? 0}</TableCell>
                          <TableCell class="text-right tabular-nums">{(r.mp4_triples ?? 0)}/{(r.png_triples ?? 0)}</TableCell>
                        </TableRow>
                      )}
                    </For>
                  </Show>
                </TableBody>
              </Table>
            </div>
          </div>
          <div class="mt-3 flex gap-2 justify-end">
            <Button as={"a" as any} href="/compare" variant="outline">Open Catalog Compare</Button>
            <Button as={"a" as any} href="/data-toggle" variant="outline">Manage Data Toggles</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
