import { For, Show, createEffect, createMemo, createSignal, untrack } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider, SliderFill, SliderThumb, SliderTrack } from "@/components/ui/slider";
import JsonViewer from "@/components/ui/json-viewer";

import { getAllCatalog, getGazeData, getParticipants, getTimelineRecordings } from "@/features/gaze/services/gazeApi";
import { getStatic, getParticipantsTableRaw, searchSlicesRaw } from "@/shared/tauriClient";
import { boxesFor } from "@/features/catalog/utils";
import { ALL_AOI_KEYS, AOI_KEY_LABEL } from "@/features/catalog/constants";

// --- Types ---
interface Session {
  testName: string;
  timeline: string;
  recording: string;
}

type InvalidCat = "other" | "missing" | "out_of_screen";

type MetaFilters = {
  truthValue: string;
  morpheme: string;
  position: string;
  series: string;
  group: string;
};

interface CompareGroup {
  id: string;
  name: string;
  tests: string[];
  participants: string[];
  recordings: string[]; // encoded as `${participant}|||${timeline}|||${recording}`
  metaFilters: MetaFilters;
}

export default function AdvancedComparePage() {
  // -------- Global data --------
  const [catalog, setCatalog] = createSignal<any[]>([]);
  const [allTestNames, setAllTestNames] = createSignal<string[]>([]);
  const [participants, setParticipants] = createSignal<string[]>([]);
  const [partsByTest, setPartsByTest] = createSignal<Record<string, string[]>>({});
  const [isQacMap, setIsQacMap] = createSignal<Record<string, boolean>>({});

  // test -> participant -> sessions
  const [sessionsByPart, setSessionsByPart] = createSignal<Record<string, Session[]>>({});

  // -------- Global selections (top bar) --------
  const [selTests, setSelTests] = createSignal<string[]>([]);
  const [selParticipants, setSelParticipants] = createSignal<string[]>([]);
  const [selRecordings, setSelRecordings] = createSignal<string[]>([]); // `${p}|||${timeline}|||${recording}`

  const [numGroups, setNumGroups] = createSignal<number>(2);
  const [thresholdPct, setThresholdPct] = createSignal<number>(50);

  // AOI sets (global)
  const [blueKeys, setBlueKeys] = createSignal<string[]>(["correct_AOIs"]);
  const [redKeys, setRedKeys] = createSignal<string[]>(ALL_AOI_KEYS.filter(k => k !== "correct_AOIs"));
  const [invalidCats, setInvalidCats] = createSignal<InvalidCat[]>(["missing"]);

  // -------- Group state --------
  const makeEmptyGroup = (i: number): CompareGroup => ({
    id: `group${i+1}`,
    name: `Group ${i+1}`,
    tests: [],
    participants: [],
    recordings: [],
    metaFilters: { truthValue: "all", morpheme: "all", position: "all", series: "all", group: "all" },
  });

  const [groups, setGroups] = createSignal<CompareGroup[]>([makeEmptyGroup(0), makeEmptyGroup(1)]);

  // Meta options (from catalog)
  const [truthValues, setTruthValues] = createSignal<string[]>([]);
  const [morphemes, setMorphemes] = createSignal<string[]>([]);
  const [positions, setPositions] = createSignal<string[]>([]);
  const [seriesOptions, setSeriesOptions] = createSignal<string[]>([]);
  const [groupOptions, setGroupOptions] = createSignal<string[]>([]);

  // Results
  const [results, setResults] = createSignal<any>(null);
  const [running, setRunning] = createSignal(false);

  // -------- Load data on mount --------
  createEffect(async () => {
    try {
      const cat = await getAllCatalog().catch(() => [] as any[]);
      setCatalog(cat);

      // static structures
      const g = await getStatic().catch(() => null as any);
      const partsByTestData: Record<string, string[]> = g?.participants_by_test || {};
      setPartsByTest(partsByTestData);

      // augment from search slices (optional)
      try {
        const rows = await searchSlicesRaw().catch(() => [] as any[]);
        if (rows?.length) {
          const base = { ...partsByTestData };
          const map = new Map<string, Set<string>>();
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

      // tests & participants
      setAllTestNames(Object.keys(partsByTestData));

      const allParticipants = await getParticipants().catch(() => [] as string[]);
      setParticipants(allParticipants);

      // QAC map
      const ptab = await getParticipantsTableRaw().catch(() => [] as any[]);
      const qmap: Record<string, boolean> = {};
      for (const r of ptab as any[]) {
        const name = (r.participant ?? r.Participant ?? r.participant_name ?? r.name ?? "").toString();
        if (!name) continue;
        const raw = (r.is_qac ?? r.IS_QAC ?? r.Is_QAC ?? r.IsQAC ?? r.isQAC ?? r.qac ?? "1").toString();
        const val = raw === "1" || raw.toLowerCase?.() === "true";
        qmap[name] = val;
      }
      if (Object.keys(qmap).length === 0) {
        // fallback: TLK311–TLK320 are non‑QAC
        const nq = new Set(Array.from({ length: 10 }, (_, i) => `TLK${311 + i}`));
        const fb: Record<string, boolean> = {};
        for (const p of allParticipants) fb[p] = !nq.has(p);
        setIsQacMap(fb);
      } else setIsQacMap(qmap);

      // meta options
      setTruthValues(Array.from(new Set(cat.map(r => r.truth_value).filter(Boolean))));
      setMorphemes(Array.from(new Set(cat.map(r => r.morpheme).filter(Boolean))));
      setPositions(Array.from(new Set(cat.map(r => r.only_position).filter(Boolean))));
      setSeriesOptions(Array.from(new Set(cat.map(r => r.series).filter(Boolean))));
      setGroupOptions(Array.from(new Set(cat.map(r => r.group).filter(Boolean))));

      // default global selections
      setSelTests(Object.keys(partsByTestData));
      setSelParticipants(allParticipants);
    } catch (err) {
      console.error("Init error", err);
    }
  });

  // Keep group array length in sync with numGroups
  createEffect(() => {
    const n = numGroups();
    const cur = groups();
    if (n > cur.length) {
      const next = [...cur];
      for (let i = cur.length; i < n; i++) next.push(makeEmptyGroup(i));
      setGroups(next);
    } else if (n < cur.length) {
      setGroups(cur.slice(0, n));
    }
  });

  // Sessions: fetch for each selected participant across selected tests
  createEffect(async () => {
    const tests = selTests();
    const parts = selParticipants();
    if (!tests.length || !parts.length) { setSessionsByPart({}); setSelRecordings([]); return; }

    const map: Record<string, Session[]> = {};
    for (const p of parts) {
      const list: Session[] = [];
      for (const t of tests) {
        const sess = await getTimelineRecordings({ testName: t, participants: [p] }).catch(() => [] as any[]);
        for (const s of sess) list.push({ testName: t, timeline: s.timeline, recording: s.recording });
      }
      map[p] = list;
    }
    setSessionsByPart(map);
  });

  // Recording options for globals (show label `participant | timeline`, but value includes recording too)
  const recordingOptionsGlobal = createMemo(() => {
    const parts = selParticipants();
    const opts: { label: string; value: string }[] = [];
    for (const p of parts) {
      for (const s of (sessionsByPart()[p] || [])) {
        const label = `${p} | ${s.timeline}`;
        const value = `${p}|||${s.timeline}|||${s.recording}`;
        opts.push({ label, value });
      }
    }
    // de-dup by value
    const seen = new Set<string>();
    return opts.filter(o => (seen.has(o.value) ? false : (seen.add(o.value), true)));
  });

  // Helpers for toggling AOI keys
  function toggleBlue(key: string) {
    const s = new Set(blueKeys());
    s.has(key) ? s.delete(key) : s.add(key);
    const nextBlue = Array.from(s);
    setBlueKeys(nextBlue);
    // ensure red excludes blue
    setRedKeys(redKeys().filter(k => !nextBlue.includes(k)));
  }
  function toggleRed(key: string) {
    if (blueKeys().includes(key)) return; // cannot add to red if it's in blue
    const s = new Set(redKeys());
    s.has(key) ? s.delete(key) : s.add(key);
    setRedKeys(Array.from(s));
  }

  // Filtered tests per group based on meta filters + global selections
  function filteredTestsForGroup(g: CompareGroup) {
    const allowed = new Set(selTests());
    return selTests().filter(t => {
      if (!allowed.has(t)) return false;
      const row = catalog().find(r => r.test_name === t);
      if (!row) return true;
      const f = g.metaFilters;
      return (
        (f.truthValue === "all" || row.truth_value === f.truthValue) &&
        (f.morpheme === "all" || row.morpheme === f.morpheme) &&
        (f.position === "all" || row.only_position === f.position) &&
        (f.series === "all" || row.series === f.series) &&
        (f.group === "all" || row.group === f.group)
      );
    });
  }

  // Filtered participants per group (subset of global participants that appear in group's tests)
  function filteredParticipantsForGroup(g: CompareGroup) {
    const base = selParticipants();
    if (!g.tests.length) return base;
    const allowed = new Set<string>();
    for (const t of g.tests) for (const p of (partsByTest()[t] || [])) allowed.add(p);
    return base.filter(p => allowed.has(p));
  }

  // Filtered recordings per group (subset of global recordings by group's participants)
  function recordingOptionsForGroup(g: CompareGroup) {
    const parts = new Set(filteredParticipantsForGroup(g));
    const opts = recordingOptionsGlobal()
      .filter(o => parts.has(o.value.split("|||")[0]))
      .filter(o => (selRecordings().length ? selRecordings().includes(o.value) : true));
    return opts;
  }

  // Update a group partially
  function updateGroup(id: string, patch: Partial<CompareGroup>) {
    setGroups(arr => arr.map(g => (g.id === id ? { ...g, ...patch } : g)));
  }

  // -------- Generate comparison --------
  async function generateComparison() {
    setRunning(true);
    setResults(null);

    try {
      const invalid = new Set<InvalidCat>(invalidCats());

      const blueFor = (row: any) => new Set(boxesFor(row, blueKeys() as any));
      const redFor = (row: any) => new Set(boxesFor(row, redKeys().filter(k => !blueKeys().includes(k)) as any));

      const groupsOut: any[] = [];

      for (const g of groups()) {
        // Resolve tests, participants, recordings
        const tests = g.tests.length ? g.tests : filteredTestsForGroup(g);
        const parts = g.participants.length ? g.participants : filteredParticipantsForGroup(g);

        // compute candidate recordings per participant respecting globals & group selection
        const groupRecOpts = recordingOptionsForGroup(g);
        const groupRecSet = new Set(g.recordings.length ? g.recordings : groupRecOpts.map(o => o.value));

        const rows: any[] = [];

        for (const t of tests) {
          const row = catalog().find(r => r.test_name === t);
          if (!row) continue;
          const blueSet = blueFor(row);
          const redSet = redFor(row);

          for (const p of parts) {
            // sessions for this participant in this test
            const sessions = (sessionsByPart()[p] || []).filter(s => s.testName === t);
            for (const s of sessions) {
              const key = `${p}|||${s.timeline}|||${s.recording}`;
              if (!groupRecSet.has(key)) continue;

              const gaze = await getGazeData({ testName: t, participants: [p], timeline: s.timeline, recording: s.recording }).catch(() => [] as any[]);
              if (!gaze.length) continue;

              let blue = 0, red = 0, valid = 0;
              for (const pt of gaze) {
                const box = pt.box_name as string;
                if ((invalid as Set<string>).has(box)) continue;
                valid++;
                if (blueSet.has(box)) blue++;
                else if (redSet.has(box)) red++;
              }
              if (!valid) continue;

              const bluePct = (blue / valid) * 100;
              const redPct = (red / valid) * 100;
              const denom = bluePct + redPct;
              const blueOverRed = denom > 0 ? (bluePct / denom) * 100 : 0;
              const above = blueOverRed >= thresholdPct();

              rows.push({ test: t, participant: p, timeline: s.timeline, recording: s.recording, bluePct, redPct, blueOverRed, aboveThreshold: above });
            }
          }
        }

        const avg = rows.length ? rows.reduce((a, r) => a + r.blueOverRed, 0) / rows.length : 0;
        const pctAbove = rows.length ? (rows.filter(r => r.aboveThreshold).length / rows.length) * 100 : 0;

        groupsOut.push({ group: g.name, n: rows.length, avgBlueOverRed: avg, aboveThresholdPct: pctAbove, rows });
      }

      setResults({ threshold: thresholdPct(), groups: groupsOut });
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  }

  // -------- UI --------
  return (
    <div class="space-y-6">
      {/* Top: Global controls */}
      <Card>
        <CardHeader>
          <CardTitle>Advanced Compare — Cantonese "Only" Comprehension</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          {/* Tests */}
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">Tests ({selTests().length}/{allTestNames().length})</span>
              <div class="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setSelTests(allTestNames())}>All</Button>
                <Button size="sm" variant="outline" onClick={() => setSelTests([])}>None</Button>
              </div>
            </div>
            <Select<string> multiple value={selTests()} onChange={setSelTests} options={allTestNames()}
              itemComponent={(pp) => {
                const tname = pp.item.rawValue as string;
                const plist = (partsByTest()[tname] || []);
                const qmap = isQacMap();
                let q = 0, nq = 0;
                for (const p of plist) { ((p in qmap) ? qmap[p] : true) ? q++ : nq++; }
                return (
                  <SelectItem item={pp.item}>
                    <div class="flex w-full items-center justify-between gap-3">
                      <span class="truncate">{tname}</span>
                      <span class="text-xs text-muted-foreground">Q {q} · NQ {nq}</span>
                    </div>
                  </SelectItem>
                );
              }}
            >
              <SelectTrigger class="w-full"><span>{selTests().length ? `${selTests().length} selected` : 'No tests selected'}</span></SelectTrigger>
              <SelectContent class="max-h-60 overflow-y-auto" />
            </Select>
          </div>

          {/* Participants */}
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">Participants ({selParticipants().length}/{participants().length})</span>
              <div class="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setSelParticipants(participants())}>All</Button>
                <Button size="sm" variant="outline" onClick={() => setSelParticipants([])}>None</Button>
              </div>
            </div>
            <Select<string> multiple value={selParticipants()} onChange={setSelParticipants} options={participants()}
              itemComponent={(pp) => {
                const name = pp.item.rawValue as string;
                const q = (name in isQacMap()) ? isQacMap()[name] : true;
                return (
                  <SelectItem item={pp.item}>
                    <div class="flex w-full items-center justify-between gap-3">
                      <span class="truncate">{name}</span>
                      <span class={`px-1.5 py-0.5 rounded text-[10px] font-medium ${q ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{q ? 'QAC' : 'Non‑QAC'}</span>
                    </div>
                  </SelectItem>
                );
              }}
            >
              <SelectTrigger class="w-full"><span>{selParticipants().length ? `${selParticipants().length} selected` : 'No participants selected'}</span></SelectTrigger>
              <SelectContent class="max-h-60 overflow-y-auto" />
            </Select>
          </div>

          {/* Recordings (Participant | Timeline) */}
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">Recordings (Participant | Timeline)</span>
              <div class="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setSelRecordings(recordingOptionsGlobal().map(o => o.value))}>All</Button>
                <Button size="sm" variant="outline" onClick={() => setSelRecordings([])}>None</Button>
              </div>
            </div>
            <Select<string> multiple value={selRecordings()} onChange={setSelRecordings} options={recordingOptionsGlobal().map(o => o.value)}
              itemComponent={(pp) => {
                const value = pp.item.rawValue as string; // p|||timeline|||recording
                const [p, timeline] = value.split("|||");
                const label = `${p} | ${timeline}`;
                return <SelectItem item={pp.item}><span class="truncate">{label}</span></SelectItem>;
              }}
            >
              <SelectTrigger class="w-full"><span>{selRecordings().length ? `${selRecordings().length} selected` : 'No recordings selected'}</span></SelectTrigger>
              <SelectContent class="max-h-60 overflow-y-auto" />
            </Select>
          </div>

          {/* Number of groups */}
          <div class="flex items-center gap-4">
            <span class="text-sm font-medium">Number of Compare Groups</span>
            <Select<number> value={numGroups()} onChange={setNumGroups} options={[2,3,4,5]} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
              <SelectTrigger class="w-32"><SelectValue>{String(numGroups())}</SelectValue></SelectTrigger>
              <SelectContent />
            </Select>
          </div>

          {/* Threshold slider */}
          <div class="flex items-center gap-4">
            <span class="text-sm font-medium">Blue vs Red Threshold</span>
            <div class="flex-1 max-w-xs">
              <Slider value={[thresholdPct()]} minValue={0} maxValue={100} step={1} onChange={(v) => setThresholdPct(v[0] ?? 50)}>
                <SliderTrack><SliderFill /></SliderTrack>
                <SliderThumb />
              </Slider>
            </div>
            <span class="text-sm font-mono w-12 text-right">{thresholdPct()}%</span>
          </div>
        </CardContent>
      </Card>

      {/* AOI configuration (global) */}
      <Card>
        <CardHeader><CardTitle>AOI Configuration</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-sm">
              <span class="font-medium">Blue (Positive)</span>
              <Button size="sm" variant="outline" onClick={() => { setBlueKeys(ALL_AOI_KEYS.slice()); setRedKeys([]); }}>Enable all</Button>
              <Button size="sm" variant="outline" onClick={() => setBlueKeys([])}>Disable all</Button>
              <Button size="sm" variant="outline" onClick={() => { setBlueKeys(["correct_AOIs"]); setRedKeys(ALL_AOI_KEYS.filter(k => k !== "correct_AOIs")); setInvalidCats(["missing"]); }}>Reset defaults</Button>
            </div>
            <div class="flex flex-wrap gap-2">
              <For each={ALL_AOI_KEYS}>{k => (
                <button class={`px-2 py-0.5 border rounded text-xs ${blueKeys().includes(k) ? 'bg-blue-600 text-white' : 'bg-muted'}`}
                        onClick={() => toggleBlue(k)}>{AOI_KEY_LABEL[k as keyof typeof AOI_KEY_LABEL] || k}</button>
              )}</For>
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex items-center gap-2 text-sm">
              <span class="font-medium">Red (Negative)</span>
              <Button size="sm" variant="outline" onClick={() => setRedKeys(ALL_AOI_KEYS.filter(k => !blueKeys().includes(k)))}>Enable all</Button>
              <Button size="sm" variant="outline" onClick={() => setRedKeys([])}>Disable all</Button>
            </div>
            <div class="flex flex-wrap gap-2">
              <For each={ALL_AOI_KEYS.filter(k => !blueKeys().includes(k))}>{k => (
                <button class={`px-2 py-0.5 border rounded text-xs ${redKeys().includes(k) ? 'bg-rose-600 text-white' : 'bg-muted'}`}
                        onClick={() => toggleRed(k)}>{AOI_KEY_LABEL[k as keyof typeof AOI_KEY_LABEL] || k}</button>
              )}</For>
            </div>
          </div>

          <div class="flex items-center gap-3 text-xs mt-2">
            <label class="inline-flex items-center gap-1"><input type="checkbox" checked={invalidCats().includes('missing')} onChange={(e) => {
              const s = new Set(invalidCats()); e.currentTarget.checked ? s.add('missing') : s.delete('missing'); setInvalidCats(Array.from(s) as InvalidCat[]);
            }} /> missing</label>
            <label class="inline-flex items-center gap-1"><input type="checkbox" checked={invalidCats().includes('out_of_screen')} onChange={(e) => {
              const s = new Set(invalidCats()); e.currentTarget.checked ? s.add('out_of_screen') : s.delete('out_of_screen'); setInvalidCats(Array.from(s) as InvalidCat[]);
            }} /> out_of_screen</label>
            <label class="inline-flex items-center gap-1"><input type="checkbox" checked={invalidCats().includes('other')} onChange={(e) => {
              const s = new Set(invalidCats()); e.currentTarget.checked ? s.add('other') : s.delete('other'); setInvalidCats(Array.from(s) as InvalidCat[]);
            }} /> other</label>
          </div>
          <div class="text-[11px] text-muted-foreground">Defaults: Blue = <code>correct_AOIs</code>; Red = remaining AOIs; Invalid = <code>missing</code>.</div>
        </CardContent>
      </Card>

      {/* Groups */}
      <For each={groups()}>{(g) => (
        <Card>
          <CardHeader><CardTitle>{g.name}</CardTitle></CardHeader>
          <CardContent class="space-y-4">
            {/* Group tests */}
            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-between"><span class="text-sm font-medium">Tests (filtered by global & meta)</span>
                <div class="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => updateGroup(g.id, { tests: filteredTestsForGroup(g) })}>All</Button>
                  <Button size="sm" variant="outline" onClick={() => updateGroup(g.id, { tests: [] })}>None</Button>
                </div>
              </div>
              <Select<string> multiple value={g.tests} onChange={(v) => updateGroup(g.id, { tests: v })} options={filteredTestsForGroup(g)} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                <SelectTrigger class="w-full"><span>{g.tests.length ? `${g.tests.length} selected` : 'No tests'}</span></SelectTrigger>
                <SelectContent class="max-h-60 overflow-y-auto" />
              </Select>
            </div>

            {/* Group participants */}
            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-between"><span class="text-sm font-medium">Participants (filtered by global & tests)</span>
                <div class="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => updateGroup(g.id, { participants: filteredParticipantsForGroup(g) })}>All</Button>
                  <Button size="sm" variant="outline" onClick={() => updateGroup(g.id, { participants: [] })}>None</Button>
                </div>
              </div>
              <Select<string> multiple value={g.participants} onChange={(v) => updateGroup(g.id, { participants: v })} options={filteredParticipantsForGroup(g)}
                itemComponent={(pp) => {
                  const name = pp.item.rawValue as string;
                  const q = (name in isQacMap()) ? isQacMap()[name] : true;
                  return (
                    <SelectItem item={pp.item}>
                      <div class="flex w-full items-center justify-between gap-3">
                        <span class="truncate">{name}</span>
                        <span class={`px-1.5 py-0.5 rounded text-[10px] font-medium ${q ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{q ? 'QAC' : 'Non‑QAC'}</span>
                      </div>
                    </SelectItem>
                  );
                }}
              >
                <SelectTrigger class="w-full"><span>{g.participants.length ? `${g.participants.length} selected` : 'No participants'}</span></SelectTrigger>
                <SelectContent class="max-h-60 overflow-y-auto" />
              </Select>
            </div>

            {/* Group recordings */}
            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-between"><span class="text-sm font-medium">Recordings (Participant | Timeline)</span>
                <div class="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => updateGroup(g.id, { recordings: recordingOptionsForGroup(g).map(o => o.value) })}>All</Button>
                  <Button size="sm" variant="outline" onClick={() => updateGroup(g.id, { recordings: [] })}>None</Button>
                </div>
              </div>
              <Select<string> multiple value={g.recordings} onChange={(v) => updateGroup(g.id, { recordings: v })} options={recordingOptionsForGroup(g).map(o => o.value)}
                itemComponent={(pp) => {
                  const value = pp.item.rawValue as string;
                  const [p, timeline] = value.split("|||");
                  return (<SelectItem item={pp.item}><span class="truncate">{p} | {timeline}</span></SelectItem>);
                }}
              >
                <SelectTrigger class="w-full"><span>{g.recordings.length ? `${g.recordings.length} selected` : 'No recordings'}</span></SelectTrigger>
                <SelectContent class="max-h-60 overflow-y-auto" />
              </Select>
            </div>

            {/* Meta filters */}
            <div class="grid md:grid-cols-3 gap-3">
              <div class="flex flex-col gap-1 text-sm">
                <span class="text-xs text-muted-foreground">Truth</span>
                <Select<string> value={g.metaFilters.truthValue} onChange={(v) => updateGroup(g.id, { metaFilters: { ...g.metaFilters, truthValue: v || 'all' } })} options={["all", ...truthValues()]} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-full"><SelectValue>{g.metaFilters.truthValue}</SelectValue></SelectTrigger>
                  <SelectContent />
                </Select>
              </div>
              <div class="flex flex-col gap-1 text-sm">
                <span class="text-xs text-muted-foreground">Morpheme</span>
                <Select<string> value={g.metaFilters.morpheme} onChange={(v) => updateGroup(g.id, { metaFilters: { ...g.metaFilters, morpheme: v || 'all' } })} options={["all", ...morphemes()]} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-full"><SelectValue>{g.metaFilters.morpheme}</SelectValue></SelectTrigger>
                  <SelectContent />
                </Select>
              </div>
              <div class="flex flex-col gap-1 text-sm">
                <span class="text-xs text-muted-foreground">Position</span>
                <Select<string> value={g.metaFilters.position} onChange={(v) => updateGroup(g.id, { metaFilters: { ...g.metaFilters, position: v || 'all' } })} options={["all", ...positions()]} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-full"><SelectValue>{g.metaFilters.position}</SelectValue></SelectTrigger>
                  <SelectContent />
                </Select>
              </div>
              <div class="flex flex-col gap-1 text-sm">
                <span class="text-xs text-muted-foreground">Series</span>
                <Select<string> value={g.metaFilters.series} onChange={(v) => updateGroup(g.id, { metaFilters: { ...g.metaFilters, series: v || 'all' } })} options={["all", ...seriesOptions()]} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-full"><SelectValue>{g.metaFilters.series}</SelectValue></SelectTrigger>
                  <SelectContent />
                </Select>
              </div>
              <div class="flex flex-col gap-1 text-sm">
                <span class="text-xs text-muted-foreground">Group</span>
                <Select<string> value={g.metaFilters.group} onChange={(v) => updateGroup(g.id, { metaFilters: { ...g.metaFilters, group: v || 'all' } })} options={["all", ...groupOptions()]} itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}>
                  <SelectTrigger class="w-full"><SelectValue>{g.metaFilters.group}</SelectValue></SelectTrigger>
                  <SelectContent />
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}</For>

      {/* Generate */}
      <div class="flex justify-end">
        <Button onClick={generateComparison} disabled={running() || !selTests().length || !selParticipants().length}>
          {running() ? 'Generating…' : 'Generate Comparison'}
        </Button>
      </div>

      {/* Results */}
      <Show when={results()}>
        <Card>
          <CardHeader><CardTitle>Comparison Results</CardTitle></CardHeader>
          <CardContent>
            <JsonViewer data={results()} />
          </CardContent>
        </Card>
      </Show>
    </div>
  );
}
