import { createEffect, createMemo, createSignal, onMount } from "solid-js";
import type { BoxTypes, GazeData, TLRec, WordWindow } from "../types";
import { getAllCatalog as getCatalog, getGazeData, getParticipants, getTimelineRecordings, getTestImage, getWordWindows } from "../services/gazeApi";
import { usePlayback } from "../../catalog/hooks/usePlayback";
import { useSeries } from "../../catalog/hooks/useSeries";

/**
 * Single-panel gaze explorer state:
 * - test/participant/session selection
 * - image + word windows
 * - time-series + progressive playback
 */
export function useGazeState() {
  // options
  const [tests, setTests] = createSignal<string[]>([]);
  const [participants, setParticipants] = createSignal<string[]>([]);

  // selections
  const [selTest, setSelTest] = createSignal<string>("");
  const [selPart, setSelPart] = createSignal<string>("");

  const [combos, setCombos] = createSignal<TLRec[]>([]);
  const timelines = createMemo(() => Array.from(new Set(combos().map((c) => c.timeline))));
  const recOpts   = createMemo(() => combos().filter((c) => c.timeline === selTimeline()).map((c) => c.recording));
  const [selTimeline, setSelTimeline]   = createSignal<string>("");
  const [selRecording, setSelRecording] = createSignal<string>("");

  // defaults for blue/red/invalid (works out of the box)
  const [invalidCats, setInvalidCats] = createSignal<("other" | "missing" | "out_of_screen")[]>(["missing", "out_of_screen"]);
  const allAnimal: BoxTypes[] = ["Animal 1", "Animal 2", "Animal 3"];
  const allObjects: BoxTypes[] = [
    "Object 1 for Animal 1","Object 2 for Animal 1",
    "Object 1 for Animal 2","Object 2 for Animal 2",
    "Object 1 for Animal 3","Object 2 for Animal 3",
  ];
  const blueSet = createMemo(() => new Set<BoxTypes>(allAnimal));
  const redSet  = createMemo(() => new Set<BoxTypes>(allObjects));

  // playback
  const pb = usePlayback();
  const [binMs, setBinMs] = createSignal(100);
  const [viewSec, setViewSec] = createSignal(15);

  // word windows + stimulus image
  const [ww, setWw] = createSignal<WordWindow[]>([]);
  const [imgB64, setImgB64] = createSignal<string | null>(null);
  const imgUrl = createMemo(() => (imgB64() ? `data:image/png;base64,${imgB64()}` : null));

  // initial data
  onMount(async () => {
    const cat = await getCatalog();
    setTests(Array.from(new Set(cat.map((r) => r.test_name))).sort());
    setParticipants(await getParticipants());
  });

  // fetch sessions for current selection
  createEffect(async () => {
    const t = selTest(), p = selPart();
    if (!t || !p) { setCombos([]); setSelTimeline(""); setSelRecording(""); return; }
    const list = await getTimelineRecordings({ testName: t, participants: [p] });
    setCombos(list);
  });

  // keep chosen session valid
  createEffect(() => {
    const cmb = combos(); const tset = new Set(cmb.map(c => c.timeline));
    if (!tset.has(selTimeline())) setSelTimeline(cmb.length === 1 ? cmb[0].timeline : "");
    const recs = cmb.filter(c => c.timeline === selTimeline());
    const rset = new Set(recs.map(c => c.recording));
    if (!rset.has(selRecording())) setSelRecording(recs.length === 1 ? recs[0].recording : "");
  });

  // windows + image (by test)
  createEffect(async () => {
    const t = selTest();
    if (!t) { setWw([]); setImgB64(null); return; }
    const [win, img] = await Promise.all([
      getWordWindows({ testName: t }).catch(() => []),
      getTestImage({ testName: t }).catch(() => null),
    ]);
    setWw(win);
    setImgB64(img);
  });

  // build series (reuses the catalog hook)
  const series = useSeries(() => ({
    testName: selTest() || null,
    participant: selPart() || null,
    binMs: binMs(),
    invalidCats: invalidCats(),
    blue: blueSet(),
    red: redSet(),
    timeline: selTimeline() || undefined,
    recording: selRecording() || undefined,
  }));

  // sync duration to series max
  createEffect(() => {
    const d = series()?.xMax ?? 0;
    pb.setDuration(d);
    if (pb.playSec() > d) pb.setPlaySec(d);
  });

  const currentWord = createMemo(() => {
    const t = pb.playSec();
    const w = ww().find((w) => t >= w.start_sec && t <= w.end_sec);
    return w?.chinese_word ?? null;
  });

  return {
    // options
    tests, participants,

    // selections
    selTest, setSelTest,
    selPart, setSelPart,
    timelines, recOpts, selTimeline, setSelTimeline, selRecording, setSelRecording,

    // invalid + sets
    invalidCats, setInvalidCats, blueSet, redSet,

    // series + view
    series, binMs, setBinMs, viewSec, setViewSec,

    // media
    ww, currentWord, imgUrl,

    // playback
    pb,
  };
}
