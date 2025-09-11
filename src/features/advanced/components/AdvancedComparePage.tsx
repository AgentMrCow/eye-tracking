import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberField, NumberFieldInput } from "@/components/ui/number-field";
import { LineChart } from "@/components/ui/charts";
import JsonViewer from "@/components/ui/json-viewer";

import { getAllCatalog, getGazeData, getParticipants, getTimelineRecordings, getWordWindows } from "@/features/gaze/services/gazeApi";
import { getStatic, getParticipantsTableRaw, searchSlicesRaw } from "@/shared/tauriClient";
import type { SearchSliceRow } from "@/shared/type";
// removed unused imports
import { boxesFor } from "@/features/catalog/utils";
import { ALL_AOI_KEYS, AOI_KEY_LABEL } from "@/features/catalog/constants";
import { bootstrapCI, buildBins, clusterPermutation } from "../analysis";
import { loadComparePrefs, saveComparePrefs, type ComparePrefs } from "@/shared/prefs";
import { getParticipantsForTest } from "@/features/gaze/services/gazeApi";

export default function AdvancedComparePage() {
  const [catalog, setCatalog] = createSignal<any[]>([]);
  const [tests, setTests] = createSignal<string[]>([]);
  const [selTests, setSelTests] = createSignal<string[]>([]);
  const [participants, setParticipants] = createSignal<string[]>([]);
  const [allTestNames, setAllTestNames] = createSignal<string[]>([]);
  const [isQacMap, setIsQacMap] = createSignal<Record<string, boolean>>({});
  const [partsByTest, setPartsByTest] = createSignal<Record<string, string[]>>({});
  const [selParticipants, setSelParticipants] = createSignal<string[]>([]);
  const [catalogRow, setCatalogRow] = createSignal<any>(null);
  const [wordWin, setWordWin] = createSignal<{ chinese_word: string; start_sec: number; end_sec: number }[]>([]);

  // AOI sets selection (reuse labels/keys)
  const [blueKeys, setBlueKeys] = createSignal<string[]>(["correct_AOIs"]);
  const [redKeys, setRedKeys] = createSignal<string[]>(ALL_AOI_KEYS.filter(k => k !== "correct_AOIs"));
  const [invalidCats, setInvalidCats] = createSignal<("other" | "missing" | "out_of_screen")[]>(["missing"]);

  // Anchor + bins
  const [anchorMode, setAnchorMode] = createSignal<"manual" | "word">("word");
  const [anchorWord, setAnchorWord] = createSignal<string>("");
  const [analysisStartMs, setAnalysisStartMs] = createSignal<number>(0);
  const [shiftMs, setShiftMs] = createSignal<number>(200);
  const [binMs, setBinMs] = createSignal<number>(100);
  const [numBins, setNumBins] = createSignal<number>(25);

  // Stats params
  const [nBoot, setNBoot] = createSignal<number>(300);
  const [nPerm, setNPerm] = createSignal<number>(200);
  const [alpha, setAlpha] = createSignal<number>(0.05);

  // Meta filters
  const [truths, setTruths] = createSignal<string[]>([]);
  const [morphs, setMorphs] = createSignal<string[]>([]);
  const [poss, setPoss] = createSignal<string[]>([]);
  const [series, setSeries] = createSignal<string[]>([]);
  const [groups, setGroups] = createSignal<string[]>([]);
  const [qacFilter, setQacFilter] = createSignal<"all" | "qac" | "nonqac">("all");
  const [truthF, setTruthF] = createSignal("all");
  const [morphF, setMorphF] = createSignal("all");
  const [posF, setPosF] = createSignal("all");
  const [seriesF, setSeriesF] = createSignal("all");
  const [groupF, setGroupF] = createSignal("all");

  // Sessions selection
  type Session = { timeline: string; recording: string };
  const [sessionsByPart, setSessionsByPart] = createSignal<Record<string, Session[]>>({});
  const [selectedSessions, setSelectedSessions] = createSignal<Record<string, Record<string, boolean>>>({});

  // Results
  const [curve, setCurve] = createSignal<any>(null);
  const [sig, setSig] = createSignal<{ mask: boolean[]; clusters: any[] } | null>(null);
  const [running, setRunning] = createSignal(false);
  const [aggMode, setAggMode] = createSignal<"mean" | "median" | "weighted">("mean");
  const [multiTest, setMultiTest] = createSignal(false);

  createEffect(async () => {
    const cat = await getAllCatalog();
    setCatalog(cat);
    const g = await getStatic().catch(() => null as any);
    setPartsByTest((g?.participants_by_test as Record<string, string[]>) || {});
    setParticipants(await getParticipants());
    setAllTestNames((g?.test_names as string[]) || []);
    // QAC map (participants table)
    const ptab = await getParticipantsTableRaw().catch(() => [] as any[]);
    const map: Record<string, boolean> = {};
    for (const r of ptab as any[]) {
      const name = (r.participant ?? r.Participant ?? r.participant_name ?? r.name ?? "").toString();
      if (!name) continue;
      const raw = (r.is_qac ?? r.IS_QAC ?? r.Is_QAC ?? r.IsQAC ?? r.isQAC ?? r.qac ?? "1").toString();
      const val = raw === "1" || raw.toLowerCase() === "true";
      map[name] = val;
    }
    // Fallback mapping if table absent: TLK311–TLK320 are non‑QAC, others QAC
    if (Object.keys(map).length === 0) {
      const allParts = await getParticipants().catch(() => [] as string[]);
      const nq = new Set(Array.from({ length: 10 }, (_, i) => `TLK${311 + i}`));
      const fb: Record<string, boolean> = {};
      for (const p of allParts) {
        const id = (p || "").trim();
        fb[id] = !nq.has(id); // false for TLK311..TLK320
      }
      setIsQacMap(fb);
    } else {
      setIsQacMap(map);
    }
    // meta option lists
    setTruths(Array.from(new Set(cat.map(r => r.truth_value || "").filter(Boolean))));
    setMorphs(Array.from(new Set(cat.map(r => r.morpheme || "").filter(Boolean))));
    setPoss(Array.from(new Set(cat.map(r => r.only_position || "").filter(Boolean))));
    setSeries(Array.from(new Set(cat.map(r => r.series || "").filter(Boolean))));
    setGroups(Array.from(new Set(cat.map(r => r.group || "").filter(Boolean))));
    // Merge participants_by_test from search_slices (always supplement static)
    try {
      const rows = await searchSlicesRaw().catch(() => [] as SearchSliceRow[]);
      if (rows.length) {
        const base = { ...partsByTest() };
        const map = new Map<string, Set<string>>();
        // seed with existing
        Object.entries(base).forEach(([t, arr]) => map.set(t, new Set(arr)));
        for (const r of rows) {
          const t = r.test_name; const p = r.participant_name;
          if (!t || !p) continue;
          if (!map.has(t)) map.set(t, new Set());
          map.get(t)!.add(p);
        }
        const obj: Record<string, string[]> = {};
        map.forEach((set, key) => obj[key] = Array.from(set));
        setPartsByTest(obj);
      }
    } catch {}
  });

  // Load persisted AOI preferences (shared with Catalog Compare)
  createEffect(async () => {
    const prefs = await loadComparePrefs();
    if (!prefs) return;
    const allowed = new Set(ALL_AOI_KEYS as string[]);
    const bk = (prefs.blueKeys || []).filter((k) => allowed.has(k));
    if (bk.length) setBlueKeys(bk);
    if (prefs.redCustom) {
      const rk0 = (prefs.redKeys || []).filter((k) => allowed.has(k));
      const rk = rk0.filter((k) => !bk.includes(k));
      setRedKeys(rk.length ? rk : ALL_AOI_KEYS.filter((k) => !bk.includes(k)));
    } else {
      setRedKeys(ALL_AOI_KEYS.filter((k) => !bk.includes(k)));
    }
    const invAll = new Set(["missing", "out_of_screen", "other"] as const);
    const inv = (prefs.invalidCats || []).filter((k) => invAll.has(k as any));
    if (inv.length) setInvalidCats(inv as any);
  });

  // Persist AOI preferences whenever they change
  createEffect(() => {
    const prefs: ComparePrefs = {
      blueKeys: blueKeys(),
      redKeys: redKeys(),
      redCustom: true,
      invalidCats: invalidCats() as any,
    };
    saveComparePrefs(prefs);
  });

  // filtered tests by meta (QAC filter applies to participants, not test presence)
  const filteredTests = createMemo(() => {
    const fromCatalog = catalog().filter((r) =>
      (groupF() === "all" || r.group === groupF()) &&
      (truthF() === "all" || r.truth_value === truthF()) &&
      (posF() === "all" || r.only_position === posF()) &&
      (morphF() === "all" || r.morpheme === morphF()) &&
      (seriesF() === "all" || r.series === seriesF())
    ).map(r => r.test_name);
    return fromCatalog.length ? fromCatalog : allTestNames();
  });
  createEffect(() => {
    const ft = filteredTests();
    setTests(ft);
    // Default/select-all behavior like participants: keep intersection, add new filtered
    const cur = new Set(selTests());
    const next = ft.filter(t => cur.has(t));
    // If nothing selected or filters changed, select all filtered by default
    setSelTests(next.length ? next : ft);
  });

  // Derive a current test (first selected) for word anchors and AOI row context
  const currentTest = createMemo(() => selTests()[0] || "");
  createEffect(async () => {
    const t = currentTest();
    const qmap = isQacMap();
    function isQac(p: string) { return (p in qmap) ? qmap[p] : true; }
    if (!t) { setCatalogRow(null); setWordWin([]); /* don't thrash selParticipants here */ return; }
    setCatalogRow(catalog().find(r => r.test_name === t) || null);
    setWordWin(await getWordWindows({ testName: t }).catch(() => []));
    // default participants = union across selected tests
    const all = selTests().flatMap(tt => partsByTest()[tt] || []);
    let uniq = Array.from(new Set(all));
    if (qacFilter() === "qac") uniq = uniq.filter(isQac);
    else if (qacFilter() === "nonqac") uniq = uniq.filter((p) => !isQac(p));
    // Only auto-select all if user has nothing selected; otherwise keep user's selection
    // Only auto-select when empty AND we have something to select, to avoid reactive loops
    if (selParticipants().length === 0 && uniq.length > 0) setSelParticipants(uniq);
  });

  // keep selected participants consistent when QAC filter changes
  createEffect(() => {
    const qmap = isQacMap();
    function isQac(p: string) { return (p in qmap) ? qmap[p] : true; }
    // Allowed participants = union across selected tests (filtered by QAC)
    const all = selTests().flatMap(t => partsByTest()[t] || []);
    let allowed = Array.from(new Set(all));
    if (qacFilter() === "qac") allowed = allowed.filter(isQac);
    else if (qacFilter() === "nonqac") allowed = allowed.filter(p => !isQac(p));
    const cur = selParticipants();
    const next = cur.filter(p => allowed.includes(p));
    if (next.length !== cur.length) setSelParticipants(next);
  });

  // options shown in the Participants select (test-scoped + QAC filtered)
  const participantOptions = createMemo(() => {
    const qmap = isQacMap();
    function isQac(p: string) { return (p in qmap) ? qmap[p] : true; }
    const allSel = selTests().flatMap(t => partsByTest()[t] || []);
    let opts = Array.from(new Set(allSel));
    if (!opts.length) {
      // Prefer union across all known tests from the partsByTest map
      const allMap = Array.from(new Set(Object.values(partsByTest()).flat()));
      opts = allMap.length ? allMap : participants();
    }
    if (qacFilter() === "qac") opts = opts.filter(isQac);
    else if (qacFilter() === "nonqac") opts = opts.filter(p => !isQac(p));
    if (!opts.length) {
      // last fallback to global list unfiltered so the dropdown isn't blank
      opts = participants();
    }
    return opts;
  });

  // Prefetch participants for selected tests if missing from static map
  createEffect(async () => {
    const wanted = selTests();
    if (!wanted.length) return;
    const cur = partsByTest();
    let changed = false;
    const next: Record<string, string[]> = { ...cur };
    for (const t of wanted) {
      if (!next[t] || next[t].length === 0) {
        const fetched = await getParticipantsForTest(t).catch(() => []);
        if (fetched.length) { next[t] = fetched; changed = true; }
      }
    }
    if (changed) setPartsByTest(next);
  });

  // Prefetch sessions per participant and initialize selections (all included)
  createEffect(async () => {
    const t = currentTest(); if (!t) return;
    const plist = selParticipants();
    const map: Record<string, Session[]> = { ...sessionsByPart() };
    const sel: Record<string, Record<string, boolean>> = { ...selectedSessions() };
    for (const p of plist) {
      const ss = await getTimelineRecordings({ testName: t!, participants: [p] }).catch(() => []);
      map[p] = ss.map(s => ({ timeline: s.timeline, recording: s.recording }));
      sel[p] = sel[p] || {};
      for (const s of map[p]) { sel[p][`${s.timeline}|${s.recording}`] = sel[p][`${s.timeline}|${s.recording}`] ?? true; }
    }
    setSessionsByPart(map);
    setSelectedSessions(sel);
  });

  const canRun = createMemo(() => selTests().length > 0 && selParticipants().length > 0);

  async function generate() {
    if (!canRun()) return;
    setRunning(true); setCurve(null); setSig(null);
    const invalid = new Set<string>(invalidCats());
    const xSec = Array.from({ length: numBins() }, (_, i) => ((i + 0.5) * binMs()) / 1000);
    function median(arr: number[]): number { const a = [...arr].sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2?a[m]: (a[m-1]+a[m])/2; }
    const perParticipant: number[][] = [];

    const processTest = async (tname: string, plist: string[]) => {
      const row = catalog().find(r => r.test_name === tname) as any;
      const blueBoxes = boxesFor(row, blueKeys() as any);
      const redBoxes  = boxesFor(row, redKeys().filter(k => !blueKeys().includes(k)) as any);
      for (const p of plist) {
        const sess = await getTimelineRecordings({ testName: tname, participants: [p] }).catch(() => []);
        const perSessionVals: { eff: number[]; w: number[] }[] = [];
        for (const s of sess) {
          const data = await getGazeData({ testName: tname, participants: [p], timeline: s.timeline, recording: s.recording }).catch(() => []);
          if (!data.length) continue;
          const baseMs = +new Date(data[0].timestamp);
          let anchorAbs = baseMs + (analysisStartMs() || 0);
          if (anchorMode() === 'word') {
            const ww = wordWin().find(w => w.chinese_word === anchorWord());
            if (ww) anchorAbs = baseMs + (ww.start_sec * 1000);
          }
          anchorAbs += shiftMs();
          const bins = buildBins(data, anchorAbs, binMs(), numBins(), invalid, blueBoxes, redBoxes);
          perSessionVals.push({ eff: bins.map(b => (b.bluePct - b.redPct)), w: bins.map(b => b.validN) });
        }
        if (!perSessionVals.length) continue;
        const T = numBins();
        const arr: number[] = [];
        for (let i = 0; i < T; i++) {
          const vals = perSessionVals.map(s => s.eff[i] ?? 0);
          if (aggMode() === 'median') arr.push(median(vals));
          else if (aggMode() === 'weighted') {
            const ws = perSessionVals.map(s => s.w[i] ?? 0);
            const sumW = ws.reduce((a,b)=>a+b,0);
            arr.push(sumW>0 ? vals.reduce((a,v,idx)=>a+v*ws[idx],0)/sumW : (vals.reduce((a,v)=>a+v,0)/vals.length));
          } else {
            arr.push(vals.reduce((a,v)=>a+v,0)/vals.length);
          }
        }
        perParticipant.push(arr);
      }
    };

    // Iterate selected tests and their allowed participants
    const qmap = isQacMap();
    const isQ = (p: string) => (p in qmap) ? qmap[p] : true;
    for (const tname of selTests()) {
      let plist = selParticipants();
      // Ensure participants actually belong to this test
      const allowedAll = partsByTest()[tname] || [];
      plist = plist.filter(p => allowedAll.includes(p));
      if (qacFilter() === 'qac') plist = plist.filter(isQ);
      else if (qacFilter() === 'nonqac') plist = plist.filter(p => !isQ(p));
      await processTest(tname, plist);
    }
    if (!perParticipant.length) { setRunning(false); return; }
    const agg = bootstrapCI(perParticipant, xSec, nBoot(), alpha());
    setCurve(agg);
    const sigRes = clusterPermutation(perParticipant, 2.0, nPerm());
    setSig(sigRes);
    setRunning(false);
  }

  const viz = createMemo(() => {
    const c = curve(); if (!c) return { datasets: [] };
    const mask = sig()?.mask || [];
    const base = [
      { label: "Mean(%Blue-%Red)", data: c.xSec.map((x: number, i: number) => ({ x, y: c.mean[i] })), borderColor: "#2563eb", pointRadius: 0, borderWidth: 1.5, tension: 0.2 },
      { label: "CI Low", data: c.xSec.map((x: number, i: number) => ({ x, y: c.ciLow[i] })), borderColor: "#93c5fd", pointRadius: 0, borderDash: [4,4], borderWidth: 1, tension: 0 },
      { label: "CI High", data: c.xSec.map((x: number, i: number) => ({ x, y: c.ciHigh[i] })), borderColor: "#93c5fd", pointRadius: 0, borderDash: [4,4], borderWidth: 1, tension: 0 },
    ];
    // significance shading via a background dataset by duplicating mask (optional)
    const shade = c.xSec.map((x: number, i: number) => ({ x, y: mask[i] ? c.mean[i] : null }));
    const dsShade = { label: "Significant cluster", data: shade, borderColor: "rgba(34,197,94,0.8)", backgroundColor: "rgba(34,197,94,0.15)", pointRadius: 0, borderWidth: 0, fill: true, tension: 0 } as any;
    return { datasets: [...base, dsShade] };
  });

  return (
    <div class="space-y-6">
      <Card>
        <CardHeader><CardTitle>Advanced Compare (multi‑participant, CI + permutation)</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <div class="flex flex-wrap items-end gap-3 mb-2">
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">Test</span>
              <Select<string> multiple value={selTests()} onChange={setSelTests} options={tests()}
                itemComponent={(pp) => {
                  const tname = pp.item.rawValue as string;
                  const plist = (partsByTest()[tname] || []);
                  const qmap = isQacMap();
                  let q = 0, nq = 0;
                  for (const p of plist) { ((p in qmap) ? qmap[p] : true) ? q++ : nq++; }
                  return (
                    <SelectItem item={pp.item}>
                      <div class="flex w-full items-center justify-between gap-3">
                        <span>{tname}</span>
                        <span class="text-xs text-muted-foreground">Q {q} · NQ {nq}</span>
                      </div>
                    </SelectItem>
                  );
                }}
              >
              <SelectTrigger class="w-72"><SelectValue>{selTests().length ? `${selTests().length} selected` : 'Select tests'}</SelectValue></SelectTrigger>
                <SelectContent class="max-h-60 overflow-y-auto" />
              </Select>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">Participants</span>
              <Select<string> multiple value={selParticipants()} onChange={setSelParticipants} options={participantOptions()}
                itemComponent={(pp) => {
                  const name = pp.item.rawValue as string;
                  const qmap = isQacMap();
                  const q = (name in qmap) ? qmap[name] : true;
                  return (
                    <SelectItem item={pp.item}>
                      <div class="flex w-full items-center justify-between gap-3">
                        <span>{name}</span>
                        <span class={`px-1.5 py-0.5 rounded text-[10px] font-medium ${q ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{q ? 'QAC' : 'Non‑QAC'}</span>
                      </div>
                    </SelectItem>
                  );
                }}
              >
                <SelectTrigger class="w-[420px]"><SelectValue>{selParticipants().length ? `${selParticipants().length} selected` : "Select participants"}</SelectValue></SelectTrigger>
                <SelectContent class="max-h-60 overflow-y-auto" />
              </Select>
            </div>
            <div class="ml-auto flex items-end gap-3">
              <div class="flex items-center gap-2 text-sm">
                <span>Bin</span>
                <NumberField value={binMs()} class="w-24"><NumberFieldInput min={50} max={2000} onInput={(e) => setBinMs(Math.max(1, +e.currentTarget.value || 1))} /></NumberField>
                <span>ms</span>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <span>Bins</span>
                <NumberField value={numBins()} class="w-20"><NumberFieldInput min={5} max={100} onInput={(e) => setNumBins(Math.max(1, +e.currentTarget.value || 1))} /></NumberField>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <span>Shift</span>
                <NumberField value={shiftMs()} class="w-20"><NumberFieldInput min={0} max={2000} onInput={(e) => setShiftMs(Math.max(0, +e.currentTarget.value || 0))} /></NumberField>
                <span>ms</span>
              </div>
            </div>
          </div>

          <div class="rounded border p-3 space-y-3">
            <div class="text-sm font-medium">Meta filters (tests)</div>
            <div class="flex flex-wrap items-end gap-3 text-sm">
              <label class="flex items-center gap-2">QAC
                <span class="text-[10px] ml-1 inline-flex items-center gap-1">
                  <span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">QAC</span>
                  <span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Non‑QAC</span>
                </span>
                <Select value={qacFilter()} onChange={(v) => setQacFilter((v as any) || 'all')} options={["all","qac","nonqac"]} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-36"><SelectValue>{qacFilter()}</SelectValue></SelectTrigger>
                  <SelectContent class="max-h-60 overflow-y-auto" />
                </Select>
              </label>
              <label class="flex items-center gap-2">Group
                <Select value={groupF()} onChange={(v) => setGroupF(v || 'all')} options={["all", ...groups()]} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-44"><SelectValue>{groupF()}</SelectValue></SelectTrigger>
                  <SelectContent class="max-h-60 overflow-y-auto" />
                </Select>
              </label>
              <label class="flex items-center gap-2">Truth
                <Select value={truthF()} onChange={(v) => setTruthF(v || 'all')} options={["all", ...truths()]} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-44"><SelectValue>{truthF()}</SelectValue></SelectTrigger>
                  <SelectContent class="max-h-60 overflow-y-auto" />
                </Select>
              </label>
              <label class="flex items-center gap-2">Pos
                <Select value={posF()} onChange={(v) => setPosF(v || 'all')} options={["all", ...poss()]} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-44"><SelectValue>{posF()}</SelectValue></SelectTrigger>
                  <SelectContent class="max-h-60 overflow-y-auto" />
                </Select>
              </label>
              <label class="flex items-center gap-2">Morph
                <Select value={morphF()} onChange={(v) => setMorphF(v || 'all')} options={["all", ...morphs()]} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-44"><SelectValue>{morphF()}</SelectValue></SelectTrigger>
                  <SelectContent class="max-h-60 overflow-y-auto" />
                </Select>
              </label>
              <label class="flex items-center gap-2">Series
                <Select value={seriesF()} onChange={(v) => setSeriesF(v || 'all')} options={["all", ...series()]} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-44"><SelectValue>{seriesF()}</SelectValue></SelectTrigger>
                  <SelectContent class="max-h-60 overflow-y-auto" />
                </Select>
              </label>
            </div>
          </div>

          <div class="mt-3 grid gap-4 md:grid-cols-2">
            <div class="rounded border p-3 space-y-2">
              <div class="text-sm font-medium">AOI sets</div>
              <div class="text-xs text-muted-foreground">Pick Blue and Red sets (from catalog AOIs for this test). Red excludes keys in Blue.</div>
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="font-medium">Blue</span>
                <Button size="sm" variant="outline" onClick={() => { setBlueKeys(ALL_AOI_KEYS.slice()); setRedKeys([]); }}>Enable all</Button>
                <Button size="sm" variant="outline" onClick={() => setBlueKeys([])}>Disable all</Button>
                <Button size="sm" variant="outline" onClick={() => { setBlueKeys(["correct_AOIs"]); setRedKeys(ALL_AOI_KEYS.filter(k => k !== "correct_AOIs")); setInvalidCats(["missing"]); }}>Reset defaults</Button>
              </div>
              <div class="flex flex-wrap gap-2">
                <For each={ALL_AOI_KEYS}>{k =>
                  <button class={`px-2 py-0.5 border rounded text-xs ${blueKeys().includes(k) ? 'bg-blue-600 text-white' : 'bg-muted'}`}
                          onClick={() => {
                            const s = new Set(blueKeys()); s.has(k) ? s.delete(k) : s.add(k); setBlueKeys(Array.from(s));
                            // ensure red excludes blue
                            setRedKeys(redKeys().filter(x => !Array.from(s).includes(x)));
                          }}>{AOI_KEY_LABEL[k] || k}</button>
                }</For>
              </div>
              <div class="text-xs text-muted-foreground">Red set:</div>
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="font-medium">Red</span>
                <Button size="sm" variant="outline" onClick={() => setRedKeys(ALL_AOI_KEYS.filter(k => !blueKeys().includes(k)))}>Enable all</Button>
                <Button size="sm" variant="outline" onClick={() => setRedKeys([])}>Disable all</Button>
              </div>
              <div class="flex flex-wrap gap-2">
                <For each={ALL_AOI_KEYS.filter(k => !blueKeys().includes(k))}>{k =>
                  <button class={`px-2 py-0.5 border rounded text-xs ${redKeys().includes(k) ? 'bg-rose-600 text-white' : 'bg-muted'}`}
                          onClick={() => {
                            const s = new Set(redKeys()); s.has(k) ? s.delete(k) : s.add(k); setRedKeys(Array.from(s));
                          }}>{AOI_KEY_LABEL[k] || k}</button>
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
              <div class="text-[11px] text-muted-foreground mt-2">Defaults: Blue = <code>correct_AOIs</code>; Red = remaining AOIs; Invalid = <code>missing</code>.</div>
            </div>

            <div class="rounded border p-3 space-y-3">
              <div class="text-sm font-medium">Anchor</div>
              <div class="flex items-center gap-2 text-sm">
                <Button size="sm" variant={anchorMode()==='manual' ? 'default' : 'outline'} onClick={() => setAnchorMode('manual')}>Manual</Button>
                <Button size="sm" variant={anchorMode()==='word' ? 'default' : 'outline'} onClick={() => setAnchorMode('word')}>Word</Button>
              </div>
              <Show when={anchorMode()==='manual'}>
                <div class="flex items-center gap-2 text-sm">
                  <span>Start</span>
                  <NumberField value={analysisStartMs()} class="w-28"><NumberFieldInput min={0} max={600000} onInput={(e) => setAnalysisStartMs(Math.max(0, +e.currentTarget.value || 0))} /></NumberField>
                  <span>ms</span>
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
            </div>
          </div>

          

          <div class="mt-3 grid gap-4 md:grid-cols-2">
          <div class="rounded border p-3 space-y-2">
            <div class="text-sm font-medium">Statistics</div>
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span>Bootstrap</span>
              <NumberField value={nBoot()} class="w-24"><NumberFieldInput min={50} max={2000} onInput={(e) => setNBoot(Math.max(10, +e.currentTarget.value || 10))} /></NumberField>
              <span>Permutations</span>
              <NumberField value={nPerm()} class="w-24"><NumberFieldInput min={50} max={2000} onInput={(e) => setNPerm(Math.max(10, +e.currentTarget.value || 10))} /></NumberField>
              <span>alpha</span>
              <NumberField value={alpha()} class="w-20"><NumberFieldInput min={0.001} max={0.2} step="0.001" onInput={(e) => setAlpha(Math.min(0.2, Math.max(0.001, +e.currentTarget.value || 0.05)))} /></NumberField>
              <div class="flex items-center gap-1 w-full sm:w-auto mt-2 sm:mt-0 sm:ml-4">
                <span>Aggregate</span>
                <Button size="sm" variant={aggMode()==='mean' ? 'default':'outline'} onClick={()=>setAggMode('mean')}>Mean</Button>
                <Button size="sm" variant={aggMode()==='median' ? 'default':'outline'} onClick={()=>setAggMode('median')}>Median</Button>
                <Button size="sm" variant={aggMode()==='weighted' ? 'default':'outline'} onClick={()=>setAggMode('weighted')}>Weighted</Button>
              </div>
            </div>
          </div>

          <Show when={selTests().length === 1}>
          <div class="rounded border p-3 space-y-3">
            <div class="text-sm font-medium">Sessions included</div>
            <For each={selParticipants()}>{p =>
              <div class="border rounded p-2">
                <div class="text-xs font-medium mb-1">{p} — used {Object.values(selectedSessions()[p]||{}).filter(Boolean).length}/{(sessionsByPart()[p]||[]).length}</div>
                <div class="flex flex-wrap gap-2 items-center mb-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    const sel = { ...selectedSessions() }; sel[p] = sel[p] || {}; (sessionsByPart()[p]||[]).forEach(s=> sel[p][`${s.timeline}|${s.recording}`]=true); setSelectedSessions(sel);
                  }}>Select all</Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    const sel = { ...selectedSessions() }; sel[p] = sel[p] || {}; (sessionsByPart()[p]||[]).forEach(s=> sel[p][`${s.timeline}|${s.recording}`]=false); setSelectedSessions(sel);
                  }}>Clear all</Button>
                </div>
                <div class="flex flex-wrap gap-2">
                  <For each={sessionsByPart()[p]||[]}>{s => {
                    const key = `${s.timeline}|${s.recording}`; const checked = !!(selectedSessions()[p]?.[key]);
                    return (
                      <label class="text-xs inline-flex items-center gap-1 border rounded px-2 py-1">
                        <input type="checkbox" checked={checked} onChange={(e) => {
                          const sel = { ...selectedSessions() }; sel[p] = sel[p] || {}; sel[p][key] = e.currentTarget.checked; setSelectedSessions(sel);
                        }} /> {s.timeline} · {s.recording}
                      </label>
                    );
                  }}</For>
                </div>
              </div>
            }</For>
          </div>
          </Show>

            <div class="flex items-center gap-2 justify-end">
              <Button onClick={generate} disabled={!canRun() || running()}>{running() ? 'Running…' : 'Generate'}</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Show when={curve()}>
        <Card>
          <CardHeader><CardTitle>Effect Curve</CardTitle></CardHeader>
          <CardContent>
            <div class="h-[380px]">
              <LineChart data={viz()} options={{ responsive: true, maintainAspectRatio: false, scales: { x: { type: "linear", min: 0 }, y: { beginAtZero: true } }, plugins: { legend: { position: "top", align: "start", labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } } } } }} />
            </div>
            <div class="grid gap-3 md:grid-cols-2 mt-3">
              <JsonViewer title="Curve JSON" data={curve()} />
              <JsonViewer title="Permutation clusters" data={sig()} />
            </div>
          </CardContent>
        </Card>
      </Show>
    </div>
  );
}
