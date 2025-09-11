import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberField, NumberFieldInput } from "@/components/ui/number-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import JsonViewer from "@/components/ui/json-viewer";

import { getAllCatalog, getGazeData, getParticipants, getTimelineRecordings, getWordWindows } from "@/features/gaze/services/gazeApi";
import type { BoxTypes } from "@/features/gaze/types";
import { parseAOISet } from "@/features/gaze/utils";

// Catalog helpers
import { ALL_AOI_KEYS, AOI_KEY_LABEL, AOI_CODE_TO_BOX } from "@/features/catalog/constants";
import { boxesFor } from "@/features/catalog/utils";

type ReportRow = {
  participant: string;
  recording: string;
  timeline: string;
  test_name: string;
  AOI_Category: string;
  Involved_AOIs: string; // codes e.g., "S1,O1A"
  Analysis_Start_ms: number;
  bins: number[]; // percentages per bin
};

export default function AoiReportPage() {
  // Selections
  const [tests, setTests] = createSignal<string[]>([]);
  const [participants, setParticipants] = createSignal<string[]>([]);
  const [selectedTest, setSelectedTest] = createSignal<string>("");
  const [selectedPart, setSelectedPart] = createSignal<string>("");
  const [timelines, setTimelines] = createSignal<string[]>([]);
  const [recordings, setRecordings] = createSignal<string[]>([]);
  const [timeline, setTimeline] = createSignal<string>("");
  const [recording, setRecording] = createSignal<string>("");

  // Windows + anchor
  const [wordWin, setWordWin] = createSignal<{ chinese_word: string; start_sec: number; end_sec: number }[]>([]);
  const [anchorMode, setAnchorMode] = createSignal<"manual" | "word">("manual");
  const [anchorWord, setAnchorWord] = createSignal<string>("");
  const [analysisStartMs, setAnalysisStartMs] = createSignal<number>(0);
  const [shiftMs, setShiftMs] = createSignal<number>(200);

  // Binning params
  const [binMs, setBinMs] = createSignal<number>(100);
  const [numBins, setNumBins] = createSignal<number>(9);

  // Categories
  const [catalogRow, setCatalogRow] = createSignal<any>(null);
  const [availableKeys, setAvailableKeys] = createSignal<string[]>([]);
  const [selectedKeys, setSelectedKeys] = createSignal<string[]>([]);
  const [invalidCats, setInvalidCats] = createSignal<("other" | "missing" | "out_of_screen")[]>(["missing"]);

  // Results
  const [rows, setRows] = createSignal<ReportRow[]>([]);

  // init tests + participants + catalog
  createEffect(async () => {
    const cat = await getAllCatalog();
    setTests(Array.from(new Set(cat.map(r => r.test_name))));
    setParticipants(await getParticipants());
  });

  // sessions when test/participant set
  createEffect(async () => {
    setTimelines([]); setRecordings([]); setTimeline(""); setRecording(""); setWordWin([]); setCatalogRow(null);
    const t = selectedTest(); const p = selectedPart();
    if (!t || !p) return;
    const prs = await getTimelineRecordings({ testName: t, participants: [p] }).catch(() => []);
    setTimelines(Array.from(new Set(prs.map(x => x.timeline))));
    setRecordings(Array.from(new Set(prs.map(x => x.recording))));
    const cat = await getAllCatalog();
    setCatalogRow(cat.find(r => r.test_name === t) || null);
    setWordWin(await getWordWindows({ testName: t }).catch(() => []));
  });

  // derive available AOI keys for the selected test (non-empty sets only)
  createEffect(() => {
    const row = catalogRow();
    if (!row) { setAvailableKeys([]); setSelectedKeys([]); return; }
    const avail = ALL_AOI_KEYS.filter(k => parseAOISet((row as any)[k]).length > 0);
    setAvailableKeys(avail);
    setSelectedKeys(avail.slice(0, Math.min(avail.length, 6))); // pick some by default
  });

  // mapping to AOI codes from boxes (reverse AOI_CODE_TO_BOX)
  const codeByBox = createMemo(() => {
    const m: Record<string, string> = {};
    const source: Record<string, string> = AOI_CODE_TO_BOX as Record<string, string>;
    Object.keys(source).forEach(code => { const box = source[code]; m[box] = code; });
    return m;
  });

  const canCompute = createMemo(() => selectedTest() && selectedPart() && timeline() && recording() && selectedKeys().length);

  async function generate() {
    setRows([]);
    const t = selectedTest(); const p = selectedPart();
    const tl = timeline(); const rc = recording();
    if (!t || !p || !tl || !rc) return;

    const data = await getGazeData({ testName: t, participants: [p], timeline: tl, recording: rc }).catch(() => []);
    if (!data.length) { setRows([]); return; }
    const baseMs = +new Date(data[0].timestamp);

    // anchor absolute milliseconds
    let anchorAbs = baseMs + (analysisStartMs() || 0);
    if (anchorMode() === 'word') {
      const ww = wordWin().find(w => w.chinese_word === anchorWord());
      if (ww) anchorAbs = baseMs + (ww.start_sec * 1000);
    }
    anchorAbs += shiftMs();

    // Prepare bins: per bin -> list of box_names
    const bins: { box: string }[][] = Array.from({ length: numBins() }, () => []);
    const inv = new Set<string>(invalidCats());
    for (const g of data) {
      const ts = +new Date(g.timestamp);
      const rel = ts - anchorAbs; // ms
      if (rel <= 0) continue;
      const idx = Math.floor(rel / Math.max(1, binMs()));
      if (idx < 0 || idx >= numBins()) continue;
      bins[idx].push({ box: g.box_name });
    }

    // AOI sets for selected keys
    const row = catalogRow();
    // compute a Set<BoxTypes> for each key
    const sets = new Map<string, Set<BoxTypes>>();
    for (const k of selectedKeys()) {
      sets.set(k, boxesFor(row, [k] as any));
    }

    // Build rows per AOI key
    const out: ReportRow[] = [];
    sets.forEach((boxSet, key) => {
      const involvedCodes = Array.from(boxSet).map(b => codeByBox()[b as string]).filter(Boolean) as string[];
      const binPct: number[] = [];
      for (let i = 0; i < bins.length; i++) {
        const arr = bins[i];
        const valid = arr.filter(d => !inv.has(d.box)).length;
        if (valid === 0) { binPct.push(0); continue; }
        const inSet = arr.filter(d => boxSet.has(d.box as BoxTypes) && !inv.has(d.box)).length;
        binPct.push((inSet / valid) * 100);
      }
      out.push({
        participant: p,
        recording: rc,
        timeline: tl,
        test_name: t,
        AOI_Category: AOI_KEY_LABEL[key] || key,
        Involved_AOIs: involvedCodes.join(","),
        Analysis_Start_ms: anchorAbs - baseMs,
        bins: binPct,
      });
    });

    setRows(out);
  }

  function exportCsv() {
    const headers = [
      "Participant name","Recording name","Timeline name","test_name","AOI_Category","Involved_AOIs","Analysis_Start_ms",
      ...Array.from({ length: numBins() }, (_, i) => `${i*binMs()+1}-${(i+1)*binMs()}ms`),
    ];
    const lines = [headers.join(",")];
    for (const r of rows()) {
      const base = [r.participant, r.recording, r.timeline, r.test_name, r.AOI_Category, r.Involved_AOIs, String(r.Analysis_Start_ms)];
      const arr = base.concat(r.bins.map(v => v.toFixed(2)));
      lines.push(arr.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `aoi_report_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div class="space-y-6">
      <Card>
        <CardHeader><CardTitle>AOI Report Builder</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">Test</span>
              <Select value={selectedTest()} onChange={(v) => setSelectedTest(v || "")} options={tests()} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                <SelectTrigger class="w-60"><SelectValue>{selectedTest() || "Select test"}</SelectValue></SelectTrigger>
                <SelectContent class="max-h-60 overflow-y-auto" />
              </Select>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">Participant</span>
              <Select value={selectedPart()} onChange={(v) => setSelectedPart(v || "")} options={participants()} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                <SelectTrigger class="w-60"><SelectValue>{selectedPart() || "Select participant"}</SelectValue></SelectTrigger>
                <SelectContent class="max-h-60 overflow-y-auto" />
              </Select>
            </div>
            <Show when={timelines().length > 1 || recordings().length > 1}>
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Timeline</span>
                <Select value={timeline()} onChange={(v) => { setTimeline(v || ""); setRecording(""); }} options={timelines()} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-56"><SelectValue>{timeline() || "Select timeline"}</SelectValue></SelectTrigger>
                  <SelectContent />
                </Select>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Recording</span>
                <Select value={recording()} onChange={(v) => setRecording(v || "")} options={recordings()} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-56"><SelectValue>{recording() || "Select recording"}</SelectValue></SelectTrigger>
                  <SelectContent />
                </Select>
              </div>
            </Show>
            <div class="ml-auto flex items-end gap-3">
              <div class="flex items-center gap-2 text-sm">
                <span>Bin</span>
                <NumberField value={binMs()} class="w-24"><NumberFieldInput min={50} max={2000} onInput={(e) => setBinMs(Math.max(1, +e.currentTarget.value || 1))} /></NumberField>
                <span>ms</span>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <span>Bins</span>
                <NumberField value={numBins()} class="w-20"><NumberFieldInput min={1} max={60} onInput={(e) => setNumBins(Math.max(1, +e.currentTarget.value || 1))} /></NumberField>
              </div>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="rounded border p-3 space-y-2">
              <div class="text-sm font-medium">Anchor</div>
              <div class="flex items-center gap-2 text-sm">
                <Button size="sm" variant={anchorMode()==='manual' ? 'default' : 'outline'} onClick={() => setAnchorMode('manual')}>Manual</Button>
                <Button size="sm" variant={anchorMode()==='word' ? 'default' : 'outline'} onClick={() => setAnchorMode('word')}>Word</Button>
              </div>
              <Show when={anchorMode()==='manual'}>
                <div class="flex items-center gap-2 text-sm">
                  <span>Analysis_Start_ms</span>
                  <NumberField value={analysisStartMs()} class="w-28"><NumberFieldInput min={0} max={600000} onInput={(e) => setAnalysisStartMs(Math.max(0, +e.currentTarget.value || 0))} /></NumberField>
                </div>
              </Show>
              <Show when={anchorMode()==='word'}>
                <div class="flex items-center gap-2 text-sm">
                  <span>Word</span>
                  <Select value={anchorWord()} onChange={(v) => setAnchorWord(v || "")} options={wordWin().map(w => w.chinese_word)} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                    <SelectTrigger class="w-56"><SelectValue>{anchorWord() || "Select word"}</SelectValue></SelectTrigger>
                    <SelectContent class="max-h-60 overflow-y-auto" />
                  </Select>
                </div>
              </Show>
              <div class="flex items-center gap-2 text-sm">
                <span>Shift</span>
                <NumberField value={shiftMs()} class="w-24"><NumberFieldInput min={0} max={2000} onInput={(e) => setShiftMs(Math.max(0, +e.currentTarget.value || 0))} /></NumberField>
                <span>ms</span>
              </div>
            </div>

            <div class="rounded border p-3 space-y-2">
              <div class="text-sm font-medium">AOI Categories</div>
              <div class="text-xs text-muted-foreground">Select AOI keys present for this test. Values computed as % of valid points per bin.</div>
              <div class="flex flex-wrap gap-2">
                <For each={availableKeys()}>{k =>
                  <button class={`px-2 py-0.5 border rounded text-xs ${selectedKeys().includes(k) ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                          onClick={() => {
                            const set = new Set(selectedKeys());
                            set.has(k) ? set.delete(k) : set.add(k);
                            setSelectedKeys(Array.from(set));
                          }}>
                    {AOI_KEY_LABEL[k] || k}
                  </button>
                }</For>
              </div>
              <div class="flex items-center gap-3 text-xs mt-2">
                <label class="inline-flex items-center gap-1"><input type="checkbox" checked={invalidCats().includes('missing')} onChange={(e) => {
                  const s = new Set(invalidCats()); e.currentTarget.checked ? s.add('missing') : s.delete('missing'); setInvalidCats(Array.from(s) as any);
                }} /> missing</label>
                <label class="inline-flex items-center gap-1"><input type="checkbox" checked={invalidCats().includes('out_of_screen')} onChange={(e) => {
                  const s = new Set(invalidCats()); e.currentTarget.checked ? s.add('out_of_screen') : s.delete('out_of_screen'); setInvalidCats(Array.from(s) as any);
                }} /> out_of_screen</label>
                <label class="inline-flex items-center gap-1"><input type="checkbox" checked={invalidCats().includes('other')} onChange={(e) => {
                  const s = new Set(invalidCats()); e.currentTarget.checked ? s.add('other') : s.delete('other'); setInvalidCats(Array.from(s) as any);
                }} /> other</label>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 justify-end">
            <Button onClick={generate} disabled={!canCompute()}>Generate Report</Button>
            <Button variant="outline" onClick={exportCsv} disabled={!rows().length}>Export CSV</Button>
          </div>
        </CardContent>
      </Card>

      <Show when={rows().length}>
        <Card>
          <CardHeader><CardTitle>Rows ({rows().length})</CardTitle></CardHeader>
          <CardContent>
            <div class="rounded border overflow-auto">
              <div class="min-w-[900px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Participant</TableHead>
                      <TableHead>Recording</TableHead>
                      <TableHead>Timeline</TableHead>
                      <TableHead>Test</TableHead>
                      <TableHead>AOI Category</TableHead>
                      <TableHead>Involved AOIs</TableHead>
                      <TableHead>Start (ms)</TableHead>
                      <For each={Array.from({ length: numBins() }, (_, i) => `${i*binMs()+1}-${(i+1)*binMs()}ms`)}>{h => <TableHead class="text-right">{h}</TableHead>}</For>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <For each={rows()}>{r => 
                      <TableRow>
                        <TableCell>{r.participant}</TableCell>
                        <TableCell>{r.recording}</TableCell>
                        <TableCell>{r.timeline}</TableCell>
                        <TableCell>{r.test_name}</TableCell>
                        <TableCell>{r.AOI_Category}</TableCell>
                        <TableCell class="text-xs text-muted-foreground">{r.Involved_AOIs || ""}</TableCell>
                        <TableCell class="text-right">{r.Analysis_Start_ms}</TableCell>
                        <For each={r.bins}>{v => <TableCell class="text-right tabular-nums">{v.toFixed(2)}</TableCell>}</For>
                      </TableRow>
                    }</For>
                  </TableBody>
                </Table>
              </div>
            </div>
            <div class="grid gap-3 md:grid-cols-2 mt-3">
              <JsonViewer title="Report JSON" data={rows()} />
            </div>
          </CardContent>
        </Card>
      </Show>
    </div>
  );
}
