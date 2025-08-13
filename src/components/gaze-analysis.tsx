/* ──  src/components/gaze-analysis.tsx  ─────────────────────────────── */
import { createSignal, createEffect, createMemo, For, Show, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LineChart, PieChart } from "@/components/ui/charts";
import { NumberField, NumberFieldInput } from "@/components/ui/number-field";
import { Button } from "@/components/ui/button";
import { Chart as ChartJS } from "chart.js";
import type { ChartOptions, ChartData } from "chart.js";

/* ── data types ─ */
interface GazeData {
  gaze_x: number | null; gaze_y: number | null;
  box_name: string;      timestamp: string;
  participant: string;   test_name: string;
  recording?: string;    // backend already returns "Recording name" -> we alias into this
}
interface SelectOption { label:string; value:string; }
export interface WordWindow {
  chinese_word:string; start_sec:number; end_sec:number;
  test_name:string;    timeline:string;
}
type BoxTypes =
  | "Animal 1" | "Object 1 for Animal 1" | "Object 2 for Animal 1"
  | "Animal 2" | "Object 1 for Animal 2" | "Object 2 for Animal 2"
  | "Animal 3" | "Object 1 for Animal 3" | "Object 2 for Animal 3"
  | "other" | "missing" | "out_of_screen";

/* backend catalog row (minimal for the extra filters) */
type CatalogRow = {
  test_name: string;
  group?: string | null;
  correct_AOIs?: string | null;
  potentially_correct_AOIs?: string | null;
  incorrect_AOIs?: string | null;
  correct_NULL?: string | null;
  potentially_correct_NULL?: string | null;
  incorrect_NULL?: string | null;
};

/* recordings table row (we only need recording + % string/number) */
type RecordingRow = {
  recording: string;
  gaze_samples?: number | string | null;
};

/* ── defaults ─ */
const DEF_INTERVAL_MS = 100;
const DEF_PX_PER_SEC  = 40;
const DEF_SPAN_SEC    = 15;
const DEF_VIEW_SEC    = 15;

/* ── AOI colours ─ */
const DEFAULT_COLORS: Record<BoxTypes,string> = {
  "Animal 1":"red","Object 1 for Animal 1":"darkred","Object 2 for Animal 1":"firebrick",
  "Animal 2":"blue","Object 1 for Animal 2":"darkblue","Object 2 for Animal 2":"royalblue",
  "Animal 3":"green","Object 1 for Animal 3":"darkgreen","Object 2 for Animal 3":"limegreen",
  "other":"grey","missing":"#999999","out_of_screen":"#666666",
};
const BASE = {A1:"red",A2:"blue",A3:"green"} as const;

/* helper: style per series */
const styleForBox = (b:BoxTypes) => ({
  base: b.includes("Animal 1")?BASE.A1:b.includes("Animal 2")?BASE.A2:
        b.includes("Animal 3")?BASE.A3:"#777",
  dash: b.startsWith("Object 1")?[12,6]:b.startsWith("Object 2")?[4,4]:[]
});

/* AOI code → label */
const CODE_TO_BOX: Record<string, BoxTypes> = {
  S1:"Animal 1", S2:"Animal 2", S3:"Animal 3",
  O1A:"Object 1 for Animal 1", O1B:"Object 2 for Animal 1",
  O2A:"Object 1 for Animal 2", O2B:"Object 2 for Animal 2",
  O3A:"Object 1 for Animal 3", O3B:"Object 2 for Animal 3",
};
function parseAOISet(s?: string | null): BoxTypes[] {
  if (!s) return [];
  return s.replace(/[，；]/g, ",")
    .split(/[,\s]+/)
    .map(t => t.trim().toUpperCase())
    .filter(Boolean)
    .map(code => CODE_TO_BOX[code])
    .filter((v): v is BoxTypes => !!v);
}

