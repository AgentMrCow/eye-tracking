import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberField, NumberFieldInput } from "@/components/ui/number-field";
import { LineChart } from "@/components/ui/charts";
import { getAllCatalog, getGazeData, getParticipants, getTimelineRecordings } from "@/features/gaze/services/gazeApi";
import JsonViewer from "@/components/ui/json-viewer";
import { parseAOISet } from "@/features/gaze/utils";

type SeriesPoint = { x: number; y: number };

export default function StatsPage() {
  const [tests, setTests] = createSignal<string[]>([]);
  const [participants, setParticipants] = createSignal<string[]>([]);
  const [selectedTest, setSelectedTest] = createSignal<string>("");
  const [selectedPart, setSelectedPart] = createSignal<string>("");
  const [timelines, setTimelines] = createSignal<string[]>([]);
  const [recordings, setRecordings] = createSignal<string[]>([]);
  const [timeline, setTimeline] = createSignal<string>("");
  const [recording, setRecording] = createSignal<string>("");

  // analysis params
  const [binMs, setBinMs] = createSignal(100);
  const [shiftMs, setShiftMs] = createSignal(200);
  const [windowMs, setWindowMs] = createSignal(600);
  const [sustainMs, setSustainMs] = createSignal(200);

  // series + result
  const [series, setSeries] = createSignal<SeriesPoint[]>([]);
  const [rec, setRec] = createSignal<{ start: number; end: number } | null>(null);

  createEffect(async () => {
    const catalog = await getAllCatalog();
    setTests(Array.from(new Set(catalog.map((r) => r.test_name))));
    setParticipants(await getParticipants());
  });

  // sessions
  createEffect(async () => {
    setTimelines([]); setRecordings([]); setTimeline(""); setRecording("");
    const t = selectedTest(); const p = selectedPart();
    if (!t || !p) return;
    const pairs = await getTimelineRecordings({ testName: t, participants: [p] }).catch(() => []);
    const ts = Array.from(new Set(pairs.map((x) => x.timeline)));
    const rs = Array.from(new Set(pairs.map((x) => x.recording)));
    setTimelines(ts); setRecordings(rs);
    if (pairs.length === 1) { setTimeline(pairs[0].timeline); setRecording(pairs[0].recording); }
  });

  const canCompute = createMemo(() => selectedTest() && selectedPart() && timeline() && recording());

  async function compute() {
    setSeries([]); setRec(null);
    const t = selectedTest(); const p = selectedPart();
    const tl = timeline(); const rc = recording();
    if (!t || !p || !tl || !rc) return;

    // AOI sets for the selected test (default blue=correct_AOIs, red=others)
    const catalog = await getAllCatalog();
    const row = catalog.find((r) => r.test_name === t);
    const blue = new Set(parseAOISet((row as any)?.correct_AOIs));
    const red  = new Set([
      ...parseAOISet((row as any)?.self_AOIs),
      ...parseAOISet(row?.potentially_correct_AOIs),
      ...parseAOISet(row?.incorrect_AOIs),
      ...parseAOISet(row?.correct_NULL),
      ...parseAOISet(row?.potentially_correct_NULL),
      ...parseAOISet(row?.incorrect_NULL),
    ]);

    // fetch gaze
    const data = await getGazeData({ testName: t, participants: [p], timeline: tl, recording: rc }).catch(() => []);
    if (!data.length) return;

    // bin
    const ms = Math.max(1, binMs());
    const base = +new Date(data[0].timestamp);
    const bins: Record<number, { total: number; blue: number; red: number }> = {};
    for (const g of data) {
      const k = Math.floor(+new Date(g.timestamp) / ms) * ms;
      const b = (bins[k] ||= { total: 0, blue: 0, red: 0 });
      b.total++;
      const box = g.box_name;
      if (blue.has(box as any)) b.blue++;
      else if (red.has(box as any)) b.red++;
    }
    const pts: SeriesPoint[] = Object.keys(bins).map((key) => {
      const k = Number(key);
      const b = bins[k];
      const denom = b.blue + b.red;
      const y = denom ? ((b.blue / denom) * 100) - ((b.red / denom) * 100) : 0; // % difference
      return { x: (k - base + shiftMs()) / 1000, y };
    }).sort((a, b) => a.x - b.x);
    setSeries(pts);

    // recommend earliest sustained plateau
    const L = pts.length; if (L === 0) return;
    const w = Math.max(1, Math.round(windowMs() / ms));
    const sustain = Math.max(1, Math.round(sustainMs() / ms));
    const maxY = pts.reduce((a, p) => Math.max(a, p.y), -Infinity);
    const thr = maxY * 0.75; // 75% of peak
    let pick: { start: number; end: number } | null = null;
    for (let i = 0; i + w + sustain <= L; i++) {
      const mean = pts.slice(i, i + w).reduce((a, p) => a + p.y, 0) / w;
      if (mean >= thr) {
        // check sustain: next sustain bins remain above threshold
        const ok = pts.slice(i, i + w + sustain).every((p) => p.y >= thr * 0.95);
        if (ok) { pick = { start: pts[i].x, end: pts[i + w - 1].x }; break; }
      }
    }
    setRec(pick);
  }

  const viz = () => ({ datasets: [
    { label: "% blue - % red", data: series(), borderColor: "#2563eb", pointRadius: 0, borderWidth: 1, tension: 0 },
    ...(rec() ? [{ label: "window", data: [{ x: rec()!.start, y: 0 }, { x: rec()!.start, y: 100 }], borderColor: "#16a34a", borderDash: [6, 3], pointRadius: 0, borderWidth: 1, tension: 0 } as any] : []),
  ]});

  return (
    <div class="space-y-6">
      <Card>
        <CardHeader><CardTitle>Cut-off Window Explorer (single test × participant)</CardTitle></CardHeader>
        <CardContent class="space-y-3">
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">Test</span>
              <Select value={selectedTest()} onChange={(v) => { setSelectedTest(v || ""); setTimeline(""); setRecording(""); }} options={tests()} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                <SelectTrigger class="w-60"><SelectValue>{selectedTest() || "Select test"}</SelectValue></SelectTrigger>
                <SelectContent class="max-h-60 overflow-y-auto" />
              </Select>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">Participant</span>
              <Select value={selectedPart()} onChange={(v) => { setSelectedPart(v || ""); setTimeline(""); setRecording(""); }} options={participants()} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
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
                <NumberField value={binMs()} class="w-24"><NumberFieldInput min={10} max={2000} onInput={(e) => setBinMs(Math.max(1, +e.currentTarget.value || 1))} /></NumberField>
                <span>ms</span>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <span>Shift</span>
                <NumberField value={shiftMs()} class="w-24"><NumberFieldInput min={0} max={2000} onInput={(e) => setShiftMs(Math.max(0, +e.currentTarget.value || 0))} /></NumberField>
                <span>ms</span>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <span>Window</span>
                <NumberField value={windowMs()} class="w-24"><NumberFieldInput min={100} max={4000} onInput={(e) => setWindowMs(Math.max(1, +e.currentTarget.value || 1))} /></NumberField>
                <span>ms</span>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <span>Sustain</span>
                <NumberField value={sustainMs()} class="w-24"><NumberFieldInput min={0} max={4000} onInput={(e) => setSustainMs(Math.max(0, +e.currentTarget.value || 0))} /></NumberField>
                <span>ms</span>
              </div>
              <Button onClick={compute} disabled={!canCompute()}>Compute</Button>
            </div>
          </div>
          <div class="h-[380px] mt-3 rounded border p-2">
            <Show when={series().length} fallback={<div class="h-full grid place-items-center text-sm text-muted-foreground">Select test, participant, timeline, recording, then Compute.</div>}>
              <LineChart data={viz()} options={{ responsive: true, maintainAspectRatio: false, scales: { x: { type: "linear", min: 0 }, y: { beginAtZero: true } }, plugins: { legend: { position: "top", align: "start", labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } } } } }} />
            </Show>
          </div>
          <Show when={rec()}>
            <div class="text-sm text-muted-foreground">
              Recommended earliest sustained window: <b>{rec()!.start.toFixed(3)}s</b> → <b>{rec()!.end.toFixed(3)}s</b> (threshold = 0.75 × peak)
            </div>
          </Show>
          <div class="grid gap-3 md:grid-cols-2">
            <JsonViewer title="Series (points)" data={series()} getExplanation={() =>
              'Points are computed from binned %Blue - %Red with a 200ms (default) shift applied. Use Bin/Shift controls to change.'} />
            <JsonViewer title="Parameters & result" data={{ binMs: binMs(), shiftMs: shiftMs(), windowMs: windowMs(), sustainMs: sustainMs(), pick: rec() }} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
