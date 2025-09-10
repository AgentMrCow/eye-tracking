import { createEffect, createMemo, createSignal } from "solid-js";
import type {
  CatalogRow, GazeData, MetaKey, SelectOption, TestMeta, TLRec, WordWindow
} from "../types";
import {
  getAllCatalog, getAllRecordings, getAllTestMeta, getAoiMap, getBoxStats, getGazeData,
  getParticipants, getTestImage, getTestNames, getTimelineRecordings, getWordWindows,
} from "../services/gazeApi";
import { getStatic } from "@/shared/tauriClient";
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
  // constrained options by current selections
  const [testsForParticipant, setTestsForParticipant] = createSignal<string[] | null>(null);
  const [partsForTest, setPartsForTest] = createSignal<string[] | null>(null);
  const [mapTestsForPart, setMapTestsForPart] = createSignal<Record<string, string[]>>({});
  const [mapPartsForTest, setMapPartsForTest] = createSignal<Record<string, string[]>>({});

  /* meta & catalog */
  const [allMeta, setAllMeta] = createSignal<TestMeta[]>([]);
  const [truths, setTruths] = createSignal<string[]>([]);
  const [morphs, setMorphs] = createSignal<string[]>([]);
  const [poss, setPoss] = createSignal<string[]>([]);
  const [series, setSeries] = createSignal<string[]>([]);
  const [catalog, setCatalog] = createSignal<CatalogRow[]>([]);
  const catalogByTest = createMemo(() => {
    const map = new Map<string, CatalogRow>();
    for (const r of catalog()) {
      if (!r || !r.test_name) continue;
      map.set(r.test_name, r);
      map.set(r.test_name.trim(), r);
    }
    return map;
  });
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
  function clearMetaFilters() { setActiveMetaFilters(new Set<MetaKey>()); }

  /* AOI sets per selected test (defined later after gaze() to avoid init order issues) */

  const selectedBoxes = createMemo<Set<string>>(() => {
    const row = selectedTest() ? catalogByTest().get(selectedTest()!.value) : undefined;
    if (!row) return new Set();
    const sel = activeMetaFilters();
    if (sel.size === 0) return new Set(); // show all
    const out = new Set<string>();
    const add = (codes?: string | null) => parseAOISet(codes).forEach(b => out.add(b));
    if (sel.has("self_AOIs"))                add((row as any).self_AOIs as any);
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
  // auto-sync view width to binned data span unless user overrides
  const [autoSyncView, setAutoSyncView] = createSignal(true);

  /* durations */
  const rawDurationSec = createMemo(() => {
    const g = gaze();
    if (!g.length) return 0;
    const first = +new Date(g[0].timestamp);
    const last = +new Date(g[g.length - 1].timestamp);
    return Math.max(0, (last - first) / 1000);
  });
  const binnedDurationSec = createMemo(() => {
    const b = baseMs();
    const r = rows();
    if (!r.length || !b) return 0;
    const last = +new Date(r[r.length - 1].timestamp);
    return Math.max(0, (last - b) / 1000);
  });

  /* lists bootstrap */
  createEffect(async () => {
    setTests((await getTestNames()).map(t => ({ label: t, value: t })));
    setParticipants((await getParticipants()).map(p => ({ label: p, value: p })));
    // preload static maps to avoid async races during selection changes
    const s = await getStatic().catch(() => null as any);
    if (s) {
      setMapTestsForPart((s.tests_by_participant as Record<string, string[]>) || {});
      setMapPartsForTest((s.participants_by_test as Record<string, string[]>) || {});
    }
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

  // further constrain tests by selected participant (only tests they actually did)
  const filteredTestsByPart = createMemo(() => {
    const base = filteredTests();
    const tp = testsForParticipant();
    if (!tp) return base;
    const tpSet = new Set(tp.map(t => t?.trim?.() ?? t));
    return base.filter(t => tpSet.has((t?.trim?.() ?? t)));
  });

  // participants constrained by selected test as a list (for internal guards)
  const participantsFilteredList = createMemo(() => {
    const base = participants().map(o => o.value);
    const parts = partsForTest();
    if (!parts) return base;
    const pset = new Set(parts.map(p => p?.trim?.() ?? p));
    return base.filter(v => pset.has((v?.trim?.() ?? v)));
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
  // participants allowed by selected test (sync from static map) ??no auto-clears
  createEffect(() => {
    const t = selectedTest()?.value ?? null;
    if (!t) { setPartsForTest(null); return; }
    const parts = mapPartsForTest()[t] || [];
    setPartsForTest(parts);
  });
  // tests allowed by selected participant (sync from static map) ??no auto-clears
  createEffect(() => {
    const p = selectedPart()?.value ?? null;
    if (!p) { setTestsForParticipant(null); return; }
    const tests = mapTestsForPart()[p] || [];
    setTestsForParticipant(tests);
  });

  /* auto-sync current view width to binned duration unless user changed it */
  createEffect(() => {
    if (!autoSyncView()) return;
    const dur = binnedDurationSec();
    if (dur > 0) {
      // round to milliseconds precision to reflect binning
      const next = Math.max(1, Math.round(dur * 1000) / 1000);
      setViewSec(next);
    }
  });

  /* AOI sets per selected test (robust to name drift; falls back to gaze test_name) */
  const metaBoxSets = createMemo(() => {
    const map = catalogByTest();
    const tSel = selectedTest()?.value?.trim();
    let row = tSel ? map.get(tSel) : undefined;
    if (!row && gaze().length) {
      const tG = (gaze()[0] as any).test_name?.toString()?.trim();
      if (tG) row = map.get(tG);
    }
    return {
      self_AOIs:                new Set(parseAOISet((row as any)?.self_AOIs)),
      correct_AOIs:             new Set(parseAOISet((row as any)?.correct_AOIs)),
      potentially_correct_AOIs: new Set(parseAOISet((row as any)?.potentially_correct_AOIs)),
      incorrect_AOIs:           new Set(parseAOISet(row?.incorrect_AOIs)),
      correct_NULL:             new Set(parseAOISet(row?.correct_NULL)),
      potentially_correct_NULL: new Set(parseAOISet(row?.potentially_correct_NULL)),
      incorrect_NULL:           new Set(parseAOISet(row?.incorrect_NULL)),
    };
  });

  // Guard: if current selections become invalid due to filter changes, clear them (prevents hangs)
  createEffect(() => {
    const list = filteredTestsByPart();
    const set = new Set(list.map(t => t?.trim?.() ?? t));
    const sel = selectedTest()?.value;
    if (sel && !set.has((sel?.trim?.() ?? sel))) setSelectedTest(null);
  });
  createEffect(() => {
    const list = participantsFilteredList();
    const set = new Set(list.map(p => p?.trim?.() ?? p));
    const sel = selectedPart()?.value;
    if (sel && !set.has((sel?.trim?.() ?? sel))) setSelectedPart(null);
  });

  /* resets */
  function reset() {
    setIntervalMs(100);
    setPxPerSec(40);
    setSpanSec(15);
    setViewSec(15);
    setAutoSyncView(true);
    setMinValidPct(0);
  }

  function clearSelections() {
    setSelectedTimeline(null);
    setSelectedRecording(null);
    setSelectedPart(null);
    setSelectedTest(null);
    // reset filters to avoid empty option hangs
    setTruthF("all");
    setMorphemeF("all");
    setPosF("all");
    setSeriesF("all");
    setGroupF("all");
  }

  return {
    // lists
    tests, participants,
    truths, morphs, poss, series, groups,
    // filters
    truthF, setTruthF, morphF, setMorphemeF, posF, setPosF, seriesF, setSeriesF, groupF, setGroupF,
    filteredTests: filteredTestsByPart,

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
    rawDurationSec, binnedDurationSec,
    // allow callers to disable auto-sync when the user adjusts the view
    disableAutoView: () => setAutoSyncView(false),

    // constrained options for UI
    participantsFiltered: participantsFilteredList,

    // expose catalog lookup for selected test (for AOI toggles)
    catalogRowForSelectedTest: createMemo(() => {
      const map = catalogByTest();
      const t = selectedTest()?.value?.trim();
      if (t) return map.get(t) ?? null;
      if (gaze().length) {
        const tG = (gaze()[0] as any).test_name?.toString()?.trim();
        if (tG) return map.get(tG) ?? null;
      }
      return null as CatalogRow | null;
    }),

    // helpers
    reset,
    clearSelections,
    clearMetaFilters,
  };
}