/* ───────────────────────────────────────────────────────────────────── */
const GazeAnalysis = () => {
/* reactive state */
const [selectedTest, setSelectedTest] = createSignal<SelectOption|null>(null);
const [selectedPart, setSelectedPart] = createSignal<SelectOption|null>(null);

const [tests,setTests]               = createSignal<SelectOption[]>([]);
const [participants,setParticipants] = createSignal<SelectOption[]>([]);

const [gaze,setGaze]              = createSignal<GazeData[]>([]);
const [boxStats,setBoxStats]      = createSignal<Record<string,number>>({});
const [rows,setRows]              = createSignal<any[]>([]);
const [intervalMs,setIntervalMs]  = createSignal(DEF_INTERVAL_MS);

const [pxPerSec,setPxPerSec]      = createSignal(DEF_PX_PER_SEC);
const [spanSec,setSpanSec]        = createSignal(DEF_SPAN_SEC);
const [viewSec,setViewSec]        = createSignal(DEF_VIEW_SEC);

const [wordWin,setWordWin]        = createSignal<WordWindow[]>([]);
const [canvasRef,setCanvasRef]    = createSignal<HTMLCanvasElement|null>(null);
const [testImgB64, setTestImgB64] = createSignal<string | null>(null);

/* “volume” slider: recording quality threshold */
const [minValidPct, setMinValidPct] = createSignal(0);            // 0–100
const [recordingPct, setRecordingPct] = createSignal<number|null>(null);
const [recordingName, setRecordingName] = createSignal<string|null>(null);
const [blockedByQuality, setBlockedByQuality] = createSignal(false);

/* recordings index: recording -> valid% parsed from "Gaze samples" */
const [recIndex, setRecIndex] = createSignal<Record<string, number>>({});

/* ⏯ replay state */
const [isPlaying,   setIsPlaying]   = createSignal(false);
const [curTime,     setCurTime]     = createSignal(0);
const [duration,    setDuration]    = createSignal(0);
const [replayReady, setReplayReady] = createSignal(false);
let   raf = 0; let playStart = 0;

/* replay state & derived word */
const [playSec,  setPlaySec ] = createSignal(0);
const currentWordWindow = createMemo<WordWindow | null>(() => {
  const t = playSec();
  return wordWin().find(w => t >= w.start_sec && t <= w.end_sec) ?? null;
});
const currentWord = createMemo(() =>
  currentWordWindow() ? currentWordWindow()!.chinese_word : null
);

/* validity statistics */
const [statsWhole , setStatsWhole ] = createSignal({
  pct_including_missing     : 0,   // #1
  pct_excluding_missing     : 0,   // #2
  pct_excluding_missing_oob : 0,   // #3
});
const [winPctValid, setWinPctValid] = createSignal(0);  // #4 (word window)

/* meta filtering (truth/morpheme/position/series/case) */
interface TestMeta {
  test_name: string;
  truth_value?: string | null;
  only_position?: string | null;
  morpheme?: string | null;
  series?: string | null;
  case_no?: number | null;
}
const [allMeta,setAllMeta] = createSignal<TestMeta[]>([]);
const [truths,setTruths]   = createSignal<string[]>([]);
const [morphs,setMorphs]   = createSignal<string[]>([]);
const [poss,setPoss]       = createSignal<string[]>([]);
const [series,setSeries]   = createSignal<string[]>([]);
const [truthF,setTruthF]   = createSignal("all");
const [morphF,setMorphemeF]= createSignal("all");
const [posF,setPosF]       = createSignal("all");
const [seriesF,setSeriesF] = createSignal("all");

/* NEW: group filter and catalog (for AOI sets) */
const [catalog, setCatalog] = createSignal<CatalogRow[]>([]);
const catalogByTest = createMemo(() => new Map(catalog().map(r => [r.test_name, r])));
const [groups, setGroups]   = createSignal<string[]>([]);
const [groupF, setGroupF]   = createSignal("all");

/* AOI-set toggles */
type MetaKey =
  | "correct_AOIs" | "potentially_correct_AOIs" | "incorrect_AOIs"
  | "correct_NULL" | "potentially_correct_NULL" | "incorrect_NULL";
const META_KEYS: MetaKey[] = [
  "correct_AOIs", "potentially_correct_AOIs", "incorrect_AOIs",
  "correct_NULL", "potentially_correct_NULL", "incorrect_NULL",
];
const [activeMetaFilters, setActiveMetaFilters] = createSignal<Set<MetaKey>>(new Set());
function toggleMeta(k: MetaKey) {
  const s = new Set(activeMetaFilters());
  s.has(k) ? s.delete(k) : s.add(k);
  setActiveMetaFilters(s);
}
const selectedBoxes = createMemo<Set<BoxTypes>>(() => {
  const row = selectedTest() ? catalogByTest().get(selectedTest()!.value) : undefined;
  if (!row) return new Set();
  const sel = activeMetaFilters();
  if (sel.size === 0) return new Set(); // show all
  const out = new Set<BoxTypes>();
  const add = (codes?: string | null) => parseAOISet(codes).forEach(b => out.add(b));
  if (sel.has("correct_AOIs"))             add(row.correct_AOIs);
  if (sel.has("potentially_correct_AOIs")) add(row.potentially_correct_AOIs);
  if (sel.has("incorrect_AOIs"))           add(row.incorrect_AOIs);
  if (sel.has("correct_NULL"))             add(row.correct_NULL);
  if (sel.has("potentially_correct_NULL")) add(row.potentially_correct_NULL);
  if (sel.has("incorrect_NULL"))           add(row.incorrect_NULL);
  return out;
});

/* AOI-set → box lists for selected test (used by new chart) */
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

/* fetch meta (truth/morph/pos/series) */
createEffect(async () => {
  const meta = await invoke<TestMeta[]>("get_all_test_meta").catch(() => []);
  setAllMeta(meta);
  setTruths (Array.from(new Set(meta.map(m=>m.truth_value).filter(Boolean))) as string[]);
  setMorphs (Array.from(new Set(meta.map(m=>m.morpheme   ).filter(Boolean))) as string[]);
  setPoss   (Array.from(new Set(meta.map(m=>m.only_position).filter(Boolean))) as string[]);
  setSeries (Array.from(new Set(meta.map(m=>m.series).filter(Boolean))) as string[]);
});

/* fetch catalog (group + AOI sets) */
createEffect(async () => {
  const rows = await invoke<CatalogRow[]>("get_all_test_catelog").catch(() => []);
  setCatalog(rows);
  setGroups(Array.from(new Set(rows.map(r => r.group).filter(Boolean))) as string[]);
});

/* fetch recordings and build index (recording → valid %) */
createEffect(async () => {
  const recs = await invoke<RecordingRow[]>("get_all_recordings").catch(()=>[]);
  const idx: Record<string,number> = {};
  for (const r of recs) {
    const v = parsePercent(r.gaze_samples);
    if (v !== null) idx[r.recording] = v;
  }
  setRecIndex(idx);
});
function parsePercent(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    if (v <= 1) return Math.round(v*100); // just in case they’re fractions
    return Math.min(100, Math.max(0, Math.round(v)));
  }
  const m = String(v).trim().match(/([\d.]+)/);
  return m ? Math.min(100, Math.max(0, Math.round(parseFloat(m[1])))) : null;
}

