import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { NumberField, NumberFieldInput } from "@/components/ui/number-field";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart } from "@/components/ui/charts";
import type { BoxTypes, TimelineRecording, WordWindow } from "../types";
import { getTestImage, getTimelineRecordings, getWordWindows } from "../services/catalogApi";
import { Chart as ChartJS, type ChartOptions } from "chart.js";
import { timeColor } from "../utils";

type Props = {
  testNames: string[];
  participants: string[];
  getSetsFor: (testName: string) => { blue: Set<BoxTypes>; red: Set<BoxTypes> };
  invalidCats: ("other" | "missing" | "out_of_screen")[];
  // playback
  duration: () => number; setDuration: (n: number) => void;
  playSec: () => number; setPlaySec: (n: number) => void;
  isPlaying: () => boolean; play: () => void; pause: () => void; stop: () => void; scrub: (n: number) => void;
  // series builder
  useSeries: any; // hook factory injected by caller
};

const RevealClipPlugin = {
  id: "revealClip",
  beforeDatasetsDraw(chart: any, _args: any, pluginOpts: any) {
    if (!pluginOpts) return;
    const { ctx, chartArea, scales } = chart;
    const x = scales?.x;
    if (!chartArea || !x || typeof x.getPixelForValue !== "function") return;

    const play = Number.isFinite(pluginOpts.playSec) ? Number(pluginOpts.playSec) : 0;
    const px = x.getPixelForValue(play);
    if (!Number.isFinite(px)) return; // <<< IMPORTANT

    const clipX = Math.max(chartArea.left, Math.min(px, chartArea.right));
    ctx.save();
    ctx.beginPath();
    ctx.rect(chartArea.left, chartArea.top, clipX - chartArea.left, chartArea.bottom - chartArea.top);
    ctx.clip();
  },
  afterDatasetsDraw(chart: any) { try { chart.ctx.restore(); } catch {} },
} as const;


try { ChartJS.register(RevealClipPlugin as any); } catch {}

