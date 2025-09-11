import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isLoading } from "@/shared/loading";

import ControlsBar from "./ControlsBar";
import TimelineChart from "./TimelineChart";
import AoiSetChart from "./AoiSetChart";
import StimulusReplay from "./StimulusReplay";
import PieAndStats from "./PieAndStats";
import JsonViewer from "@/components/ui/json-viewer";
import WindowsTable from "./WindowsTable";
import GazePath from "./GazePath";

import { useGazeQuery } from "../hooks/useGazeQuery";
import { useReplay } from "../hooks/useReplay";
import type { MetaKey } from "../types";
import { parseAOISet } from "../utils";
import { DEFAULT_COLORS } from "../constants";
import type { BoxTypes } from "../types";

export default function GazeAnalysis() {
  const Q = useGazeQuery();

  // image/canvas refs for replay
  const [imgEl, setImgEl] = createSignal<HTMLImageElement | null>(null);
  const [canvasEl, setCanvasEl] = createSignal<HTMLCanvasElement | null>(null);

  const RP = useReplay(() => ({
    gaze: Q.gaze(),
    baseMs: Q.baseMs(),
    wordWin: Q.wordWin(),
    imgEl: imgEl(),
    canvasEl: canvasEl(),
  }));

  const currentWord = createMemo(() => {
    const t = RP.curTime();
    const w = Q.wordWin().find(w => t >= w.start_sec && t <= w.end_sec);
    return w?.chinese_word ?? null;
  });

  const testHasSetSizes = createMemo<Record<MetaKey, number>>(() => {
    const row = Q.catalogRowForSelectedTest();
    const primary = row ? {
      self_AOIs:                parseAOISet((row as any)?.self_AOIs).length,
      correct_AOIs:             parseAOISet(row.correct_AOIs).length,
      potentially_correct_AOIs: parseAOISet(row.potentially_correct_AOIs).length,
      incorrect_AOIs:           parseAOISet(row.incorrect_AOIs).length,
      correct_NULL:             parseAOISet(row.correct_NULL).length,
      potentially_correct_NULL: parseAOISet(row.potentially_correct_NULL).length,
      incorrect_NULL:           parseAOISet(row.incorrect_NULL).length,
    } as Record<MetaKey, number> : null;

    // Fallback to runtime metaBoxSets if catalog row wasn?雓?found yet
    if (!primary) {
      const s = Q.metaBoxSets() as any;
      return {
        self_AOIs:                s.self_AOIs?.size ?? 0,
        correct_AOIs:             s.correct_AOIs?.size ?? 0,
        potentially_correct_AOIs: s.potentially_correct_AOIs?.size ?? 0,
        incorrect_AOIs:           s.incorrect_AOIs?.size ?? 0,
        correct_NULL:             s.correct_NULL?.size ?? 0,
        potentially_correct_NULL: s.potentially_correct_NULL?.size ?? 0,
        incorrect_NULL:           s.incorrect_NULL?.size ?? 0,
      };
    }
    return primary;
  });
  const hasAnyAoiSet = createMemo(() => {
    const m = testHasSetSizes();
    return m.self_AOIs + m.correct_AOIs + m.potentially_correct_AOIs + m.incorrect_AOIs + m.correct_NULL + m.potentially_correct_NULL + m.incorrect_NULL > 0;
  });

  // If sets exist but rows aggregate to zero across all time, show a helpful hint
  const hasAnyAoiValue = createMemo(() => {
    if (!hasAnyAoiSet()) return false;
    const rows = Q.rows() as any[];
    if (!rows.length) return false;
    const sets = Q.metaBoxSets() as Record<string, Set<string>>;
    const groups: string[][] = [
      ...(sets.self_AOIs?.size ? [Array.from(sets.self_AOIs) as string[]] : []),
      ...(sets.correct_AOIs?.size ? [Array.from(sets.correct_AOIs) as string[]] : []),
      ...(sets.potentially_correct_AOIs?.size ? [Array.from(sets.potentially_correct_AOIs) as string[]] : []),
      ...(sets.incorrect_AOIs?.size ? [Array.from(sets.incorrect_AOIs) as string[]] : []),
      ...(sets.correct_NULL?.size ? [Array.from(sets.correct_NULL) as string[]] : []),
      ...(sets.potentially_correct_NULL?.size ? [Array.from(sets.potentially_correct_NULL) as string[]] : []),
      ...(sets.incorrect_NULL?.size ? [Array.from(sets.incorrect_NULL) as string[]] : []),
    ];
    for (const r of rows) {
      for (const g of groups) {
        let sum = 0; for (const b of g) sum += r[b] || 0;
        if (sum > 0) return true;
      }
    }
    return false;
  });

  // ==== AOI Debugging Aids ====
  const [showAoiDebug, setShowAoiDebug] = createSignal(false);
  const aoiDebug = createMemo(() => {
    const row = Q.catalogRowForSelectedTest();
    const selTest = Q.selectedTest()?.value ?? null;
    const gazeArr: any[] = Q.gaze();
    const fallbackTest = gazeArr.length ? (gazeArr[0] as any).test_name ?? null : null;
    const sizes = testHasSetSizes();
    const msets: any = Q.metaBoxSets();
    return {
      selectedTest: selTest,
      fallbackTest,
      catalogRowFound: !!row,
      catalogAOIs: row ? {
        self_AOIs: (row as any).self_AOIs ?? null,
        correct_AOIs: row.correct_AOIs ?? null,
        potentially_correct_AOIs: row.potentially_correct_AOIs ?? null,
        incorrect_AOIs: row.incorrect_AOIs ?? null,
        correct_NULL: row.correct_NULL ?? null,
        potentially_correct_NULL: row.potentially_correct_NULL ?? null,
        incorrect_NULL: row.incorrect_NULL ?? null,
      } : null,
      parsedSizes: sizes,
      metaBoxSetsSizes: {
        self_AOIs:                msets?.self_AOIs?.size ?? 0,
        correct_AOIs:             msets?.correct_AOIs?.size ?? 0,
        potentially_correct_AOIs: msets?.potentially_correct_AOIs?.size ?? 0,
        incorrect_AOIs:           msets?.incorrect_AOIs?.size ?? 0,
        correct_NULL:             msets?.correct_NULL?.size ?? 0,
        potentially_correct_NULL: msets?.potentially_correct_NULL?.size ?? 0,
        incorrect_NULL:           msets?.incorrect_NULL?.size ?? 0,
      },
      needsChoice: Q.needsChoice(),
      pairs: Q.pairs?.() ?? [],
      selectedTimeline: Q.selectedTimeline(),
      selectedRecording: Q.selectedRecording(),
    };
  });

  // Console logging for deep inspection
  createEffect(() => {
    const d = aoiDebug();
    // eslint-disable-next-line no-console
    console.debug("[AOI] debug:", d);
  });

  // validity counts for formulas
  const validityCounts = createMemo(() => {
    const arr = Q.gaze();
    const total = arr.length;
    const missing = arr.filter(g => g.box_name === 'missing').length;
    const out_of_screen = arr.filter(g => g.box_name === 'out_of_screen').length;
    const inAoi = arr.filter(g => !['missing','out_of_screen','other'].includes(g.box_name)).length;
    return { total, missing, out_of_screen, inAoi };
  });

  // Build a copy of the Timeline dataset for JSON viewing (mirrors TimelineChart)
  const timelineDataset = createMemo(() => {
    const dat = Q.rows().map(r => ({ t: (+new Date(r.timestamp) - Q.baseMs()) / 1000, ...r }));
    const keys = Object.keys(DEFAULT_COLORS) as BoxTypes[];
    const ds = keys.map((b: BoxTypes) => {
      const sel = Q.selectedBoxes();
      const hide = sel.size ? !sel.has(b as string) : false;
      return {
        label: b as string,
        data: dat.map((r: any) => ({ x: r.t, y: r[b as string] || 0 })),
        borderColor: (Q.colorMap()[b] || DEFAULT_COLORS[b]) as string,
        hidden: hide,
      };
    });
    const windows = Q.wordWin().flatMap((w, i) => [
      { label: `${w.chinese_word} (start)`, data: [{ x: w.start_sec, y: 0 }, { x: w.start_sec, y: 100 }], _window: true },
      { label: `${w.chinese_word} (end)`,   data: [{ x: w.end_sec,   y: 0 }, { x: w.end_sec,   y: 100 }], _window: true },
    ]);
    return { datasets: [...ds, ...windows] };
  });

  // Use constrained lists directly so UI reflects actual state

  return (
    <div class="space-y-6">
      {/* Controls */}
      <ControlsBar
        truths={Q.truths()} morphs={Q.morphs()} poss={Q.poss()} series={Q.series()} groups={Q.groups()}
        truthF={Q.truthF()} setTruthF={Q.setTruthF}
        morphF={Q.morphF()} setMorphemeF={Q.setMorphemeF}
        posF={Q.posF()} setPosF={Q.setPosF}
        seriesF={Q.seriesF()} setSeriesF={Q.setSeriesF}
        groupF={Q.groupF()} setGroupF={Q.setGroupF}
        tests={Q.filteredTests()} selectedTest={Q.selectedTest()?.value ?? ""}
        setSelectedTestValue={(v) => {
          Q.setSelectedTimeline(null);
          Q.setSelectedRecording(null);
          Q.setSelectedTest(v ? { label: v, value: v } : null);
        }}
        participants={Q.participantsFiltered()} selectedPart={Q.selectedPart()?.value ?? ""}
        setSelectedPartValue={(v) => {
          // Clear dependent selections immediately when participant changes
          Q.setSelectedTimeline(null);
          Q.setSelectedRecording(null);
          Q.setSelectedPart(Q.participants().find(o => o.value === v) ?? null);
        }}
        timelineOptions={Q.timelineOptions()} recordingOptions={Q.recordingOptions()}
        selectedTimeline={Q.selectedTimeline()} setSelectedTimeline={Q.setSelectedTimeline}
        selectedRecording={Q.selectedRecording()} setSelectedRecording={Q.setSelectedRecording}
        intervalMs={Q.intervalMs()} setIntervalMs={Q.setIntervalMs}
        pxPerSec={Q.pxPerSec()} setPxPerSec={Q.setPxPerSec}
        spanSec={Q.spanSec()} setSpanSec={Q.setSpanSec}
        viewSec={Q.viewSec()} setViewSec={(n) => { Q.disableAutoView(); Q.setViewSec(n); }}
        minValidPct={Q.minValidPct()} setMinValidPct={Q.setMinValidPct}
        reset={Q.reset}
        clearSelections={Q.clearSelections}
      />

      {/* status bar */}
      <Show when={Q.selectedTest() && (Q.recordingName() || Q.selectedTimeline())}>
        <div class="text-xs text-muted-foreground">
          {Q.selectedTimeline() && <>Timeline: <span class="font-medium">{Q.selectedTimeline()}</span></>}
          {Q.recordingName() && <> · Recording: <span class="font-medium">{Q.recordingName()}</span></>}
          {Q.recordingPct() !== null && <> · valid {Q.recordingPct()}%</>}
          {Q.blockedByQuality() &&
            <span class="ml-2 px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">
              filtered by threshold {Q.minValidPct()}%
            </span>}
          {/* durations summary */}
          {(Q.rawDurationSec() > 0 || Q.binnedDurationSec() > 0) && (
            <>
              {' '}· dur raw {Q.rawDurationSec().toFixed(3)}s, binned {Q.binnedDurationSec().toFixed(3)}s, view {Q.viewSec().toFixed(3)}s
            </>
          )}
        </div>
      </Show>

      {/* multi-session guard */}
      <Show when={!Q.needsChoice()} fallback={
        <div class="p-3 rounded bg-yellow-50 text-yellow-800 text-sm">
          Multiple sessions found for this test and participant.<br />
          Please choose a <b>timeline</b> and <b>recording</b> above before rendering.
        </div>
      }>

        {/* charts grid */}
        <div class="grid gap-6 xl:grid-cols-2">

          {/* per-AOI timeline */}
          <Card class="xl:col-span-2">
            <CardHeader><CardTitle>Gaze Distribution Over Time</CardTitle></CardHeader>
            <CardContent>
              <div class="flex items-center justify-between mb-2">
                <div class="text-xs text-muted-foreground">
                  AOI sets: s:{testHasSetSizes().self_AOIs} c:{testHasSetSizes().correct_AOIs} pc:{testHasSetSizes().potentially_correct_AOIs} i:{testHasSetSizes().incorrect_AOIs} cN:{testHasSetSizes().correct_NULL} pcN:{testHasSetSizes().potentially_correct_NULL} iN:{testHasSetSizes().incorrect_NULL}
                </div>
                <button class="text-xs px-2 py-0.5 border rounded" onClick={() => setShowAoiDebug(!showAoiDebug())}>
                  {showAoiDebug() ? 'Hide AOI debug' : 'Show AOI debug'}
                </button>
              </div>
              <Show when={!isLoading()} fallback={<div class="h-[500px]"><Skeleton class="w-full h-full" /></div>}>
                <TimelineChart
                  rows={Q.rows() as any}
                  baseMs={Q.baseMs()}
                  viewSec={Q.viewSec()}
                  wordWin={Q.wordWin()}
                  selectedBoxes={() => Q.selectedBoxes() as any}
                  colorMap={() => Q.colorMap()}
                  toggleMeta={Q.toggleMeta}
                  activeMetaFilters={() => Q.activeMetaFilters()}
                  testHasSetSizes={() => testHasSetSizes()}
                  aoiRow={Q.catalogRowForSelectedTest() as any}
                />
              </Show>
              <Show when={showAoiDebug()}>
                <div class="mt-2">
                  <JsonViewer title="AOI debug (inputs and sizes)" data={aoiDebug()} getExplanation={(d) =>
                    'This JSON shows current selections, catalog AOIs, parsed sizes, and session choices used to build charts.'} />
                </div>
              </Show>
              <div class="mt-2">
                <JsonViewer title="Timeline chart dataset" data={timelineDataset()} getExplanation={() =>
                  'Chart.js dataset for the timeline: per-box % over time plus vertical word window markers.'} />
              </div>
            </CardContent>
          </Card>

          {/* AOI sets */}
          <Card class="xl:col-span-2">
            <CardHeader><CardTitle>AOI Sets Over Time</CardTitle></CardHeader>
            <CardContent>
              <Show when={hasAnyAoiSet()} fallback={<div class="text-sm text-muted-foreground">No AOI sets defined for this test in catalog.</div>}>
                <Show when={hasAnyAoiValue()} fallback={<div class="text-sm text-muted-foreground">No gaze fell into any AOI sets in current view.</div>}>
                  <Show when={!isLoading()} fallback={<div class="h-[400px]"><Skeleton class="w-full h-full" /></div>}>
                    <AoiSetChart
                      rows={Q.rows() as any}
                      baseMs={Q.baseMs()}
                      viewSec={Q.viewSec()}
                      sets={Q.metaBoxSets() as any}
                    />
                  </Show>
                </Show>
              </Show>
            </CardContent>
          </Card>

          {/* Self AOIs (codes) */}
          <Card class="xl:col-span-2">
            <CardHeader><CardTitle>Self AOIs</CardTitle></CardHeader>
            <CardContent>
              <Show when={Q.catalogRowForSelectedTest()} fallback={<div class="text-sm text-muted-foreground">Select a test to view self AOIs.</div>}>
                {(() => {
                  const row: any = Q.catalogRowForSelectedTest();
                  const codes = (row?.self_AOIs || "").toString().replace(/，/g, ",").split(/[,\s]+/).map((t: string) => t.trim()).filter(Boolean);
                  return (
                    <div class="flex flex-wrap gap-2 text-xs">
                      {codes.length ? codes.map((c: string) => <span class="px-2 py-0.5 rounded border bg-muted">{c}</span>) : <span class="text-muted-foreground">None</span>}
                    </div>
                  );
                })()}
              </Show>
            </CardContent>
          </Card>

          {/* stimulus + replay */}
          <Card>
            <CardHeader><CardTitle>Stimulus Image</CardTitle></CardHeader>
            <CardContent>
              <StimulusReplay
                imgUrl={Q.testImgB64() ? `data:image/png;base64,${Q.testImgB64()}` : null}
                onReadyImage={(img, cvs) => {
                  setImgEl(img); setCanvasEl(cvs);
                  // Jump to first non-missing point if available for better visibility
                  const g = Q.gaze();
                  const base = Q.baseMs();
                  let t0 = 0;
                  for (const d of g) {
                    if (d.box_name !== 'missing' && d.box_name !== 'out_of_screen' && d.gaze_x !== null && d.gaze_y !== null) {
                      t0 = Math.max(0, (+new Date(d.timestamp) - base) / 1000);
                      break;
                    }
                  }
                  RP.drawFrame(t0);
                }}
                isPlaying={RP.isPlaying()} play={RP.play} pause={RP.pause} stop={RP.stop}
                duration={RP.duration()} curTime={RP.curTime()} scrub={RP.scrub} ready={RP.ready()}
                currentWord={currentWord()} winPctValid={RP.winPctValid()}
              />
            </CardContent>
          </Card>

          {/* pie + stats */}
          <PieAndStats boxStats={Q.boxStats()} colorMap={Q.colorMap()} statsWhole={Q.statsWhole()} validityCounts={validityCounts()} />

          {/* windows */}
          <WindowsTable wordWin={Q.wordWin()} />

          {/* raw time bins viewer for reproducibility */}
          <Card class="xl:col-span-2">
            <CardHeader><CardTitle>Time Bins (per 100ms by default)</CardTitle></CardHeader>
            <CardContent>
              <JsonViewer title="Rows used for charts" data={Q.rows()} getExplanation={() =>
                'Each row is a time bin with percentage of gaze by box_name. These are fed to timeline and AOI-set charts.'} />
            </CardContent>
          </Card>

          {/* path */}
          <Card>
            <CardHeader><CardTitle>Gaze Path</CardTitle></CardHeader>
            <CardContent>
              <GazePath gaze={Q.gaze()} />
            </CardContent>
          </Card>
        </div>
      </Show>
    </div>
  );
}