/* filtered tests memo */
const filteredTests = createMemo(() => {
  const byName = catalogByTest();
  return allMeta()
    .filter(m=>truthF()==="all" || m.truth_value===truthF())
    .filter(m=>morphF()==="all" || m.morpheme===morphF())
    .filter(m=>posF()==="all"   || m.only_position===posF())
    .filter(m=>seriesF()==="all"|| m.series===seriesF())
    .filter(m=> groupF()==="all" ? true : byName.get(m.test_name)?.group === groupF())
    .map(m=>m.test_name);
});

/* AOI override colours (optional aoi_map) */
createEffect(async () => {
  if (!selectedTest()) return;
  const rows = await invoke<{region_id:string;rgb_hex?:string|null}[]>(
    "get_aoi_map", { testName: selectedTest()!.value }
  ).catch(() => []);
  const m = {...DEFAULT_COLORS};
  rows.forEach(r=>{
    if(r.rgb_hex) {
      const id = r.region_id as keyof typeof DEFAULT_COLORS;
      if(id in m) m[id] = `#${r.rgb_hex}`;
    }
  });
  setColorMap(m);
});
const [colorMap,setColorMap] = createSignal<Record<BoxTypes,string>>(DEFAULT_COLORS);
const COLORS = () => colorMap();

/* keep x scale in sync with “viewSec” */
createEffect(() => {
  const ch = canvasRef() && ChartJS.getChart(canvasRef()!);
  if (!ch) return;
  const s = viewSec();
  (ch.options.scales!.x as any).min = 0;
  (ch.options.scales!.x as any).max = s;
  ch.update();
});

/* test image */
createEffect(async () => {
  if (!selectedTest()) { setTestImgB64(null); return; }
  const b64 = await invoke<string | null>("get_test_image",
               { testName: selectedTest()!.value }).catch(() => null);
  setTestImgB64(b64);
});
const imgUrl = createMemo(() =>
  testImgB64() ? `data:image/png;base64,${testImgB64()}` : null);

/* base time helpers */
const baseMs = () => gaze().length ? +new Date(gaze()[0].timestamp) : 0;
const [xRange,setXRange] = createSignal<[number,number]|null>(null);
const dynWidth = () =>
  Math.max((xRange()?.[1]??0)-(xRange()?.[0]??0),spanSec())*pxPerSec();

/* chart options */
const chartOpts = createMemo<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  scales: { x: { type: 'linear', min: 0, max: viewSec(), ticks: { maxTicksLimit: 10 } },
            y: { beginAtZero: true, max: 100 } },
  plugins: {
    legend: {
      position: 'top'  as const,
      align:    'start' as const,
      labels: {
        usePointStyle: true, boxWidth: 8, font: { size: 10 },
        filter: (l: any, d: any) => !(d.datasets?.[l.datasetIndex]?._window),
      },
    },
    tooltip:{ mode:"index",intersect:false,
      filter:(c:any)=>!(c.dataset?._window)&&c.parsed?.y!==0,
      itemSort:(a:any,b:any)=>b.parsed.y-a.parsed.y,
      callbacks:{label:(c:any)=>`${c.dataset.label}: ${c.parsed.y.toFixed(1)}%`}},
    annotation:{annotations: annotate()}
  }
}));

/* fetch lists once */
createEffect(async()=>{
  setTests((await invoke<string[]>("get_test_names")).map(t=>({label:t,value:t})));
  setParticipants((await invoke<string[]>("get_participants")).map(p=>({label:p,value:p})));
});

