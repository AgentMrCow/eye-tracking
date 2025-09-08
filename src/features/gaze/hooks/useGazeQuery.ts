import { createEffect, createMemo, createSignal } from "solid-js";
import type {
  CatalogRow, GazeData, MetaKey, SelectOption, TestMeta, TLRec, WordWindow
} from "../types";
import {
  getAllCatalog, getAllRecordings, getAllTestMeta, getAoiMap, getBoxStats, getGazeData,
  getParticipants, getTestImage, getTestNames, getTimelineRecordings, getWordWindows
} from "../services/gazeApi";
import { DEFAULT_COLORS } from "../constants";
import { calcWholeStats, parseAOISet, parsePercent } from "../utils";

type RecordingIndex = Record<string, number>; // recording -> valid%

export function useGazeQuery() {
  /* selections */
  const [selectedTest, setSelectedTest] = createSignal<SelectOption | null>(null);
  const [selectedPart, setSelectedPart] = createSignal<SelectOption | null>(null);

  /* sessions */
  const [pairs, setPairs] = createSignal<TLRec[]>([]);
  const [timelineOptions, setTimelineOptions] = createSignal<string[]>([]);
  const [recordingOptions, setRecordingOptions] = createSignal<string[]>([]);
  const [selectedTimeline, setSelectedTimeline] = createSignal<string | null>(null);
  const [selectedRecording, setSelectedRecording] = createSignal<string | null>(null);

  /* lists */
  const [tests, setTests] = createSignal<SelectOption[]>([]);
  const [participants, setParticipants] = createSignal<SelectOption[]>([]);

  /* meta & catalog */
  const [allMeta, setAllMeta] = createSignal<TestMeta[]>([]);
  const [truths, setTruths] = createSignal<string[]>([]);
  const [morphs, setMorphs] = createSignal<string[]>([]);
  const [poss, setPoss] = createSignal<string[]>([]);
  const [series, setSeries] = createSignal<string[]>([]);
  const [catalog, setCatalog] = createSignal<CatalogRow[]>([]);
  const catalogByTest = createMemo(() => new Map(catalog().map(r => [r.test_name, r])));
  const [groups, setGroups] = createSignal<string[]>([]);

  /* filters */
  const [truthF, setTruthF] = createSignal("all");
  const [morphF, setMorphemeF] = createSignal("all");
  const [posF, setPosF] = createSignal("all");
  const [seriesF, setSeriesF] = createSignal("all");
  const [groupF, setGroupF] = createSignal("all");

  /* AOI-set toggles */
  const [activeMetaFilters, setActiveMetaFilters] = createSignal<Set<MetaKey>>(new Set());
  function toggleMeta(k: MetaKey) {
    const s = new Set(activeMetaFilters());
    s.has(k) ? s.delete(k) : s.add(k);
    setActiveMetaFilters(s);
  }

  /* AOI sets per selected test */
  const metaBoxSets = createMemo(() => {
    const row = selectedTest() ? catalogByTest().get(selectedTest()!.value) : undefined;
    return {
      correct_AOIs:             new Set(parseAOISet(row?.correct_AOIs)),
      potentially_correct_AOIs: new Set(parseAOISet(row?.potentially_correct_AOIs)),
      incorrect_AOIs:           new Set(parseAOISet(row?.incorrect_AOIs)),
      correct_NULL:             new Set(parseAOISet(row?.correct_NULL)),
      potentially_correct_NULL: new Set(parseAOISet(row?.potentially_correct_NULL)),
      incorrect_NULL:           new Set(parseAOISet(row?.incorrect_NULL)),
    };
  });

  const selectedBoxes = createMemo<Set<string>>(() => {
    const row = selectedTest() ? catalogByTest().get(selectedTest()!.value) : undefined;
    if (!row) return new Set();
    const sel = activeMetaFilters();
    if (sel.size === 0) return new Set(); // show all
    const out = new Set<string>();
    const add = (codes?: string | null) => parseAOISet(codes).forEach(b => out.add(b));
    if (sel.has("correct_AOIs"))             add(row.correct_AOIs);
    if (sel.has("potentially_correct_AOIs")) add(row.potentially_correct_AOIs);
    if (sel.has("incorrect_AOIs"))           add(row.incorrect_AOIs);
    if (sel.has("correct_NULL"))             add(row.correct_NULL);
    if (sel.has("potentially_correct_NULL")) add(row.potentially_correct_NULL);
    if (sel.has("incorrect_NULL"))           add(row.incorrect_NULL);
    return out;
  });

  /* recording quality threshold */
  const [minValidPct, setMinValidPct] = createSignal(0);
  const [recIndex, setRecIndex] = createSignal<RecordingIndex>({});
  const [recordingPct, setRecordingPct] = createSignal<number | null>(null);
  const [recordingName, setRecordingName] = createSignal<string | null>(null);
  const [blockedByQuality, setBlockedByQuality] = createSignal(false);

  /* data */
  const [gaze, setGaze] = createSignal<GazeData[]>([]);
  const [boxStats, setBoxStats] = createSignal<Record<string, number>>({});
  const [statsWhole, setStatsWhole] = createSignal({
    pct_including_missing: 0,
    pct_excluding_missing: 0,
    pct_excluding_missing_oob: 0,
  });

  /* word windows + image + colors */
  const [wordWin, setWordWin] = createSignal<WordWindow[]>([]);
  const [testImgB64, setTestImgB64] = createSignal<string | null>(null);
  const [colorMap, setColorMap] = createSignal(DEFAULT_COLORS);

  /* rows (time bins) */
  const [intervalMs, setIntervalMs] = createSignal(100);
  const [rows, setRows] = createSignal<any[]>([]);
  const baseMs = () => (gaze().length ? +new Date(gaze()[0].timestamp) : 0);

  /* view config */
  const [pxPerSec, setPxPerSec] = createSignal(40);
  const [spanSec, setSpanSec] = createSignal(15);
  const [viewSec, setViewSec] = createSignal(15);

  /* lists bootstrap */
  createEffect(async () => {
    setTests((await getTestNames()).map(t => ({ label: t, value: t })));
    setParticipants((await getParticipants()).map(p => ({ label: p, value: p })));
    const meta = await getAllTestMeta();
    setAllMeta(meta);
    setTruths(Array.from(new Set(meta.map(m => m.truth_value).filter(Boolean))) as string[]);
    setMorphs(Array.from(new Set(meta.map(m => m.morpheme).filter(Boolean))) as string[]);
    setPoss(Array.from(new Set(meta.map(m => m.only_position).filter(Boolean))) as string[]);
    setSeries(Array.from(new Set(meta.map(m => m.series).filter(Boolean))) as string[]);
    const rows = await getAllCatalog();
    setCatalog(rows);
    setGroups(Array.from(new Set(rows.map(r => r.group).filter(Boolean))) as string[]);
    const recs = await getAllRecordings();
    const idx: RecordingIndex = {};
    recs.forEach(r => {
      const v = parsePercent(r.gaze_samples);
      if (v !== null) idx[r.recording] = v;
    });
    setRecIndex(idx);
  });

  /* filtered tests */
  const filteredTests = createMemo(() => {
    const byName = catalogByTest();
    return allMeta()
      .filter(m => truthF() === "all" || m.truth_value === truthF())
      .filter(m => morphF() === "all" || m.morpheme === morphF())
      .filter(m => posF() === "all" || m.only_position === posF())
      .filter(m => seriesF() === "all" || m.series === seriesF())
      .filter(m => groupF() === "all" ? true : byName.get(m.test_name)?.group === groupF())
      .map(m => m.test_name);
  });

  /* AOI color overrides */
  createEffect(async () => {
    if (!selectedTest()) return;
    const rows = await getAoiMap(selectedTest()!.value).catch(() => []);
    const m = { ...DEFAULT_COLORS };
    rows.forEach(r => {
      if (r.rgb_hex) {
        const id = r.region_id as keyof typeof DEFAULT_COLORS;
        if (id in m) m[id] = `#${r.rgb_hex}`;
      }
    });
    setColorMap(m);
  });

  /* sessions for selection */
  createEffect(async () => {
    setPairs([]); setSelectedTimeline(null); setSelectedRecording(null);
    if (!selectedTest() || !selectedPart()) return;
    const out = await getTimelineRecordings({ testName: selectedTest()!.value, participants: [selectedPart()!.value] }).catch(() => []);
    setPairs(out);
    const ts = Array.from(new Set(out.map(p => p.timeline)));
    const rs = Array.from(new Set(out.map(p => p.recording)));
    setTimelineOptions(ts);
    setRecordingOptions(rs);
    if (out.length === 1) {
      setSelectedTimeline(out[0].timeline);
      setSelectedRecording(out[0].recording);
    }
  });
  // keep options consistent
  createEffect(() => {
    const rs = Array.from(new Set(
      pairs().filter(p => !selectedTimeline() || p.timeline === selectedTimeline()).map(p => p.recording)
    ));
    setRecordingOptions(rs);
    if (selectedRecording() && !rs.includes(selectedRecording()!)) setSelectedRecording(null);
  });
  createEffect(() => {
    const ts = Array.from(new Set(
      pairs().filter(p => !selectedRecording() || p.recording === selectedRecording()).map(p => p.timeline)
    ));
    setTimelineOptions(ts);
    if (selectedTimeline() && !ts.includes(selectedTimeline()!)) setSelectedTimeline(null);
  });

  /* image + windows */
  createEffect(async () => {
    if (!selectedTest()) { setTestImgB64(null); return; }
    setTestImgB64(await getTestImage({ testName: selectedTest()!.value, timeline: selectedTimeline() }).catch(() => null));
  });
  createEffect(async () => {
    if (!selectedTest()) return setWordWin([]);
    setWordWin(await getWordWindows({ testName: selectedTest()!.value, timeline: selectedTimeline() }).catch(() => []));
  });

  /* fetch gaze + stats */
  const needsChoice = createMemo(() =>
    pairs().length > 1 && (!selectedTimeline() || !selectedRecording())
  );

  createEffect(async () => {
    if (!selectedTest() || !selectedPart()) return;
    if (needsChoice()) { setGaze([]); setBoxStats({}); setRows([]); return; }

    const data = await getGazeData({
      testName: selectedTest()!.value,
      participants: [selectedPart()!.value],
      timeline: selectedTimeline(),
      recording: selectedRecording(),
    }).catch(() => []);

    const rec = selectedRecording() ?? (data.length ? (data[0] as any).recording || (data[0] as any).recording_name || (data[0] as any)["Recording name"] : null);
    setRecordingName(rec ?? null);
    const pct = rec ? recIndex()[rec] ?? null : null;
    setRecordingPct(pct);

    const blocked = pct !== null && pct < minValidPct();
    setBlockedByQuality(blocked);
    setGaze(blocked ? [] : data);

    const stats = await getBoxStats({
      testName: selectedTest()!.value,
      participants: [selectedPart()!.value],
      timeline: selectedTimeline(),
      recording: selectedRecording(),
    }).catch(() => ({ box_percentages: {} as Record<string, number> }));
    setBoxStats(blocked ? {} : stats.box_percentages);
    setStatsWhole(blocked ? { pct_including_missing: 0, pct_excluding_missing: 0, pct_excluding_missing_oob: 0 }
                           : calcWholeStats(data));
  });

  /* block/unblock on slider change */
  createEffect(() => {
    const pct = recordingPct();
    if (pct === null) return;
    const blocked = pct < minValidPct();
    setBlockedByQuality(blocked);
    if (blocked) { setGaze([]); setBoxStats({}); setRows([]); }
  });

  /* build time bins */
  createEffect(() => {
    if (!gaze().length) { setRows([]); return; }
    const ms = Math.max(1, intervalMs());
    const bins: Record<number, any> = {};
    [...gaze()].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp))
      .forEach(pt => {
        const k = Math.floor(+new Date(pt.timestamp) / ms) * ms;
        bins[k] ??= { timestamp: k, total: 0, ...Object.fromEntries(Object.keys(DEFAULT_COLORS).map(b => [b, 0])) };
        bins[k][pt.box_name]++; bins[k].total++;
      });
    const r = Object.values(bins).map(g => {
      const o: Record<string, any> = { timestamp: new Date(g.timestamp).toISOString() };
      Object.keys(DEFAULT_COLORS).forEach(b => o[b] = g.total ? ((g[b] || 0) / g.total) * 100 : 0);
      return o;
    }).sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
    setRows(r);
  });

  /* resets */
  function reset() {
    setIntervalMs(100);
    setPxPerSec(40);
    setSpanSec(15);
    setViewSec(15);
    setMinValidPct(0);
  }

  return {
    // lists
    tests, participants,
    truths, morphs, poss, series, groups,
    // filters
    truthF, setTruthF, morphF, setMorphemeF, posF, setPosF, seriesF, setSeriesF, groupF, setGroupF,
    filteredTests,

    // selections
    selectedTest, setSelectedTest, selectedPart, setSelectedPart,
    pairs, timelineOptions, recordingOptions, selectedTimeline, setSelectedTimeline, selectedRecording, setSelectedRecording,
    needsChoice,

    // data & meta
    gaze, boxStats, statsWhole, wordWin, testImgB64, colorMap,
    selectedBoxes, activeMetaFilters, toggleMeta, metaBoxSets,

    // quality controls
    minValidPct, setMinValidPct, recordingPct, recordingName, blockedByQuality,

    // rows & charting
    rows, baseMs, intervalMs, setIntervalMs, pxPerSec, setPxPerSec, spanSec, setSpanSec, viewSec, setViewSec,

    // helpers
    reset,
  };
}