export default function ComparePanels(p: Props) {
  const [binMs, setBinMs] = createSignal(100);
  const [viewSec, setViewSec] = createSignal(15);
  const [autoSyncView, setAutoSyncView] = createSignal(true);

  const [selTest1, setSelTest1] = createSignal<string>("");
  const [selPart1, setSelPart1] = createSignal<string>("");
  const [selTest2, setSelTest2] = createSignal<string>("");
  const [selPart2, setSelPart2] = createSignal<string>("");

  const [combos1, setCombos1] = createSignal<TimelineRecording[]>([]);
  const timelines1 = createMemo(() => Array.from(new Set(combos1().map(c => c.timeline))));
  const [selTimeline1, setSelTimeline1] = createSignal<string>("");
  const recOpts1 = createMemo(() => combos1().filter(c => c.timeline === selTimeline1()).map(c => c.recording));
  const [selRecording1, setSelRecording1] = createSignal<string>("");

  const [combos2, setCombos2] = createSignal<TimelineRecording[]>([]);
  const timelines2 = createMemo(() => Array.from(new Set(combos2().map(c => c.timeline))));
  const [selTimeline2, setSelTimeline2] = createSignal<string>("");
  const recOpts2 = createMemo(() => combos2().filter(c => c.timeline === selTimeline2()).map(c => c.recording));
  const [selRecording2, setSelRecording2] = createSignal<string>("");

  const needsChoice1 = createMemo(() => combos1().length > 1 && (!selTimeline1() || !selRecording1()));
  const needsChoice2 = createMemo(() => combos2().length > 1 && (!selTimeline2() || !selRecording2()));
  const hasSel1 = createMemo(() => !!selTest1() && !!selPart1());
  const hasSel2 = createMemo(() => !!selTest2() && !!selPart2());

  // fetch sessions
  createEffect(async () => {
    const t = selTest1(), part = selPart1();
    if (!t || !part) { setCombos1([]); setSelTimeline1(""); setSelRecording1(""); return; }
    const list = await getTimelineRecordings({ testName: t, participants: [part] });
    setCombos1(list);
  });
  createEffect(async () => {
    const t = selTest2(), part = selPart2();
    if (!t || !part) { setCombos2([]); setSelTimeline2(""); setSelRecording2(""); return; }
    const list = await getTimelineRecordings({ testName: t, participants: [part] });
    setCombos2(list);
  });

  // re-enable auto view sync on context changes (test/participant/timeline/recording)
  createEffect(() => {
    // consume signals to establish dependency
    void selTest1(); void selPart1(); void selTimeline1(); void selRecording1();
    void selTest2(); void selPart2(); void selTimeline2(); void selRecording2();
    setAutoSyncView(true);
  });

  // keep current session valid
  createEffect(() => {
    const cmb = combos1(); const tset = new Set(cmb.map(c => c.timeline));
    if (!tset.has(selTimeline1())) setSelTimeline1(cmb.length === 1 ? cmb[0].timeline : "");
    const recs = cmb.filter(c => c.timeline === selTimeline1()); const rset = new Set(recs.map(c => c.recording));
    if (!rset.has(selRecording1())) setSelRecording1(recs.length === 1 ? recs[0].recording : "");
  });
  createEffect(() => {
    const cmb = combos2(); const tset = new Set(cmb.map(c => c.timeline));
    if (!tset.has(selTimeline2())) setSelTimeline2(cmb.length === 1 ? cmb[0].timeline : "");
    const recs = cmb.filter(c => c.timeline === selTimeline2()); const rset = new Set(recs.map(c => c.recording));
    if (!rset.has(selRecording2())) setSelRecording2(recs.length === 1 ? recs[0].recording : "");
  });

  // word windows
  const [ww1, setWw1] = createSignal<WordWindow[]>([]);
  const [ww2, setWw2] = createSignal<WordWindow[]>([]);
  let ww1Req = 0, ww2Req = 0;
  createEffect(async () => {
    const t = selTest1(); if (!t) { setWw1([]); return; }
    const my = ++ww1Req; const arr = await getWordWindows({ testName: t }).catch(() => []);
    if (my === ww1Req) setWw1(arr);
  });
  createEffect(async () => {
    const t = selTest2(); if (!t) { setWw2([]); return; }
    const my = ++ww2Req; const arr = await getWordWindows({ testName: t }).catch(() => []);
    if (my === ww2Req) setWw2(arr);
  });
  const currentWord1 = createMemo(() => {
    const t = p.playSec(); const w = ww1().find(w => t >= w.start_sec && t <= w.end_sec); return w?.chinese_word ?? null;
  });
  const currentWord2 = createMemo(() => {
    const t = p.playSec(); const w = ww2().find(w => t >= w.start_sec && t <= w.end_sec); return w?.chinese_word ?? null;
  });

  // series
  const series1 = p.useSeries(() => {
    const allow = hasSel1() && !needsChoice1();
    return {
      testName: allow ? selTest1() : null,
      participant: allow ? selPart1() : null,
      binMs: binMs(),
      invalidCats: p.invalidCats,
      ...p.getSetsFor(selTest1() || ""),
      timeline: allow ? selTimeline1() || undefined : null,
      recording: allow ? selRecording1() || undefined : null,
    };
  });
  const series2 = p.useSeries(() => {
    const allow = hasSel2() && !needsChoice2();
    return {
      testName: allow ? selTest2() : null,
      participant: allow ? selPart2() : null,
      binMs: binMs(),
      invalidCats: p.invalidCats,
      ...p.getSetsFor(selTest2() || ""),
      timeline: allow ? selTimeline2() || undefined : null,
      recording: allow ? selRecording2() || undefined : null,
    };
  });

  // duration sync
  createEffect(() => {
    const d = Math.max(series1()?.xMax ?? 0, series2()?.xMax ?? 0);
    p.setDuration(d);
    if (p.playSec() > d) p.setPlaySec(d);
    // auto-sync view width to the binned data span unless user overrode
    const dBin = Math.max(series1()?.xMaxBinned ?? 0, series2()?.xMaxBinned ?? 0);
    if (autoSyncView() && dBin > 0) {
      const next = Math.max(1, Math.round(dBin * 1000) / 1000);
      setViewSec(next);
    }
  });

  // charts + progressive reveal
  const compareOpts = (): ChartOptions => ({
    responsive: true, maintainAspectRatio: false,
    scales: { x: { type: "linear", min: 0, max: viewSec(), ticks: { maxTicksLimit: 10 } }, y: { beginAtZero: true, max: 100 } },
    plugins: {
      legend: { position: "top" as const, align: "start" as const,
        labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 }, filter: (l: any, d: any) => !(d.datasets?.[l.datasetIndex]?._ph) } },
      tooltip: { mode: "index", intersect: false, filter: (c: any) => !(c.dataset?._ph),
        callbacks: { label: (c: any) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } },
      // @ts-expect-error custom plugin not in type registry
      revealClip: { playSec: p.playSec() },
    },
    // Use object form to satisfy Chart.js typings.
    animation: { duration: 0 },
  });

  const withPlayhead = (datasets: any[]) => [
    ...datasets,
    { label: "playhead", data: [{ x: p.playSec(), y: 0 }, { x: p.playSec(), y: 100 }],
      borderColor: "#111", borderDash: [6,3], borderWidth: 1, pointRadius: 0, fill: false, tension: 0, _ph: true }
  ];

  const viz1 = createMemo(() => series1() ? { datasets: withPlayhead(series1()!.datasets) } : { datasets: [] });
  const viz2 = createMemo(() => series2() ? { datasets: withPlayhead(series2()!.datasets) } : { datasets: [] });

  // images + overlay
  const [img1B64, setImg1B64] = createSignal<string | null>(null);
  const [img2B64, setImg2B64] = createSignal<string | null>(null);
  let img1Req = 0, img2Req = 0;
  createEffect(async () => {
    const t = selTest1(); if (!t) { setImg1B64(null); return; }
    const my = ++img1Req; const b64 = await getTestImage({ testName: t }); if (my === img1Req) setImg1B64(b64);
  });
  createEffect(async () => {
    const t = selTest2(); if (!t) { setImg2B64(null); return; }
    const my = ++img2Req; const b64 = await getTestImage({ testName: t }); if (my === img2Req) setImg2B64(b64);
  });
  const imgUrl1 = () => img1B64() ? `data:image/png;base64,${img1B64()}` : null;
  const imgUrl2 = () => img2B64() ? `data:image/png;base64,${img2B64()}` : null;

  // Minimal local type for gaze points used here
  type GD = { gaze_x: number | null; gaze_y: number | null; box_name: string; timestamp: string };

  const leftGaze  = () => series1()?.gaze ?? [];
  const leftBase  = () => series1()?.baseMs ?? 0;
  const rightGaze = () => series2()?.gaze ?? [];
  const rightBase = () => series2()?.baseMs ?? 0;

  const replayPts1 = () => leftGaze()
    .filter((g: GD) => g.gaze_x !== null && g.gaze_y !== null && g.box_name !== "missing" && g.box_name !== "out_of_screen")
    .map((g: GD) => ({ t: (+new Date(g.timestamp) - leftBase()) / 1000, x: g.gaze_x as number, y: g.gaze_y as number }));
  const replayPts2 = () => rightGaze()
    .filter((g: GD) => g.gaze_x !== null && g.gaze_y !== null && g.box_name !== "missing" && g.box_name !== "out_of_screen")
    .map((g: GD) => ({ t: (+new Date(g.timestamp) - rightBase()) / 1000, x: g.gaze_x as number, y: g.gaze_y as number }));

  let canvas1El: HTMLCanvasElement | null = null;
  let canvas2El: HTMLCanvasElement | null = null;
  let img1El: HTMLImageElement | null = null;
  let img2El: HTMLImageElement | null = null;

  function drawFrameGeneric(sec: number, canvasEl: HTMLCanvasElement | null, imgEl: HTMLImageElement | null, pts: {t:number;x:number;y:number}[], durationSec: number) {
    if (!canvasEl || !imgEl) return;
    const ctx = canvasEl.getContext("2d")!; ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    const scaleX = canvasEl.width  / 1920; const scaleY = canvasEl.height / 1080;
    for (const pnt of pts) {
      if (pnt.t > sec) break;
      const frac = durationSec ? pnt.t / durationSec : 0;
      ctx.beginPath(); ctx.arc(pnt.x * scaleX, pnt.y * scaleY, 4, 0, Math.PI * 2);
      ctx.fillStyle = timeColor(frac); ctx.fill();
    }
  }
  const drawFrameLeft  = (sec: number) => drawFrameGeneric(sec, canvas1El, img1El, replayPts1(), p.duration());
  const drawFrameRight = (sec: number) => drawFrameGeneric(sec, canvas2El, img2El, replayPts2(), p.duration());

  // repaint playhead + overlay
  createEffect(() => { const _ = p.playSec(); drawFrameLeft(_); drawFrameRight(_); });

  return (
    <Card>
      <CardHeader><CardTitle>Time-series Compare (with progressive draw & synced playback)</CardTitle></CardHeader>
      <CardContent class="space-y-4">
        {/* shared controls */}
        <div class="flex flex-wrap items-end gap-4">
          <label class="text-sm flex items-center gap-2">
            Bin size (ms):
            <NumberField value={binMs()} class="w-24">
              <NumberFieldInput min={1} max={2000} onInput={(e) => setBinMs(Math.max(1, +e.currentTarget.value || 1))} />
            </NumberField>
          </label>

          <label class="text-sm flex items-center gap-2">
            View width (s):
            <NumberField value={viewSec()} class="w-24">
              <NumberFieldInput min={1} max={600} onInput={(e) => { setAutoSyncView(false); setViewSec(Math.max(1, +e.currentTarget.value || 1)); }} />
            </NumberField>
          </label>

          <div class="flex items-center gap-1 text-xs">
            <span class="text-muted-foreground pr-1">Presets:</span>
            {[5, 10, 15, 30, 60, 120].map((s) => (
              <Button size="sm" variant={viewSec() === s ? "default" : "outline"} onClick={() => { setAutoSyncView(false); setViewSec(s); }}>
                {s}s
              </Button>
            ))}
          </div>

          <div class="flex items-center gap-2 ml-auto">
            <Button size="icon" onClick={p.isPlaying() ? p.pause : p.play} disabled={p.duration() <= 0}>
              {p.isPlaying() ? "❚❚" : "►"}
            </Button>
            <Button size="icon" variant="secondary" onClick={p.stop} disabled={p.duration() <= 0}>■</Button>
            <input type="range" min="0" max={p.duration()} step="0.01" value={p.playSec()}
                   class="w-48 accent-primary-500"
                   onInput={(e) => p.scrub(+e.currentTarget.value)} />
            <span class="text-xs tabular-nums">{p.playSec().toFixed(2)} / {p.duration().toFixed(2)} s</span>
          </div>
        </div>

        {/* selectors + charts + images */}
        <div class="grid gap-6 xl:grid-cols-2">
          {/* Left */}
          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Select value={selTest1()} onChange={(v) => { setSelTest1(v || ""); setSelTimeline1(""); setSelRecording1(""); }}
                      options={p.testNames} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                <SelectTrigger class="w-60"><SelectValue>{selTest1() || "Select test…"}</SelectValue></SelectTrigger>
                <SelectContent />
              </Select>

              <Select value={selPart1()} onChange={(v) => { setSelPart1(v || ""); setSelTimeline1(""); setSelRecording1(""); }}
                      options={p.participants} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                <SelectTrigger class="w-60"><SelectValue>{selPart1() || "Select participant…"}</SelectValue></SelectTrigger>
                <SelectContent />
              </Select>

              <Show when={combos1().length > 1}>
                <Select value={selTimeline1()} onChange={(v) => { setSelTimeline1(v || ""); setSelRecording1(""); }}
                        options={timelines1()} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-56"><SelectValue>{selTimeline1() || "Select timeline…"}</SelectValue></SelectTrigger>
                  <SelectContent />
                </Select>

                <Select value={selRecording1()} onChange={(v) => setSelRecording1(v || "")}
                        options={recOpts1()} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-56"><SelectValue>{selRecording1() || "Select recording…"}</SelectValue></SelectTrigger>
                  <SelectContent />
                </Select>
              </Show>
            </div>

            <Show when={hasSel1()} fallback={
              <div class="rounded border px-3 py-2 text-xs text-amber-700 bg-amber-50">Select <b>test</b> and <b>participant</b>.</div>
            }>
              <Show when={!needsChoice1()} fallback={
                <div class="rounded border px-3 py-2 text-xs text-amber-700 bg-amber-50">Multiple sessions found. Pick <b>timeline</b> and <b>recording</b>.</div>
              }>
                <>
                  <div class="h-[360px] rounded border">
                    <Show when={viz1().datasets.length} fallback={<div class="h-full grid place-items-center text-sm text-muted-foreground">No data</div>}>
                      <LineChart data={viz1()} options={compareOpts()} plugins={[RevealClipPlugin as any]} />
                    </Show>
                  </div>

                  {/* Stimulus + overlay */}
                  <StimulusPane
                    imgUrl={imgUrl1()}
                    currentWord={currentWord1()}
                    onImg={(img, cvs) => {
                      // wire refs
                      img1El = img; canvas1El = cvs;
                      if (!canvas1El || !img1El) return;
                      canvas1El.width = img1El.clientWidth; canvas1El.height = img1El.clientHeight;
                      drawFrameLeft(p.playSec());
                    }}
                  />
                </>
              </Show>
            </Show>
          </div>

          {/* Right */}
          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <Select value={selTest2()} onChange={(v) => { setSelTest2(v || ""); setSelTimeline2(""); setSelRecording2(""); }}
                      options={p.testNames} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                <SelectTrigger class="w-60"><SelectValue>{selTest2() || "Select test…"}</SelectValue></SelectTrigger>
                <SelectContent />
              </Select>

              <Select value={selPart2()} onChange={(v) => { setSelPart2(v || ""); setSelTimeline2(""); setSelRecording2(""); }}
                      options={p.participants} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                <SelectTrigger class="w-60"><SelectValue>{selPart2() || "Select participant…"}</SelectValue></SelectTrigger>
                <SelectContent />
              </Select>

              <Show when={combos2().length > 1}>
                <Select value={selTimeline2()} onChange={(v) => { setSelTimeline2(v || ""); setSelRecording2(""); }}
                        options={timelines2()} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-56"><SelectValue>{selTimeline2() || "Select timeline…"}</SelectValue></SelectTrigger>
                  <SelectContent />
                </Select>

                <Select value={selRecording2()} onChange={(v) => setSelRecording2(v || "")}
                        options={recOpts2()} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-56"><SelectValue>{selRecording2() || "Select recording…"}</SelectValue></SelectTrigger>
                  <SelectContent />
                </Select>
              </Show>
            </div>

            <Show when={hasSel2()} fallback={
              <div class="rounded border px-3 py-2 text-xs text-amber-700 bg-amber-50">Select <b>test</b> and <b>participant</b>.</div>
            }>
              <Show when={!needsChoice2()} fallback={
                <div class="rounded border px-3 py-2 text-xs text-amber-700 bg-amber-50">Multiple sessions found. Pick <b>timeline</b> and <b>recording</b>.</div>
              }>
                <>
                  <div class="h-[360px] rounded border">
                    <Show when={viz2().datasets.length} fallback={<div class="h-full grid place-items-center text-sm text-muted-foreground">No data</div>}>
                      <LineChart data={viz2()} options={compareOpts()} plugins={[RevealClipPlugin as any]} />
                    </Show>
                  </div>

                  <StimulusPane
                    imgUrl={imgUrl2()}
                    currentWord={currentWord2()}
                    onImg={(img, cvs) => {
                      img2El = img; canvas2El = cvs;
                      if (!canvas2El || !img2El) return;
                      canvas2El.width = img2El.clientWidth; canvas2El.height = img2El.clientHeight;
                      drawFrameRight(p.playSec());
                    }}
                  />
                </>
              </Show>
            </Show>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StimulusPane(props: { imgUrl: string | null; currentWord: string | null; onImg: (img: HTMLImageElement, canvas: HTMLCanvasElement) => void }) {
  return (
    <div class="rounded border p-3">
      <div class="text-xs text-muted-foreground mb-2">
        {props.currentWord ? <>Current word: <b>{props.currentWord}</b></> : "(select a test)"}
      </div>
      <Show when={props.imgUrl} fallback={<div class="h-[220px] grid place-items-center text-sm text-muted-foreground">No image</div>}>
        <div class="relative w-full flex justify-center">
          <img
            ref={el => props.onImg(el, (document.createElement("canvas") as HTMLCanvasElement))}
            src={props.imgUrl!}
            alt="stimulus"
            onLoad={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              // Find adjacent canvas (created above in ref call)
              const parent = img.parentElement!;
              let cvs = parent.querySelector("canvas") as HTMLCanvasElement | null;
              if (!cvs) {
                cvs = document.createElement("canvas");
                cvs.className = "absolute inset-0 pointer-events-none";
                parent.appendChild(cvs);
              }
              props.onImg(img, cvs);
            }}
            class="max-h[240px] max-w-full object-contain rounded-md border"
          />
          <canvas class="absolute inset-0 pointer-events-none" />
        </div>
        <div class="flex items-center gap-2 justify-center mt-2">
          <span class="text-[10px] text-muted-foreground">old</span>
          <div class="h-2 w-28 rounded-full" style="background: linear-gradient(to right, hsl(220 100% 50%), hsl(0 100% 50%))" />
          <span class="text-[10px] text-muted-foreground">new</span>
        </div>
      </Show>
    </div>
  );
}