/* ── fetch gaze + stats when selection changes ─ */
createEffect(async()=>{
  if(!selectedTest()||!selectedPart()) return;

  const data = await invoke<GazeData[]>("get_gaze_data",{
    testName:selectedTest()!.value,
    participants:[selectedPart()!.value]
  }).catch(()=>[]);

  // record the recording name used by this selection
  const rec = data.length ? (data[0] as any).recording || (data[0] as any).recording_name || (data[0] as any)["Recording name"] : null;
  setRecordingName(rec ?? null);
  const pct = rec ? recIndex()[rec] ?? null : null;
  setRecordingPct(pct);

  // apply “Min recording valid %” filter
  const blocked = pct !== null && pct < minValidPct();
  setBlockedByQuality(blocked);
  setGaze(blocked ? [] : data);

  const stats = await invoke<{box_percentages:Record<string,number>}>("get_box_stats",{
    testName:selectedTest()!.value,participants:[selectedPart()!.value]
  }).catch(()=>({box_percentages:{}}));
  setBoxStats(blocked ? {} : stats.box_percentages);
  setStatsWhole(blocked ? {pct_including_missing:0,pct_excluding_missing:0,pct_excluding_missing_oob:0}
                         : calcWholeStats(data));
});

/* re-apply quality block when slider changes */
createEffect(()=>{
  const pct = recordingPct();
  if (pct === null) return;
  const blocked = pct < minValidPct();
  setBlockedByQuality(blocked);
  // do not refetch; just clear / restore rows from last fetch
  if (blocked) { setGaze([]); setBoxStats({}); setRows([]); }
});

/* replay frames based on gaze data + image */
const replayPoints = createMemo(() => {
  if (!gaze().length || !testImgB64()) return [];
  const pts = gaze()
    .filter(g => g.gaze_x !== null && g.gaze_y !== null &&
                 g.box_name !== "missing" && g.box_name !== "out_of_screen")
    .map(g => ({
      t: (+new Date(g.timestamp) - baseMs()) / 1000,
      x: g.gaze_x as number,
      y: g.gaze_y as number,
    }));
  if (pts.length) {
    setDuration(pts[pts.length - 1].t);
    setCurTime(0);
    setReplayReady(true);
  } else {
    setReplayReady(false);
  }
  return pts;
});

/* build time-bins (% per box) */
createEffect(()=>{
  if(!gaze().length){ setRows([]); setXRange(null); return; }
  const ms = intervalMs();
  const bins:Record<number,any>={};
  [...gaze()].sort((a,b)=>+new Date(a.timestamp)-+new Date(b.timestamp))
    .forEach(pt=>{
      const k=Math.floor(+new Date(pt.timestamp)/ms)*ms;
      bins[k] ??= {timestamp:k,total:0,
                   ...Object.fromEntries(Object.keys(DEFAULT_COLORS).map(b=>[b,0]))};
      bins[k][pt.box_name]++; bins[k].total++;
    });
  const r=Object.values(bins).map(g=>{
    const o:Record<string,any>={timestamp:new Date(g.timestamp).toISOString()};
    Object.keys(DEFAULT_COLORS).forEach(b=>o[b]=g.total?(g[b]||0)/g.total*100:0);
    return o;
  }).sort((a,b)=>+new Date(a.timestamp)-+new Date(b.timestamp));
  setRows(r);
  const xs=r.map(v=>(+new Date(v.timestamp)-baseMs())/1000);
  setXRange(xs.length?[Math.min(...xs),Math.max(...xs)]:null);
});

/* fetch word windows */
createEffect(async()=>{
  if(!selectedTest()) return setWordWin([]);
  const ww=await invoke<WordWindow[]>("get_word_windows",{testName:selectedTest()!.value})
           .catch(()=>[]);
  setWordWin(ww);
});

/* whole-recording stats */
function calcWholeStats(samples: GazeData[]) {
  const total          = samples.length;
  const missing        = samples.filter(s => s.box_name === "missing").length;
  const outOfScreen    = samples.filter(s => s.box_name === "out_of_screen").length;
  const inAoi          = samples.filter(s =>
      !["missing","out_of_screen","other"].includes(s.box_name)).length;
  const pct1 = total ? ((total - missing) / total) * 100 : 0;
  const denom2 = total - missing;
  const pct2   = denom2 ? ((denom2 - outOfScreen) / denom2) * 100 : 0;
  const pct3   = denom2 ? (inAoi / denom2) * 100 : 0;
  return { pct_including_missing:pct1, pct_excluding_missing:pct2, pct_excluding_missing_oob:pct3 };
}

/* play/pause/stop */
function play() {
  if (!replayReady()) return;
  playStart = performance.now() - curTime() * 1000;
  setIsPlaying(true);
  loop();
}
function pause() { setIsPlaying(false); cancelAnimationFrame(raf); }
function stop()  { pause(); setCurTime(0); drawFrame(0); }
function loop()  {
  if (!isPlaying()) return;
  const t = (performance.now() - playStart) / 1000;
  if (t >= duration()) { stop(); return; }
  setCurTime(t); drawFrame(t); raf = requestAnimationFrame(loop);
}
onCleanup(() => cancelAnimationFrame(raf));

let canvasEl: HTMLCanvasElement | null = null;
let imgEl: HTMLImageElement | null = null;

