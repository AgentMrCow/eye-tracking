import { createMemo, createSignal, Show } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import ControlsBar from "./ControlsBar";
import TimelineChart from "./TimelineChart";
import AoiSetChart from "./AoiSetChart";
import StimulusReplay from "./StimulusReplay";
import PieAndStats from "./PieAndStats";
import WindowsTable from "./WindowsTable";
import GazePath from "./GazePath";

import { useGazeQuery } from "../hooks/useGazeQuery";
import { useReplay } from "../hooks/useReplay";
import type { MetaKey } from "../types";

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
    const row = Q.selectedTest() ? Q.selectedTest()!.value : null;
    const cat = row ? Q.metaBoxSets() : null;
    return {
      correct_AOIs:             cat ? cat.correct_AOIs.size : 0,
      potentially_correct_AOIs: cat ? cat.potentially_correct_AOIs.size : 0,
      incorrect_AOIs:           cat ? cat.incorrect_AOIs.size : 0,
      correct_NULL:             cat ? cat.correct_NULL.size : 0,
      potentially_correct_NULL: cat ? cat.potentially_correct_NULL.size : 0,
      incorrect_NULL:           cat ? cat.incorrect_NULL.size : 0,
    };
  });

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
        tests={Q.filteredTests()} selectedTest={Q.selectedTest()?.value ?? null}
        setSelectedTestValue={(v) => Q.setSelectedTest(v ? { label: v, value: v } : null)}
        participants={Q.participants().map(p => p.value)} selectedPart={Q.selectedPart()?.value ?? null}
        setSelectedPartValue={(v) => Q.setSelectedPart(Q.participants().find(o => o.value === v) ?? null)}
        timelineOptions={Q.timelineOptions()} recordingOptions={Q.recordingOptions()}
        selectedTimeline={Q.selectedTimeline()} setSelectedTimeline={Q.setSelectedTimeline}
        selectedRecording={Q.selectedRecording()} setSelectedRecording={Q.setSelectedRecording}
        intervalMs={Q.intervalMs()} setIntervalMs={Q.setIntervalMs}
        pxPerSec={Q.pxPerSec()} setPxPerSec={Q.setPxPerSec}
        spanSec={Q.spanSec()} setSpanSec={Q.setSpanSec}
        viewSec={Q.viewSec()} setViewSec={Q.setViewSec}
        minValidPct={Q.minValidPct()} setMinValidPct={Q.setMinValidPct}
        reset={Q.reset}
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
              <TimelineChart
                rows={Q.rows() as any}
                baseMs={Q.baseMs()}
                viewSec={Q.viewSec()}
                wordWin={Q.wordWin()}
                selectedBoxes={Q.selectedBoxes() as any}
                colorMap={Q.colorMap()}
                toggleMeta={Q.toggleMeta}
                activeMetaFilters={Q.activeMetaFilters()}
                testHasSetSizes={testHasSetSizes()}
              />
            </CardContent>
          </Card>

          {/* AOI sets */}
          <Card class="xl:col-span-2">
            <CardHeader><CardTitle>AOI Sets Over Time</CardTitle></CardHeader>
            <CardContent>
              <AoiSetChart
                rows={Q.rows() as any}
                baseMs={Q.baseMs()}
                viewSec={Q.viewSec()}
                sets={Q.metaBoxSets() as any}
              />
            </CardContent>
          </Card>

          {/* stimulus + replay */}
          <Card>
            <CardHeader><CardTitle>Stimulus Image</CardTitle></CardHeader>
            <CardContent>
              <StimulusReplay
                imgUrl={Q.testImgB64() ? `data:image/png;base64,${Q.testImgB64()}` : null}
                onReadyImage={(img, cvs) => { setImgEl(img); setCanvasEl(cvs); RP.drawFrame(0); }}
                isPlaying={RP.isPlaying()} play={RP.play} pause={RP.pause} stop={RP.stop}
                duration={RP.duration()} curTime={RP.curTime()} scrub={RP.scrub} ready={RP.ready()}
                currentWord={currentWord()} winPctValid={RP.winPctValid()}
              />
            </CardContent>
          </Card>

          {/* pie + stats */}
          <PieAndStats boxStats={Q.boxStats()} colorMap={Q.colorMap()} statsWhole={Q.statsWhole()} />

          {/* windows */}
          <WindowsTable wordWin={Q.wordWin()} />

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