/* heat-map colour by time */
const HUE_START = 220; const HUE_END = 0;
function timeColor(norm: number) {
  const hue = HUE_START + (HUE_END - HUE_START) * norm;
  return `hsl(${hue},100%,50%)`;
}

/* draw current replay frame */
function drawFrame(sec: number) {
  setPlaySec(sec);
  if (currentWord()) {
    const w = currentWordWindow()!;
    const ptsInWin = gaze().filter(g => {
      const t = (+new Date(g.timestamp) - baseMs())/1000;
      return t >= w.start_sec && t <= w.end_sec;
    });
    const valid = ptsInWin.filter(p => p.box_name !== "missing").length;
    setWinPctValid(ptsInWin.length ? (valid / ptsInWin.length) * 100 : 0);
  } else setWinPctValid(0);

  if (!canvasEl || !imgEl) return;
  const ctx = canvasEl.getContext("2d")!;
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  const scaleX = canvasEl.width  / 1920;
  const scaleY = canvasEl.height / 1080;

  for (const p of replayPoints()) {
    if (p.t > sec) break;
    const frac = duration() ? p.t / duration() : 0;
    ctx.beginPath();
    ctx.arc(p.x * scaleX, p.y * scaleY, 4, 0, Math.PI * 2);
    ctx.fillStyle = timeColor(frac);
    ctx.fill();
  }
}

/* ── helpers to build charts ─ */
const buildChart = ():ChartData=>{
  const dat=rows().map(r=>({t:(+new Date(r.timestamp)-baseMs())/1000,...r}));
  const ds = Object.keys(DEFAULT_COLORS).map(b=>{
    const {base,dash}=styleForBox(b as BoxTypes);
    const hide = selectedBoxes().size ? !selectedBoxes().has(b as BoxTypes) : false;
    return {label:b,data:dat.map(r=>({x:r.t,y:r[b]||0})),
      borderColor:base,backgroundColor:"transparent",
      borderDash:dash,borderWidth:1,pointRadius:1,tension:0.2,fill:false,hidden:hide};
  });
  const ws = !baseMs()?[]:wordWin().flatMap(w=>{
    const make=(x:number,tg:string)=>({
      label:`${w.chinese_word} (${tg})`,
      data:[{x, y:0},{x, y:100}],borderColor:"#222",borderDash:[4,4],
      borderWidth:1,pointRadius:0,fill:false,order:0,_window:true});
    return [make(w.start_sec,"start"),make(w.end_sec,"end")];
  });
  return {datasets:[...ds,...ws]};
};

const getPie = ():ChartData=>({
  labels:Object.keys(boxStats()),
  datasets:[{data:Object.values(boxStats()),
    backgroundColor:Object.keys(boxStats()).map(k=>COLORS()[k as BoxTypes])}]
});

const getPath = ():ChartData=>({
  datasets:[{label:"Gaze Path",
    data:gaze().filter(d=>d.gaze_x!==null&&d.gaze_y!==null)
               .map(d=>({x:d.gaze_x!,y:d.gaze_y!})),
    borderColor:"#8884d8",pointRadius:0,fill:false,borderWidth:1}]});

/* label annotations */
function annotate(){
  const a:Record<string,any>={};
  wordWin().forEach((w,i)=>{
    const mid=(w.start_sec+w.end_sec)/2;
    a[`word_${i}`]={type:"label",xValue:mid,yValue:98,content:[w.chinese_word],
      font:{size:11,weight:"bold"},borderWidth:0,backgroundColor:"rgba(0,0,0,0)"};});
  return a;
}

/* NEW: AOI sets over time (sum of member boxes) */
const buildAoiSetChart = (): ChartData => {
  const dat=rows().map(r=>({t:(+new Date(r.timestamp)-baseMs())/1000,...r}));
  const sets = metaBoxSets();
  const mk = (label:string, boxes:Set<BoxTypes>, color:string, dash:number[] = []) => {
    if (!boxes.size) return null; // skip empty sets for this test
    const data = dat.map(r=>{
      let sum=0;
      boxes.forEach(b => sum += (r[b] ?? 0));
      return {x:r.t, y:sum};
    });
    return {label, data, borderColor:color, backgroundColor:"transparent",
            borderDash:dash, borderWidth:1, pointRadius:1, tension:0.2, fill:false};
  };
  const d = [
    mk("correct_AOIs",             sets.correct_AOIs,             "green"),
    mk("potentially_correct_AOIs", sets.potentially_correct_AOIs, "teal", [6,4]),
    mk("incorrect_AOIs",           sets.incorrect_AOIs,           "red"),
    mk("correct_NULL",             sets.correct_NULL,             "#444", [2,2]),
    mk("potentially_correct_NULL", sets.potentially_correct_NULL, "#777", [8,4]),
    mk("incorrect_NULL",           sets.incorrect_NULL,           "orange"),
  ].filter(Boolean) as any[];
  return { datasets: d };
};

/* reset controls */
function reset(){
  setIntervalMs(DEF_INTERVAL_MS);
  setPxPerSec (DEF_PX_PER_SEC);
  setSpanSec  (DEF_SPAN_SEC);
  setViewSec  (DEF_VIEW_SEC);
  setMinValidPct(0);
}

/* ────────────────────────── render ───────────────────────── */
return (
<div class="space-y-6">

  {/* controls */}
  <div class="flex flex-wrap items-end gap-3">

    {/* truth filter */}
    <Select<string>
      value={truthF()}
      onChange={setTruthF}
      options={["all", ...truths()]}
      itemComponent={p => (
        <SelectItem item={p.item}>
          {p.item.rawValue === "all" ? "all truth values" : p.item.rawValue}
        </SelectItem>
      )}
    >
      <SelectTrigger class="w-28">
        <SelectValue>{truthF() === "all" ? "all truth values" : truthF()}</SelectValue>
      </SelectTrigger>
      <SelectContent />
    </Select>

    {/* morpheme filter */}
    <Select<string>
      value={morphF()}
      onChange={setMorphemeF}
      options={["all", ...morphs()]}
      itemComponent={p => (
        <SelectItem item={p.item}>
          {p.item.rawValue === "all" ? "all morphemes" : p.item.rawValue}
        </SelectItem>
      )}
    >
      <SelectTrigger class="w-28">
        <SelectValue>{morphF() === "all" ? "all morphemes" : morphF()}</SelectValue>
      </SelectTrigger>
      <SelectContent />
    </Select>

    {/* position filter */}
    <Select<string>
      value={posF()}
      onChange={setPosF}
      options={["all", ...poss()]}
      itemComponent={p => (
        <SelectItem item={p.item}>
          {p.item.rawValue === "all" ? "all positions" : p.item.rawValue}
        </SelectItem>
      )}
    >
      <SelectTrigger class="w-28">
        <SelectValue>{posF() === "all" ? "all positions" : posF()}</SelectValue>
      </SelectTrigger>
      <SelectContent />
    </Select>

    {/* series filter */}
    <Select<string>
      value={seriesF()}
      onChange={setSeriesF}
      options={["all", ...series()]}
      itemComponent={p => (
        <SelectItem item={p.item}>
          {p.item.rawValue === "all" ? "all series" : p.item.rawValue}
        </SelectItem>
      )}
    >
      <SelectTrigger class="w-28">
        <SelectValue>{seriesF() === "all" ? "all series" : seriesF()}</SelectValue>
      </SelectTrigger>
      <SelectContent />
    </Select>

    {/* NEW: group filter */}
    <Select<string>
      value={groupF()}
      onChange={setGroupF}
      options={["all", ...groups()]}
      itemComponent={p => (
        <SelectItem item={p.item}>
          {p.item.rawValue === "all" ? "all groups" : p.item.rawValue}
        </SelectItem>
      )}
    >
      <SelectTrigger class="w-28">
        <SelectValue>{groupF() === "all" ? "all groups" : groupF()}</SelectValue>
      </SelectTrigger>
      <SelectContent />
    </Select>

    {/* test selector (uses filteredTests) */}
    <Select<string>
      value={selectedTest()?.value ?? ""}
      onChange={v => setSelectedTest(v ? { label: v, value: v } : null)}
      options={filteredTests()}
      placeholder="Select test…"
      itemComponent={p=><SelectItem item={p.item}>{p.item.rawValue}</SelectItem>}>
      <SelectTrigger class="w-64">
        <SelectValue>{()=>selectedTest()?.label||"Select test…"}</SelectValue>
      </SelectTrigger><SelectContent/>
    </Select>

    {/* participant – single select */}
    <Select<string>
      value={selectedPart()?.value ?? ""}
      onChange={v=>setSelectedPart(participants().find(o=>o.value===v)??null)}
      options={participants().map(p=>p.value)} placeholder="Select participant…"
      itemComponent={p=><SelectItem item={p.item}>
        {participants().find(t=>t.value===p.item.rawValue)?.label || p.item.rawValue}
      </SelectItem>}>
      <SelectTrigger class="w-64">
        <SelectValue>{()=>selectedPart()?.label||"Select participant…"}</SelectValue>
      </SelectTrigger><SelectContent/>
    </Select>

    {/* numeric controls */}
    <label class="text-sm flex items-center gap-1">
      Sampling&nbsp;interval&nbsp;(ms):
      <NumberField value={intervalMs()} class="w-20">
        <NumberFieldInput min={1}
          onInput={e=>setIntervalMs(+e.currentTarget.value||1)}/>
      </NumberField>
    </label>

    <label class="text-sm flex items-center gap-1">
      Horizontal&nbsp;scale&nbsp;(px&nbsp;/&nbsp;s):
      <NumberField value={pxPerSec()} class="w-20">
        <NumberFieldInput min={5} max={200}
          onInput={e=>setPxPerSec(+e.currentTarget.value||1)}/>
      </NumberField>
    </label>

    <label class="text-sm flex items-center gap-1">
      Timeline&nbsp;span&nbsp;(s):
      <NumberField value={spanSec()} class="w-20">
        <NumberFieldInput min={1} max={300}
          onInput={e=>setSpanSec(+e.currentTarget.value||1)}/>
      </NumberField>
    </label>

    <label class="text-sm flex items-center gap-1">
      Current&nbsp;view&nbsp;width&nbsp;(s):
      <NumberField value={viewSec()} class="w-20">
        <NumberFieldInput min={1} max={300}
          onInput={e=>setViewSec(+e.currentTarget.value||1)}/>
      </NumberField>
    </label>

    {/* NEW: volume-like slider for min recording valid % */}
    <label class="text-sm flex items-center gap-2">
      Min&nbsp;recording&nbsp;valid&nbsp;%:
      <input type="range" min="0" max="100" value={minValidPct()}
        class="w-40 accent-primary-500"
        onInput={e=>setMinValidPct(+e.currentTarget.value)} />
      <span class="w-10 text-right tabular-nums">{minValidPct()}%</span>
    </label>

    <Button size="sm" variant="secondary" onClick={reset}>Reset</Button>
  </div>

  {/* consolidated explanation */}
  <p class="text-xs text-muted-foreground -mt-2 leading-relaxed select-none">
    <strong>Horizontal scale</strong> – pixels representing one second on the timeline. <br/>
    <strong>Timeline span</strong> – total seconds rendered; if this is wider than your screen a horizontal scroll bar appears below the plot. <br/>
    <strong>Current view width</strong> – seconds visible at once (zoom). <br/>
    <strong>Min recording valid %</strong> – hide data if the recording’s “Gaze samples” percentage is below this threshold.
  </p>

  {/* quick status line for recording quality */}
  <Show when={selectedTest() && recordingName()}>
    <div class="text-xs text-muted-foreground">
      Recording: <span class="font-medium">{recordingName()}</span>
      {recordingPct()!==null && <> · valid {recordingPct()}%</>}
      {blockedByQuality() &&
        <span class="ml-2 px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">
          filtered by threshold {minValidPct()}%
        </span>}
    </div>
  </Show>

  {/* charts grid */}
  <div class="grid gap-6 xl:grid-cols-2">

    {/* time-series (per-box) */}
    <Card class="xl:col-span-2">
      <CardHeader><CardTitle>Gaze Distribution Over Time</CardTitle></CardHeader>
      <CardContent class="h-[500px] w-full">
        {/* AOI-set toggles (right aligned) */}
        <div class="flex flex-wrap gap-2 justify-end mb-2 text-xs">
          <For each={META_KEYS}>{k => {
            const row = selectedTest() ? catalogByTest().get(selectedTest()!.value) : undefined;
            const size =
              parseAOISet(
                k === "correct_AOIs" ? row?.correct_AOIs :
                k === "potentially_correct_AOIs" ? row?.potentially_correct_AOIs :
                k === "incorrect_AOIs" ? row?.incorrect_AOIs :
                k === "correct_NULL" ? row?.correct_NULL :
                k === "potentially_correct_NULL" ? row?.potentially_correct_NULL :
                row?.incorrect_NULL
              ).length;
            const active = activeMetaFilters().has(k);
            const disabled = size === 0;
            return (
              <button
                class={`px-2 py-0.5 rounded border transition
                        ${active ? "bg-primary text-primary-foreground" : "bg-muted"}
                        ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={disabled}
                onClick={() => toggleMeta(k)}
                title={k.replace(/_/g, " ")}
              >
                {k.replace(/_/g, " ")}
              </button>
            );
          }}</For>
        </div>
        <div class="h-full overflow-x-auto">
          <div style={{width:`max(100%, ${dynWidth()}px)`,height:"100%"}}>
            <LineChart ref={setCanvasRef} data={buildChart()} options={chartOpts()}/>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* NEW: AOI Sets Over Time */}
    <Card class="xl:col-span-2">
      <CardHeader><CardTitle>AOI Sets Over Time</CardTitle></CardHeader>
      <CardContent class="h-[400px]">
        <LineChart data={buildAoiSetChart()} options={{
          responsive:true, maintainAspectRatio:false,
          scales:{ x:{ type:"linear", min:0, max:viewSec() }, y:{ beginAtZero:true, max:100 } },
          plugins:{ legend:{ position:"top", align:"start", labels:{ usePointStyle:true, boxWidth:8, font:{size:10} } } }
        }}/>
      </CardContent>
    </Card>

    {/* stimulus + replay */}
    <Card>
      <CardHeader><CardTitle>Stimulus Image</CardTitle></CardHeader>
      <CardContent class="flex flex-col items-center gap-3">
        {imgUrl()
          ? (
            <>
              <div class="relative">
                <img  ref={el => imgEl = el}
                      src={imgUrl()!}
                      alt="stimulus"
                      onLoad={() => {
                        if (!canvasEl || !imgEl) return;
                        canvasEl.width  = imgEl.clientWidth;
                        canvasEl.height = imgEl.clientHeight;
                        drawFrame(0);
                      }}
                      class="max-h-[400px] max-w-full object-contain rounded-md border"/>
                <canvas ref={el => canvasEl = el}
                        class="absolute inset-0 pointer-events-none"/>
              </div>

              {/* controls */}
              <div class="flex items-center gap-3 mt-3">
                <Button size="icon" onClick={isPlaying() ? pause : play}
                        disabled={!replayReady()}>
                  {isPlaying() ? "❚❚" : "►"}
                </Button>
                <Button size="icon" variant="secondary"
                        onClick={stop} disabled={!replayReady()}>
                  ■
                </Button>

                {/* time slider */}
                <input type="range"
                       min="0" max={duration()}
                       value={curTime()}
                       step="0.01"
                       class="w-40 accent-primary-500"
                       onInput={e => {
                         const v = +e.currentTarget.value;
                         setCurTime(v);
                         if (!isPlaying()) drawFrame(v);
                         else playStart = performance.now() - v * 1000;
                       }}/>
                <span class="text-xs tabular-nums">
                  {curTime().toFixed(2)} / {duration().toFixed(2)} s
                </span>
              </div>

              {/* colour legend */}
              <div class="flex items-center gap-2 w-full justify-center mt-1">
                <span class="text-[10px] text-muted-foreground">old</span>
                <div class="h-2 w-32 rounded-full"
                     style="
                       background: linear-gradient(to right,
                                   hsl(220 100% 50%), hsl(0 100% 50%));
                     "/>
                <span class="text-[10px] text-muted-foreground">new</span>
              </div>

              {/* validity summary */}
              <div class="text-xs leading-relaxed mt-1 select-none space-y-2">
                <div class="text-center">
                  {currentWord()
                    ? <>Current word:&nbsp;<strong>{currentWord()}</strong></>
                    : <span class="text-muted-foreground">(no word window)</span>}
                </div>
                <div class="flex flex-wrap justify-center gap-4">
                  <span><strong>#1</strong>&nbsp;{statsWhole().pct_including_missing.toFixed(1)} %</span>
                  <span><strong>#2</strong>&nbsp;{statsWhole().pct_excluding_missing.toFixed(1)} %</span>
                  <span><strong>#3</strong>&nbsp;{statsWhole().pct_excluding_missing_oob.toFixed(1)} %</span>
                  <span><strong>#4</strong>&nbsp;{winPctValid().toFixed(1)} %</span>
                </div>
              </div>
            </>
          )
          : <span class="text-sm text-muted-foreground">
              (no image for this test)
            </span>}
      </CardContent>
    </Card>

    {/* overall pie */}
    <Card>
      <CardHeader><CardTitle>Overall Gaze Distribution</CardTitle></CardHeader>
      <CardContent class="h-[500px]">
        <PieChart data={getPie()} options={{maintainAspectRatio:false,responsive:true}}/>
      </CardContent>
    </Card>

    {/* word windows */}
    <Card>
      <CardHeader><CardTitle>Chinese Word Windows</CardTitle></CardHeader>
      <CardContent class="max-h-[500px] overflow-auto">
        <table class="min-w-full text-sm">
          <thead><tr class="sticky top-0 bg-background">
            <th class="py-1 px-2 text-left">Word</th>
            <th class="py-1 px-2 text-right">Start&nbsp;(s)</th>
            <th class="py-1 px-2 text-right">End&nbsp;(s)</th></tr></thead>
          <tbody>
            <For each={wordWin()}>{w=>
              <tr><td class="py-1 px-2">{w.chinese_word}</td>
                  <td class="py-1 px-2 text-right">{w.start_sec.toFixed(2)}</td>
                  <td class="py-1 px-2 text-right">{w.end_sec.toFixed(2)}</td></tr>}
            </For>
          </tbody>
        </table>
      </CardContent>
    </Card>

    {/* gaze path */}
    <Card>
      <CardHeader><CardTitle>Gaze Path</CardTitle></CardHeader>
      <CardContent class="h-[500px]">
        <LineChart data={getPath()} options={{
          maintainAspectRatio:false,responsive:true,
          scales:{y:{reverse:true,beginAtZero:true},x:{beginAtZero:true}},
          plugins:{legend:{display:false}}
        }}/>
      </CardContent>
    </Card>

    {/* box stats */}
    <Card class="xl:col-span-2">
      <CardHeader><CardTitle>Box Distribution</CardTitle></CardHeader>
      <CardContent class="pt-4">
        <div class="grid gap-6 md:grid-cols-2">
          <For each={Object.entries(boxStats())}>{([b,p])=>
            <div>
              <div class="flex justify-between mb-2 text-sm">
                <span>{b}</span><span class="text-gray-500">{p.toFixed(1)}%</span>
              </div>
              <Progress value={p} class="h-3"
                style={{background:`${COLORS()[b as BoxTypes]}40`,
                        "--progress-background":COLORS()[b as BoxTypes]}}/>
            </div>}
          </For>
        </div>
      </CardContent>
    </Card>
  </div>
</div>
);
};

export default GazeAnalysis;
