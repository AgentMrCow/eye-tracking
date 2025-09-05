import { createMemo, createSignal, For, Show, onCleanup, onMount, createEffect } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

/* UI */
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider, SliderTrack, SliderFill, SliderThumb } from "@/components/ui/slider";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { TextField, TextFieldInput } from "@/components/ui/text-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/* Charts */
import { PieChart, LineChart } from "@/components/ui/charts";

/* Small numeric input */
import { NumberField, NumberFieldInput } from "@/components/ui/number-field";

/* Icons */
import { ChevronDown, Settings2, RefreshCcw, CircleHelp } from "lucide-solid";

/* TanStack Table (Solid) */
import type {
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
} from "@tanstack/solid-table";
import {
  createSolidTable,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
} from "@tanstack/solid-table";

/* Chart.js for the reveal plugin + imperatively forcing redraws */
import { Chart as ChartJS } from "chart.js";

/* ──────────────────────────────────────────────────────────────
   Types (from backend)
   ────────────────────────────────────────────────────────────── */

type TestCatalogRow = {
  test_name: string;
  sentence?: string | null;
  group?: string | null;

  correct_AOIs?: string | null;
  potentially_correct_AOIs?: string | null;
  incorrect_AOIs?: string | null;
  correct_NULL?: string | null;
  potentially_correct_NULL?: string | null;
  incorrect_NULL?: string | null;

  truth_value?: string | null;
  only_position?: string | null;
  morpheme?: string | null;
  series?: string | null;
  case_no?: number | null;
  image_name?: string | null;
  timeline?: string | null;
  word_windows_json?: string | null;
  missing?: string | null;
  image_path?: string | null;

  aoi_extra?: Record<string, string | null>;
};

type GazeData = {
  gaze_x: number | null;
  gaze_y: number | null;
  box_name: string;
  media_name: string;
  timeline: string;
  participant: string;
  recording: string;
  timestamp: string;
  test_name: string;
};

type WordWindow = {
  chinese_word: string;
  start_sec: number;
  end_sec: number;
  test_name: string;
  timeline: string;
};

type TimelineRecording = { timeline: string; recording: string };

/* AOI map + helpers */
type BoxTypes =
  | "Animal 1" | "Object 1 for Animal 1" | "Object 2 for Animal 1"
  | "Animal 2" | "Object 1 for Animal 2" | "Object 2 for Animal 2"
  | "Animal 3" | "Object 1 for Animal 3" | "Object 2 for Animal 3"
  | "other" | "missing" | "out_of_screen";

const AOI_CODE_TO_BOX: Record<string, Exclude<BoxTypes, "other" | "missing" | "out_of_screen">> = {
  S1: "Animal 1",  O1A: "Object 1 for Animal 1", O2A: "Object 2 for Animal 1",
  S2: "Animal 2",  O1B: "Object 1 for Animal 2", O2B: "Object 2 for Animal 2",
  S3: "Animal 3",  O3A: "Object 1 for Animal 3", O3B: "Object 2 for Animal 3",
};

type AoiKey = string;

const BASE_AOI_KEYS: AoiKey[] = [
  "correct_AOIs",
  "potentially_correct_AOIs",
  "incorrect_AOIs",
  "correct_NULL",
  "potentially_correct_NULL",
  "incorrect_NULL",
];

const EXTRA_AOI_KEYS: AoiKey[] = [
  "Mentioned character (Animal)",
  "Mentioned object",
  "Mentioned character's extra object [For Szinghai]",
  "Mentioned character's extra object [For Vzinghai]",
  "Competitor character (Animal) [Correct interpretation]",
  "Competitor object [Correct interpretation (optional)]",
  "Competitor's extra object [Potentially correct interpretation]",
  "Dangling character i (Animal) [Potentially correct interpretation]",
  "Dangling object ia (R) [Potentially correct interpretation]",
  "Dangling object ib (L) [Potentially correct interpretation]",
  "Dangling character ii (Animal) [Potentially correct interpretation]",
  "Dangling object iia (R) [Potentially correct interpretation]",
  "Dangling object iib (L) [Potentially correct interpretation]",
  "Dangling character i (Animal) [Critical incorrect interpretation]",
  "Dangling object ia (R) [Critical incorrect interpretation]",
  "Dangling object ib (L) [Critical incorrect interpretation]",
  "Dangling character ii (Animal) [Critical incorrect interpretation]",
  "Dangling object iia (R) [Critical incorrect interpretation]",
  "Dangling object iib (L) [Critical incorrect interpretation]",
];

const ALL_AOI_KEYS: AoiKey[] = [...BASE_AOI_KEYS, ...EXTRA_AOI_KEYS];

const AOI_KEY_LABEL: Record<string, string> = {
  correct_AOIs: "correct AOIs",
  potentially_correct_AOIs: "potentially correct AOIs",
  incorrect_AOIs: "incorrect AOIs",
  correct_NULL: "correct NULL",
  potentially_correct_NULL: "potentially correct NULL",
  incorrect_NULL: "incorrect NULL",
};
const labelForKey = (k: AoiKey) => AOI_KEY_LABEL[k] ?? k;

type CompareBy = "group" | "truth_value" | "only_position" | "morpheme" | "series" | "case_no";
type AggMode = "discrete" | "continuous";

type DetailedRow = {
  test: string;
  group: string | null;
  truth: string | null;
  series: string | null;
  morph: string | null;
  pos: string | null;
  case_no: number | null;
  participant: string;
  recording: string;
  valid: number;
  total: number;
  blue: number;
  red: number;
  pctBlue: number;
};

const FIELD_MAP: Record<CompareBy, keyof DetailedRow> = {
  group: "group",
  truth_value: "truth",
  only_position: "pos",
  morpheme: "morph",
  series: "series",
  case_no: "case_no",
};

type ParticipantSummary = {
  participant: string;
  meanPct: number;
  weightedPct: number;
};

/* helpers */
function parseAoiList(s?: string | null): Set<BoxTypes> {
  const out = new Set<BoxTypes>();
  if (!s) return out;
  s
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((code) => {
      const key = code.toUpperCase() as keyof typeof AOI_CODE_TO_BOX;
      const mapped = AOI_CODE_TO_BOX[key];
      if (mapped) out.add(mapped);
    });
  return out;
}
function unionSets<T>(sets: Set<T>[]): Set<T> {
  const u = new Set<T>();
  sets.forEach((s) => s.forEach((v) => u.add(v)));
  return u;
}
function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/* Data Table bits */
const makeColumns = (): ColumnDef<DetailedRow>[] => [
  { accessorKey: "test", header: "Test" },
  { accessorKey: "group", header: "Group" },
  { accessorKey: "truth", header: "Truth" },
  { accessorKey: "series", header: "Series" },
  { accessorKey: "morph", header: "Morph" },
  { accessorKey: "pos", header: "Pos" },
  { accessorKey: "case_no", header: "Case" },
  { accessorKey: "participant", header: "Participant" },
  { accessorKey: "recording", header: "Recording" },
  {
    accessorKey: "valid",
    header: "Valid",
    cell: (p) => <div class="text-right tabular-nums">{Number(p.row.getValue("valid")).toLocaleString()}</div>,
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: (p) => <div class="text-right tabular-nums">{Number(p.row.getValue("total")).toLocaleString()}</div>,
  },
  {
    accessorKey: "pctBlue",
    header: () => <div class="text-right">% in blue</div>,
    cell: (p) => <div class="text-right tabular-nums">{Number(p.row.getValue("pctBlue")).toFixed(1)}%</div>,
  },
];

function DataTable<TData, TValue>(props: { columns: ColumnDef<TData, TValue>[]; data: TData[] }) {
  const [sorting, setSorting] = createSignal<SortingState>([]);
  const [filters, setFilters] = createSignal<ColumnFiltersState>([]);
  const [visibility, setVisibility] = createSignal<VisibilityState>({});
  const [rowSel, setRowSel] = createSignal({});

  const table = createSolidTable({
    get data() {
      return props.data;
    },
    get columns() {
      return props.columns;
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setFilters,
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setRowSel,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      get sorting() {
        return sorting();
      },
      get columnFilters() {
        return filters();
      },
      get columnVisibility() {
        return visibility();
      },
      get rowSelection() {
        return rowSel();
      },
    },
  });

  return (
    <div class="w-full">
      <div class="flex items-center py-4">
        <TextField value={(table.getColumn("test")?.getFilterValue() as string) ?? ""} onChange={(v) => table.getColumn("test")?.setFilterValue(v)}>
          <TextFieldInput placeholder="Filter tests..." class="max-w-sm" />
        </TextField>

        <DropdownMenu placement="bottom-end">
          <DropdownMenuTrigger as={Button<"button">} variant="outline" class="ml-auto">
            Columns <ChevronDown class="ml-1 h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <For each={table.getAllLeafColumns()}>
              {(col) => (
                <DropdownMenuCheckboxItem class="capitalize" checked={col.getIsVisible()} onChange={(v) => col.toggleVisibility(!!v)}>
                  {col.id}
                </DropdownMenuCheckboxItem>
              )}
            </For>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div class="rounded-md border">
        <Table>
          <TableHeader>
            <For each={table.getHeaderGroups()}>
              {(hg) => (
                <TableRow>
                  <For each={hg.headers}>
                    {(header) => <TableHead>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>}
                  </For>
                </TableRow>
              )}
            </For>
          </TableHeader>
          <TableBody>
            <Show
              when={table.getRowModel().rows?.length}
              fallback={
                <TableRow>
                  <TableCell colSpan={props.columns.length} class="h-24 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              }
            >
              <For each={table.getRowModel().rows}>
                {(row) => (
                  <TableRow data-state={row.getIsSelected() && "selected"}>
                    <For each={row.getVisibleCells()}>
                      {(cell) => <TableCell>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>}
                    </For>
                  </TableRow>
                )}
              </For>
            </Show>
          </TableBody>
        </Table>
      </div>

      <div class="flex items-center justify-end space-x-2 py-4">
        <div class="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div class="space-x-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   NEW: Chart.js plugin to progressively reveal datasets
   (clips draw area at current playSec)
   ────────────────────────────────────────────────────────────── */
const RevealClipPlugin = {
  id: "revealClip",
  beforeDatasetsDraw(chart: any, _args: any, pluginOpts: any) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea) return;
    const x = scales.x;
    const play: number = pluginOpts?.playSec ?? 0;
    const clipX = Math.max(chartArea.left, Math.min(x.getPixelForValue(play), chartArea.right));
    ctx.save();
    ctx.beginPath();
    ctx.rect(chartArea.left, chartArea.top, clipX - chartArea.left, chartArea.bottom - chartArea.top);
    ctx.clip();
  },
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart;
    try { ctx.restore(); } catch {}
  },
};

onMount(() => {
  // Register once
  try { ChartJS.register(RevealClipPlugin as any); } catch {}
});

/* ──────────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────────── */
export default function CatalogCompare() {
  /* raw data */
  const [catalog, setCatalog] = createSignal<TestCatalogRow[]>([]);
  const [participants, setParticipants] = createSignal<string[]>([]);

  /* filters */
  const [groupF, setGroupF] = createSignal<string>("all groups");
  const [truthF, setTruthF] = createSignal<string>("all truth values");
  const [posF, setPosF] = createSignal<string>("all positions");
  const [morphF, setMorphF] = createSignal<string>("all morphemes");
  const [seriesF, setSeriesF] = createSignal<string>("all series");
  const [caseF, setCaseF] = createSignal<string>("all cases");

  /* AOI metric config */
  const [blueKeys, setBlueKeys] = createSignal<AoiKey[]>(["correct_AOIs"]);
  const [redKeys, setRedKeys] = createSignal<AoiKey[]>(ALL_AOI_KEYS.filter((k) => k !== "correct_AOIs"));
  const [redCustom, setRedCustom] = createSignal(false);

  /* Invalid categories to exclude */
  const [invalidCats, setInvalidCats] = createSignal<("other" | "missing" | "out_of_screen")[]>(["missing"]);

  const [minValidPct, setMinValidPct] = createSignal(0);
  const [thresholdPct, setThresholdPct] = createSignal(50);

  /* Compare-by (multi) */
  const [compareBy, setCompareBy] = createSignal<CompareBy[]>(["truth_value"]);

  /* Aggregation mode */
  const [aggMode, setAggMode] = createSignal<"discrete" | "continuous">("discrete");

  /* compute results */
  const [busy, setBusy] = createSignal(false);
  const [rows, setRows] = createSignal<DetailedRow[]>([]);
  const [pSummary, setPSummary] = createSignal<ParticipantSummary[]>([]);
  const [mounted, setMounted] = createSignal(false);

  onMount(() => setMounted(true));

  /* load basics */
  (async () => {
    const meta = await invoke<TestCatalogRow[]>("get_all_test_catelog").catch(() => []);
    setCatalog(meta);
    const parts = await invoke<string[]>("get_participants").catch(() => []);
    setParticipants(parts);
  })();

  /* auto-complement red set while not in custom mode */
  const syncRed = () => {
    if (redCustom()) return;
    const comp = ALL_AOI_KEYS.filter((k) => !blueKeys().includes(k));
    setRedKeys(comp);
  };
  createMemo(() => {
    blueKeys();
    syncRed();
  });

  /* options from data */
  const groups = createMemo(() => ["all groups", ...Array.from(new Set(catalog().map((r) => r.group || "").filter(Boolean)))]);
  const truths = createMemo(() => ["all truth values", ...Array.from(new Set(catalog().map((r) => r.truth_value || "").filter(Boolean)))]);
  const poss = createMemo(() => ["all positions", ...Array.from(new Set(catalog().map((r) => r.only_position || "").filter(Boolean)))]);
  const morphs = createMemo(() => ["all morphemes", ...Array.from(new Set(catalog().map((r) => r.morpheme || "").filter(Boolean)))]);
  const series = createMemo(() => ["all series", ...Array.from(new Set(catalog().map((r) => r.series || "").filter(Boolean)))]);
  const cases = createMemo(() => {
    const cs = Array.from(new Set(catalog().map((r) => (r.case_no == null ? null : r.case_no))));
    return ["all cases", ...cs.filter((x): x is number => x != null).map(String)];
  });

  /* filtered tests */
  const tests = createMemo(() =>
    catalog().filter(
      (r) =>
        (groupF() === "all groups" || r.group === groupF()) &&
        (truthF() === "all truth values" || r.truth_value === truthF()) &&
        (posF() === "all positions" || r.only_position === posF()) &&
        (morphF() === "all morphemes" || r.morpheme === morphF()) &&
        (seriesF() === "all series" || r.series === seriesF()) &&
        (caseF() === "all cases" || String(r.case_no ?? "") === caseF())
    )
  );
  const testNames = createMemo(() => Array.from(new Set(tests().map((t) => t.test_name))));

  function boxesFor(row: TestCatalogRow, keys: AoiKey[]): Set<BoxTypes> {
    const sets = keys.map((k) => {
      const fromMain = (row as any)[k] as string | null | undefined;
      const fromExtra = row.aoi_extra?.[k];
      return parseAoiList(fromMain ?? fromExtra ?? null);
    });
    return unionSets(sets);
  }

  async function compute() {
    setBusy(true);
    const out: DetailedRow[] = [];
    try {
      const t = tests();
      const parts = participants();
      const invalid = new Set<BoxTypes>(invalidCats() as BoxTypes[]);

      const blueMap = new Map<string, Set<BoxTypes>>();
      const redMap = new Map<string, Set<BoxTypes>>();
      t.forEach((r) => {
        blueMap.set(r.test_name, boxesFor(r, blueKeys()));
        const rk = redCustom()
          ? redKeys().filter((k) => !blueKeys().includes(k))
          : ALL_AOI_KEYS.filter((k) => !blueKeys().includes(k));
        redMap.set(r.test_name, boxesFor(r, rk));
      });

      for (const row of t) {
        for (const p of parts) {
          // Aggregated compute keeps previous behavior: all timelines/recordings for this test+participant
          const gaze = (await invoke<GazeData[]>("get_gaze_data", {
            test_name: row.test_name,
            testName: row.test_name,
            participants: [p],
          }).catch(() => [])) as GazeData[];

          if (!gaze.length) continue;

          const total = gaze.length;
          const invalidCount = gaze.filter((g) => invalid.has(g.box_name as BoxTypes)).length;
          const valid = total - invalidCount;
          const validPct = total ? (valid / total) * 100 : 0;
          if (validPct < minValidPct()) continue;

          let blue = 0, red = 0;
          const blueBoxes = blueMap.get(row.test_name)!;
          const redBoxes  = redMap.get(row.test_name)!;

          for (const g of gaze) {
            const b = g.box_name as BoxTypes;
            if (invalid.has(b)) continue;
            if (blueBoxes.has(b)) blue++;
            else if (redBoxes.has(b)) red++;
          }
          const denom = blue + red;
          const pctBlue = denom ? (blue / denom) * 100 : 0;

          out.push({
            test: row.test_name,
            group: row.group ?? null,
            truth: row.truth_value ?? null,
            series: row.series ?? null,
            morph: row.morpheme ?? null,
            pos: row.only_position ?? null,
            case_no: row.case_no ?? null,
            participant: gaze[0].participant,
            recording: gaze[0].recording,
            valid,
            total,
            blue,
            red,
            pctBlue,
          });
        }
      }

      setRows(out);

      const byP = new Map<string, { pcts: number[]; blue: number; red: number }>();
      out.forEach((r) => {
        const rec = byP.get(r.participant) ?? { pcts: [], blue: 0, red: 0 };
        rec.pcts.push(r.pctBlue);
        rec.blue += r.blue;
        rec.red  += r.red;
        byP.set(r.participant, rec);
      });

      const ps: ParticipantSummary[] = [];
      byP.forEach((acc, key) => {
        const meanPct = acc.pcts.length ? acc.pcts.reduce((a, b) => a + b, 0) / acc.pcts.length : 0;
        const den = acc.blue + acc.red;
        const weightedPct = den ? (acc.blue / den) * 100 : 0;
        ps.push({ participant: key, meanPct, weightedPct });
      });
      setPSummary(ps);

      if (!selTest1() && testNames().length) setSelTest1(testNames()[0]);
      if (!selTest2() && testNames().length) setSelTest2(testNames()[Math.min(1, testNames().length - 1)]);
      if (!selPart1() && participants().length) setSelPart1(participants()[0]);
      if (!selPart2() && participants().length) setSelPart2(participants()[Math.min(1, participants().length - 1)]);
    } finally {
      setBusy(false);
    }
  }

  const pieData = createMemo(() => {
    const th = thresholdPct();
    const above = pSummary().filter((p) =>
      (aggMode() === "discrete" ? p.meanPct : p.weightedPct) >= th
    ).length;
    const below = pSummary().length - above;
    return {
      labels: ["≥ threshold", "< threshold"],
      datasets: [{ data: [above, below] }],
    };
  });

  type BucketRow = {
    bucket: string;
    tests: number;
    participants: number;
    mean: number;
    median: number;
    geThresh: number;
    leaders: { id: string; pct: number }[];
  };

  function makeCompare(field: CompareBy): BucketRow[] {
    const keyOnRow = FIELD_MAP[field];
    const byBucket = new Map<string, DetailedRow[]>();

    rows().forEach((r) => {
      const bucket = String((r as any)[keyOnRow] ?? "—");
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket)!.push(r);
    });

    const result: BucketRow[] = [];
    byBucket.forEach((rws, bucket) => {
      const testSet = new Set(rws.map((r) => r.test));
      const perP = new Map<string, { pcts: number[]; blue: number; red: number }>();
      rws.forEach((r) => {
        const rec = perP.get(r.participant) ?? { pcts: [], blue: 0, red: 0 };
        rec.pcts.push(r.pctBlue);
        rec.blue += r.blue;
        rec.red  += r.red;
        perP.set(r.participant, rec);
      });

      const metrics: { id: string; value: number }[] = [];
      perP.forEach((acc, id) => {
        const disc = acc.pcts.length ? acc.pcts.reduce((a, b) => a + b, 0) / acc.pcts.length : 0;
        const den = acc.blue + acc.red;
        const cont = den ? (acc.blue / den) * 100 : 0;
        metrics.push({ id, value: aggMode() === "discrete" ? disc : cont });
      });

      const mVals = metrics.map((x) => x.value);
      const mean = mVals.length ? mVals.reduce((a, b) => a + b, 0) / mVals.length : 0;
      const med = median(mVals);
      const ge = metrics.filter((x) => x.value >= thresholdPct()).length;
      const leaders = metrics.sort((a, b) => b.value - a.value).slice(0, 3).map((x) => ({ id: x.id, pct: x.value }));

      result.push({
        bucket,
        tests: testSet.size,
        participants: perP.size,
        mean,
        median: med,
        geThresh: ge,
        leaders,
      });
    });

    return result.sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  const firstCardTitle = createMemo(() => {
    const lbls = blueKeys().map((k) => labelForKey(k)).join(" + ");
    const mode = aggMode() === "discrete" ? "discrete" : "continuous";
    return `Participants ≥ threshold (${mode}, % in ${lbls})`;
  });

  const renderBlueSummary = () => (
    <div class="flex flex-wrap gap-1">
      <For each={blueKeys()}>{(k) => <Badge variant="secondary">{labelForKey(k)}</Badge>}</For>
    </div>
  );
  const renderRedSummary = () => (
    <div class="flex flex-wrap gap-1">
      <Badge variant={redCustom() ? "default" : "secondary"}>{redCustom() ? "custom compare set" : "auto: remaining"}</Badge>
      <Show when={redCustom()}>
        <For each={redKeys()}>{(k) => <Badge variant="outline">{labelForKey(k)}</Badge>}</For>
      </Show>
    </div>
  );

  /* ──────────────────────────────────────────────────────────────
     NEW: Two-panel time-series compare with timeline/recording selects
     + progressive reveal + shared playhead + word windows + gaze overlay
     ────────────────────────────────────────────────────────────── */

  /* shared controls */
  const [binMs, setBinMs]   = createSignal(100);
  const [viewSec, setViewSec] = createSignal(15);
  const DUR_PRESETS = [5, 10, 15, 30, 60, 120];

  /* selections for the two graphs */
  const [selTest1, setSelTest1] = createSignal<string>("");
  const [selPart1, setSelPart1] = createSignal<string>("");
  const [selTest2, setSelTest2] = createSignal<string>("");
  const [selPart2, setSelPart2] = createSignal<string>("");

  /* timeline+recording selection (LEFT) */
  const [combos1, setCombos1] = createSignal<TimelineRecording[]>([]);
  const timelines1 = createMemo(() => Array.from(new Set(combos1().map(c => c.timeline))));
  const [selTimeline1, setSelTimeline1] = createSignal<string>("");
  const recOpts1 = createMemo(() => combos1().filter(c => c.timeline === selTimeline1()).map(c => c.recording));
  const [selRecording1, setSelRecording1] = createSignal<string>("");

  /* timeline+recording selection (RIGHT) */
  const [combos2, setCombos2] = createSignal<TimelineRecording[]>([]);
  const timelines2 = createMemo(() => Array.from(new Set(combos2().map(c => c.timeline))));
  const [selTimeline2, setSelTimeline2] = createSignal<string>("");
  const recOpts2 = createMemo(() => combos2().filter(c => c.timeline === selTimeline2()).map(c => c.recording));
  const [selRecording2, setSelRecording2] = createSignal<string>("");

  /* fetch combos when test/participant change (LEFT/RIGHT) */
  createEffect(async () => {
    const t = selTest1(), p = selPart1();
    if (!t || !p) { setCombos1([]); setSelTimeline1(""); setSelRecording1(""); return; }
    const list = await invoke<TimelineRecording[]>("get_timeline_recordings", {
      test_name: t, testName: t, participants: [p]
    }).catch(() => []);
    setCombos1(list);
  });
  createEffect(async () => {
    const t = selTest2(), p = selPart2();
    if (!t || !p) { setCombos2([]); setSelTimeline2(""); setSelRecording2(""); return; }
    const list = await invoke<TimelineRecording[]>("get_timeline_recordings", {
      test_name: t, testName: t, participants: [p]
    }).catch(() => []);
    setCombos2(list);
  });

  /* keep selected timeline/recording valid as options change */
  createEffect(() => {
    const cmb = combos1();
    const tset = new Set(cmb.map(c => c.timeline));
    if (!tset.has(selTimeline1())) setSelTimeline1(cmb.length === 1 ? cmb[0].timeline : "");
    const recs = cmb.filter(c => c.timeline === selTimeline1());
    const rset = new Set(recs.map(c => c.recording));
    if (!rset.has(selRecording1())) setSelRecording1(recs.length === 1 ? recs[0].recording : "");
  });
  createEffect(() => {
    const cmb = combos2();
    const tset = new Set(cmb.map(c => c.timeline));
    if (!tset.has(selTimeline2())) setSelTimeline2(cmb.length === 1 ? cmb[0].timeline : "");
    const recs = cmb.filter(c => c.timeline === selTimeline2());
    const rset = new Set(recs.map(c => c.recording));
    if (!rset.has(selRecording2())) setSelRecording2(recs.length === 1 ? recs[0].recording : "");
  });

  /* word windows (per test) — guarded against stale responses */
  const [ww1, setWw1] = createSignal<WordWindow[]>([]);
  const [ww2, setWw2] = createSignal<WordWindow[]>([]);
  let ww1Req = 0, ww2Req = 0;
  createEffect(async () => {
    const t = selTest1();
    if (!t) { setWw1([]); return; }
    const my = ++ww1Req;
    const arr = await invoke<WordWindow[]>("get_word_windows", { testName: t }).catch(() => []);
    if (my === ww1Req) setWw1(arr);
  });
  createEffect(async () => {
    const t = selTest2();
    if (!t) { setWw2([]); return; }
    const my = ++ww2Req;
    const arr = await invoke<WordWindow[]>("get_word_windows", { testName: t }).catch(() => []);
    if (my === ww2Req) setWw2(arr);
  });

  /* current word during playback (both sides) */
  const [playSec, setPlaySec] = createSignal(0);
  const currentWord1 = createMemo(() => {
    const t = playSec();
    const w = ww1().find(w => t >= w.start_sec && t <= w.end_sec);
    return w?.chinese_word ?? null;
  });
  const currentWord2 = createMemo(() => {
    const t = playSec();
    const w = ww2().find(w => t >= w.start_sec && t <= w.end_sec);
    return w?.chinese_word ?? null;
  });

  /* helper: AOI sets for a test under current Blue/Red */
  function currentSetsFor(testName: string) {
    const row = catalog().find((r) => r.test_name === testName);
    if (!row) return { blue: new Set<BoxTypes>(), red: new Set<BoxTypes>() };
    const blue = boxesFor(row, blueKeys());
    const rk = redCustom()
      ? redKeys().filter((k) => !blueKeys().includes(k))
      : ALL_AOI_KEYS.filter((k) => !blueKeys().includes(k));
    const red = boxesFor(row, rk);
    return { blue, red };
  }

  type SeriesOut = { datasets: any[]; xMax: number; gaze: GazeData[]; baseMs: number };

  const [series1, setSeries1] = createSignal<SeriesOut | null>(null);
  const [series2, setSeries2] = createSignal<SeriesOut | null>(null);

  async function buildSeries(testName: string, participant: string, timeline?: string, recording?: string): Promise<SeriesOut | null> {
    if (!testName || !participant) return null;

    const { blue, red } = currentSetsFor(testName);
    const invalidSet = new Set<BoxTypes>(invalidCats() as BoxTypes[]);

    const gaze = (await invoke<GazeData[]>("get_gaze_data", {
      test_name: testName,
      testName: testName,
      participants: [participant],
      timeline: timeline ?? null,
      recording: recording ?? null,
    }).catch(() => [])) as GazeData[];

    if (!gaze.length) return { datasets: [], xMax: 0, gaze: [], baseMs: 0 };

    const baseMs = +new Date(gaze[0].timestamp);
    const ms = Math.max(1, binMs());

    type Acc = { blue: number; red: number; tot: number; invalid: number };
    const bins = new Map<number, Acc>();
    let lastSec = 0;

    for (const g of gaze) {
      const b = g.box_name as BoxTypes;
      const t = +new Date(g.timestamp) - baseMs;
      const key = Math.floor(t / ms) * ms;

      const rec = bins.get(key) ?? { blue: 0, red: 0, tot: 0, invalid: 0 };
      rec.tot += 1;
      if (invalidSet.has(b)) rec.invalid += 1;

      const inBlue = blue.has(b);
      const inRed  = red.has(b);
      if (inBlue) rec.blue += 1;
      else if (inRed) rec.red += 1;

      bins.set(key, rec);
      lastSec = Math.max(lastSec, t / 1000);
    }

    const pointsBlue: { x: number; y: number }[] = [];
    const pointsRed:  { x: number; y: number }[] = [];
    const pointsValid:{ x: number; y: number }[] = [];

    const sortedKeys = Array.from(bins.keys()).sort((a, b) => a - b);
    for (const k of sortedKeys) {
      const { blue: b, red: r, tot, invalid } = bins.get(k)!;
      const denom = b + r;
      const x = k / 1000;
      const yB = denom ? (b / denom) * 100 : 0;
      const yR = denom ? (r / denom) * 100 : 0;
      const yV = tot ? ((tot - invalid) / tot) * 100 : 0;
      pointsBlue.push({ x, y: yB });
      pointsRed.push({ x, y: yR });
      pointsValid.push({ x, y: yV });
    }

    const datasets = [
      { label: "% Blue",  data: pointsBlue,  borderColor: "#2563eb", backgroundColor: "transparent", borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
      { label: "% Red",   data: pointsRed,   borderColor: "#e11d48", backgroundColor: "transparent", borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
      { label: "% Valid", data: pointsValid, borderColor: "#64748b", backgroundColor: "transparent", borderDash: [4,4], borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
    ];

    return { datasets, xMax: lastSec, gaze, baseMs };
  }

  /* rebuild series when dependencies change */
  createEffect(async () => {
    binMs(); invalidCats(); blueKeys(); redKeys(); redCustom(); selTimeline1(); selRecording1();
    const t = selTest1(), p = selPart1();
    if (!t || !p) { setSeries1(null); return; }
    // if multiple combos exist, wait until user picks timeline+recording
    if (combos1().length > 1 && (!selTimeline1() || !selRecording1())) { setSeries1(null); return; }
    setSeries1(await buildSeries(t, p, selTimeline1() || undefined, selRecording1() || undefined));
  });
  createEffect(async () => {
    binMs(); invalidCats(); blueKeys(); redKeys(); redCustom(); selTimeline2(); selRecording2();
    const t = selTest2(), p = selPart2();
    if (!t || !p) { setSeries2(null); return; }
    if (combos2().length > 1 && (!selTimeline2() || !selRecording2())) { setSeries2(null); return; }
    setSeries2(await buildSeries(t, p, selTimeline2() || undefined, selRecording2() || undefined));
  });

  /* shared duration + play state */
  const [duration, setDuration] = createSignal(0);
  const [isPlaying, setIsPlaying] = createSignal(false);
  let raf = 0; let playStart = 0;

  createEffect(() => {
    const d = Math.max(series1()?.xMax ?? 0, series2()?.xMax ?? 0);
    setDuration(d);
    if (playSec() > d) setPlaySec(d);
  });

  function play() {
    if (duration() <= 0) return;
    playStart = performance.now() - playSec() * 1000;
    setIsPlaying(true);
    loop();
  }
  function pause() { setIsPlaying(false); cancelAnimationFrame(raf); }
  function stop()  { setIsPlaying(false); cancelAnimationFrame(raf); setPlaySec(0); }
  function loop()  {
    if (!isPlaying()) return;
    const t = (performance.now() - playStart) / 1000;
    if (t >= duration()) { setPlaySec(duration()); pause(); return; }
    setPlaySec(t);
    raf = requestAnimationFrame(loop);
  }
  onCleanup(() => cancelAnimationFrame(raf));

  /* chart options + progressive reveal plugin options */
  const [leftChartRef, setLeftChartRef]   = createSignal<HTMLCanvasElement|null>(null);
  const [rightChartRef, setRightChartRef] = createSignal<HTMLCanvasElement|null>(null);

  // force redraw of charts each time playSec changes so the reveal clip moves
  createEffect(() => {
    const _ = playSec();
    const c1 = leftChartRef() ? ChartJS.getChart(leftChartRef()!) : null;
    const c2 = rightChartRef() ? ChartJS.getChart(rightChartRef()!) : null;
    if (c1) c1.update("none");
    if (c2) c2.update("none");
    // also redraw gaze overlays
    drawFrameLeft(_);
    drawFrameRight(_);
  });

  const compareOpts = createMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { type: "linear", min: 0, max: viewSec(), ticks: { maxTicksLimit: 10 } },
      y: { beginAtZero: true, max: 100 },
    },
    plugins: {
      legend: {
        position: "top" as const, align: "start" as const,
        labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 },
          filter: (l: any, d: any) => !(d.datasets?.[l.datasetIndex]?._ph)
        }
      },
      tooltip: {
        mode: "index", intersect: false,
        filter: (c: any) => !(c.dataset?._ph),
        callbacks: { label: (c: any) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` }
      },
      // this is read by the RevealClipPlugin for progressive drawing
      revealClip: { playSec: playSec() },
    },
    animation: false,
  }));

  const withPlayhead = (datasets: any[]) => [
    ...datasets,
    {
      label: "playhead",
      data: [{ x: playSec(), y: 0 }, { x: playSec(), y: 100 }],
      borderColor: "#111", borderDash: [6,3], borderWidth: 1, pointRadius: 0,
      fill: false, tension: 0, _ph: true,
    },
  ];

  const viz1 = createMemo(() => series1() ? { datasets: withPlayhead(series1()!.datasets) } : { datasets: [] });
  const viz2 = createMemo(() => series2() ? { datasets: withPlayhead(series2()!.datasets) } : { datasets: [] });

  /* ── GAZE OVERLAY (ported from gaze-analysis.tsx) ───────────── */

  // image fetch (left/right) — test_name only + guard against stale overwrite
  const [img1B64, setImg1B64] = createSignal<string|null>(null);
  const [img2B64, setImg2B64] = createSignal<string|null>(null);
  let img1Req = 0, img2Req = 0;
  createEffect(async () => {
    const t = selTest1();
    if (!t) { setImg1B64(null); return; }
    const my = ++img1Req;
    const b64 = await invoke<string | null>("get_test_image", { testName: t }).catch(() => null);
    if (my === img1Req) setImg1B64(b64);
  });
  createEffect(async () => {
    const t = selTest2();
    if (!t) { setImg2B64(null); return; }
    const my = ++img2Req;
    const b64 = await invoke<string | null>("get_test_image", { testName: t }).catch(() => null);
    if (my === img2Req) setImg2B64(b64);
  });
  const imgUrl1 = createMemo(() => img1B64() ? `data:image/png;base64,${img1B64()}` : null);
  const imgUrl2 = createMemo(() => img2B64() ? `data:image/png;base64,${img2B64()}` : null);

  // raw gaze (taken from series build)
  const leftGaze  = createMemo(() => series1()?.gaze ?? []);
  const leftBase  = createMemo(() => series1()?.baseMs ?? 0);
  const rightGaze = createMemo(() => series2()?.gaze ?? []);
  const rightBase = createMemo(() => series2()?.baseMs ?? 0);

  // precomputed replay points
  const replayPts1 = createMemo(() => leftGaze()
    .filter(g => g.gaze_x !== null && g.gaze_y !== null && g.box_name !== "missing" && g.box_name !== "out_of_screen")
    .map(g => ({ t: (+new Date(g.timestamp) - leftBase()) / 1000, x: g.gaze_x as number, y: g.gaze_y as number })));
  const replayPts2 = createMemo(() => rightGaze()
    .filter(g => g.gaze_x !== null && g.gaze_y !== null && g.box_name !== "missing" && g.box_name !== "out_of_screen")
    .map(g => ({ t: (+new Date(g.timestamp) - rightBase()) / 1000, x: g.gaze_x as number, y: g.gaze_y as number })));

  // canvas + img refs
  let canvas1El: HTMLCanvasElement | null = null;
  let canvas2El: HTMLCanvasElement | null = null;
  let img1El: HTMLImageElement | null = null;
  let img2El: HTMLImageElement | null = null;

  const HUE_START = 220; const HUE_END = 0;
  function timeColor(norm: number) {
    const hue = HUE_START + (HUE_END - HUE_START) * norm;
    return `hsl(${hue},100%,50%)`;
  }

  function drawFrameGeneric(sec: number, canvasEl: HTMLCanvasElement | null, imgEl: HTMLImageElement | null, pts: {t:number;x:number;y:number}[], durationSec: number) {
    if (!canvasEl || !imgEl) return;
    const ctx = canvasEl.getContext("2d")!;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    const scaleX = canvasEl.width  / 1920;
    const scaleY = canvasEl.height / 1080;
    for (const p of pts) {
      if (p.t > sec) break;
      const frac = durationSec ? p.t / durationSec : 0;
      ctx.beginPath();
      ctx.arc(p.x * scaleX, p.y * scaleY, 4, 0, Math.PI * 2);
      ctx.fillStyle = timeColor(frac);
      ctx.fill();
    }
  }
  const drawFrameLeft  = (sec: number) => drawFrameGeneric(sec, canvas1El, img1El, replayPts1(), duration());
  const drawFrameRight = (sec: number) => drawFrameGeneric(sec, canvas2El, img2El, replayPts2(), duration());

  /* ────────────────────────────────────────────────────────────── */

  return (
    <div class="space-y-6">
      <Card>
        <CardHeader class="flex flex-col gap-2">
          <CardTitle class="flex items-center gap-2">
            <Settings2 class="h-5 w-5" /> Catalog Comparison
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          {/* row 1: basic filters */}
          <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Select
              value={groupF()}
              onChange={(v) => setGroupF(v ?? "all groups")}
              options={groups()}
              optionValue={(o) => o}
              optionTextValue={(o) => o}
              itemComponent={(props) => <SelectItem item={props.item}>{props.item.rawValue as string}</SelectItem>}
            >
              <SelectTrigger>
                <SelectValue>{groupF()}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>

            <Select
              value={truthF()}
              onChange={(v) => setTruthF(v ?? "all truth values")}
              options={truths()}
              optionValue={(o) => o}
              optionTextValue={(o) => o}
              itemComponent={(props) => <SelectItem item={props.item}>{props.item.rawValue as string}</SelectItem>}
            >
              <SelectTrigger>
                <SelectValue>{truthF()}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>

            <Select
              value={posF()}
              onChange={(v) => setPosF(v ?? "all positions")}
              options={poss()}
              optionValue={(o) => o}
              optionTextValue={(o) => o}
              itemComponent={(props) => <SelectItem item={props.item}>{props.item.rawValue as string}</SelectItem>}
            >
              <SelectTrigger>
                <SelectValue>{posF()}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>

            <Select
              value={morphF()}
              onChange={(v) => setMorphF(v ?? "all morphemes")}
              options={morphs()}
              optionValue={(o) => o}
              optionTextValue={(o) => o}
              itemComponent={(props) => <SelectItem item={props.item}>{props.item.rawValue as string}</SelectItem>}
            >
              <SelectTrigger>
                <SelectValue>{morphF()}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>

            <Select
              value={seriesF()}
              onChange={(v) => setSeriesF(v ?? "all series")}
              options={series()}
              optionValue={(o) => o}
              optionTextValue={(o) => o}
              itemComponent={(props) => <SelectItem item={props.item}>{props.item.rawValue as string}</SelectItem>}
            >
              <SelectTrigger>
                <SelectValue>{seriesF()}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>

            <Select
              value={caseF()}
              onChange={(v) => setCaseF(v ?? "all cases")}
              options={cases()}
              optionValue={(o) => o}
              optionTextValue={(o) => o}
              itemComponent={(props) => <SelectItem item={props.item}>{props.item.rawValue as string}</SelectItem>}
            >
              <SelectTrigger>
                <SelectValue>{caseF()}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>
          </div>

          {/* row 2: AOI multi-selects + invalid categories */}
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* BLUE multi-select */}
            <DropdownMenu placement="bottom-start">
              <DropdownMenuTrigger as={Button<"button">} variant="outline" class="justify-between">
                <div class="flex items-center gap-2">
                  <span class="inline-block w-2 h-2 rounded-full bg-blue-600" />
                  Blue set (AOIs)
                </div>
                <ChevronDown class="w-4 h-4 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent class="w-[420px] max-h-80 overflow-y-auto">
                <DropdownMenuLabel>Count as “blue”</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <For each={ALL_AOI_KEYS}>
                  {(k) => (
                    <DropdownMenuCheckboxItem
                      checked={blueKeys().includes(k)}
                      onChange={(v) => {
                        const next = new Set(blueKeys());
                        if (v) next.add(k);
                        else next.delete(k);
                        const arr = Array.from(next);
                        if (!arr.length) return; // require ≥1
                        setBlueKeys(arr);
                      }}
                    >
                      {labelForKey(k)}
                    </DropdownMenuCheckboxItem>
                  )}
                </For>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* RED (auto/custom) */}
            <DropdownMenu placement="bottom-start">
              <DropdownMenuTrigger as={Button<"button">} variant="outline" class="justify-between">
                <div class="flex items-center gap-2">
                  <span class="inline-block w-2 h-2 rounded-full bg-rose-500" />
                  Compare against
                </div>
                <ChevronDown class="w-4 h-4 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent class="w-[440px] max-h-80 overflow-y-auto">
                <DropdownMenuLabel>Red set options</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => { setRedCustom(false); syncRed(); }}>
                  Auto (remaining)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setRedCustom(true)}>
                  Custom selection…
                </DropdownMenuItem>

                <Show when={redCustom()}>
                  <>
                    <DropdownMenuSeparator />
                    <For each={ALL_AOI_KEYS}>
                      {(k) => (
                        <DropdownMenuCheckboxItem
                          disabled={blueKeys().includes(k)} // never overlap
                          checked={redKeys().includes(k)}
                          onChange={(v) => {
                            const set = new Set(redKeys());
                            if (v) set.add(k);
                            else set.delete(k);
                            const arr = Array.from(set).filter((x) => !blueKeys().includes(x));
                            setRedKeys(arr.length ? arr : ALL_AOI_KEYS.filter((x) => !blueKeys().includes(x)));
                          }}
                        >
                          {labelForKey(k)} {blueKeys().includes(k) ? "(in blue)" : ""}
                        </DropdownMenuCheckboxItem>
                      )}
                    </For>
                  </>
                </Show>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Invalid AOI categories (multi) */}
            <DropdownMenu placement="bottom-start">
              <DropdownMenuTrigger as={Button<"button">} variant="outline" class="justify-between">
                <div class="flex items-center gap-2">
                  <span class="inline-block w-2 h-2 rounded-full bg-amber-500" />
                  Invalid AOI categories
                </div>
                <ChevronDown class="w-4 h-4 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent class="min-w-[260px]">
                <DropdownMenuLabel>Exclude from Valid% and denominators</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(["missing", "out_of_screen", "other"] as const).map((k) => (
                  <DropdownMenuCheckboxItem
                    checked={invalidCats().includes(k as any)}
                    onChange={(v) => {
                      const s = new Set(invalidCats() as string[]);
                      if (v) s.add(k);
                      else s.delete(k);
                      const arr = Array.from(s) as any[];
                      setInvalidCats(arr.length ? (arr as any) : ["missing"]);
                    }}
                  >
                    {k}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* row 3: sliders + aggregate mode + compute */}
          <div class="flex flex-wrap items-center gap-4 pt-1">
            <div class="flex items-center gap-3 min-w-[260px]">
              <div class="text-sm whitespace-nowrap">Min recording valid %:</div>
              <div class="flex-1">
                <Slider value={[minValidPct()]} minValue={0} maxValue={100} step={1}
                        onChange={(v) => setMinValidPct(v[0] ?? 0)}>
                  <SliderTrack>
                    <SliderFill />
                  </SliderTrack>
                  <SliderThumb />
                </Slider>
              </div>
              <div class="w-10 text-right tabular-nums text-xs">{minValidPct().toFixed(0)}%</div>
            </div>

            <div class="flex items-center gap-3 min-w-[260px]">
              <div class="text-sm whitespace-nowrap">Correct threshold %:</div>
              <div class="flex-1">
                <Slider value={[thresholdPct()]} minValue={0} maxValue={100} step={1}
                        onChange={(v) => setThresholdPct(v[0] ?? 0)}>
                  <SliderTrack>
                    <SliderFill />
                  </SliderTrack>
                  <SliderThumb />
                </Slider>
              </div>
              <div class="w-10 text-right tabular-nums text-xs">{thresholdPct().toFixed(0)}%</div>
            </div>

            {/* Aggregation mode */}
            <div class="flex items-center gap-3 min-w-[260px]">
              <div class="text-sm whitespace-nowrap">Aggregate mode:</div>
              <Select
                value={aggMode()}
                onChange={(v) => setAggMode((v as any) ?? "discrete")}
                options={["discrete", "continuous"]}
                optionValue={(o) => o}
                optionTextValue={(o) => o}
                itemComponent={(props) => <SelectItem item={props.item}>{props.item.rawValue as string}</SelectItem>}
              >
                <SelectTrigger>
                  <SelectValue>{aggMode()}</SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>

            <Button onClick={compute} disabled={busy()} class="ml-auto">
              <RefreshCcw class="mr-2 h-4 w-4" /> {busy() ? "Computing…" : "Compute"}
            </Button>
          </div>

          <div class="text-xs text-muted-foreground">{tests().length} tests selected • {participants().length} participants</div>

          <div class="flex flex-wrap gap-4 pt-1">
            {renderBlueSummary()}
            {renderRedSummary()}
          </div>
        </CardContent>
      </Card>

      {/* Participants ≥ threshold pie */}
      <Card>
        <CardHeader>
          <CardTitle>{firstCardTitle()}</CardTitle>
        </CardHeader>
        <CardContent class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="text-sm text-muted-foreground">
            In <b>discrete</b> mode we compare each participant’s <b>mean</b> % in the blue set across tests.
            In <b>continuous</b> mode we pool samples and compare their <b>time-weighted</b> % in the blue set.
          </div>
          <div class="h-[240px]">
            <Show when={mounted()}>
              <PieChart data={pieData()} options={{ maintainAspectRatio: false, responsive: true }} />
            </Show>
          </div>
        </CardContent>
      </Card>

      {/* Time-series Compare */}
      <Card>
        <CardHeader>
          <CardTitle>Time-series Compare (with progressive draw & synced playback)</CardTitle>
        </CardHeader>
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
                <NumberFieldInput min={1} max={600} onInput={(e) => setViewSec(Math.max(1, +e.currentTarget.value || 1))} />
              </NumberField>
            </label>

            <div class="flex items-center gap-1 text-xs">
              <span class="text-muted-foreground pr-1">Presets:</span>
              <For each={DUR_PRESETS}>
                {(s) => (
                  <Button size="sm" variant={viewSec() === s ? "default" : "outline"} onClick={() => setViewSec(s)}>
                    {s}s
                  </Button>
                )}
              </For>
            </div>

            {/* play controls (both charts + images together) */}
            <div class="flex items-center gap-2 ml-auto">
              <Button size="icon" onClick={isPlaying() ? pause : play} disabled={duration() <= 0}>
                {isPlaying() ? "❚❚" : "►"}
              </Button>
              <Button size="icon" variant="secondary" onClick={stop} disabled={duration() <= 0}>■</Button>
              <input type="range"
                     min="0" max={duration()} step="0.01"
                     value={playSec()}
                     class="w-48 accent-primary-500"
                     onInput={(e) => {
                       const v = +e.currentTarget.value;
                       setPlaySec(v);
                       if (isPlaying()) playStart = performance.now() - v * 1000;
                     }} />
              <span class="text-xs tabular-nums">{playSec().toFixed(2)} / {duration().toFixed(2)} s</span>
            </div>
          </div>

          {/* selectors + charts + images */}
          <div class="grid gap-6 xl:grid-cols-2">
            {/* Left side */}
            <div class="space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <Select
                  value={selTest1()}
                  onChange={(v) => { setSelTest1(v || ""); /* reset selections */ setSelTimeline1(""); setSelRecording1(""); }}
                  options={testNames()}
                  itemComponent={(p) => <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>}
                >
                  <SelectTrigger class="w-60">
                    <SelectValue>{selTest1() || "Select test…"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>

                <Select
                  value={selPart1()}
                  onChange={(v) => { setSelPart1(v || ""); setSelTimeline1(""); setSelRecording1(""); }}
                  options={participants()}
                  itemComponent={(p) => <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>}
                >
                  <SelectTrigger class="w-60">
                    <SelectValue>{selPart1() || "Select participant…"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>

                {/* timeline/recording selects appear when needed */}
                <Show when={combos1().length > 1}>
                  <Select
                    value={selTimeline1()}
                    onChange={(v) => { setSelTimeline1(v || ""); setSelRecording1(""); }}
                    options={timelines1()}
                    itemComponent={(p) => <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>}
                  >
                    <SelectTrigger class="w-56">
                      <SelectValue>{selTimeline1() || "Select timeline…"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>

                  <Select
                    value={selRecording1()}
                    onChange={(v) => setSelRecording1(v || "")}
                    options={recOpts1()}
                    itemComponent={(p) => <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>}
                  >
                    <SelectTrigger class="w-56">
                      <SelectValue>{selRecording1() || "Select recording…"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </Show>
              </div>

              <Show when={combos1().length <= 1 || (selTimeline1() && selRecording1())} fallback={
                <div class="rounded border px-3 py-2 text-xs text-amber-700 bg-amber-50">
                  Multiple sessions found. Please choose <b>timeline</b> and <b>recording</b> to render.
                </div>
              }>
                <div class="h-[360px] rounded border">
                  <Show when={mounted() && viz1().datasets.length} fallback={<div class="h-full grid place-items-center text-sm text-muted-foreground">No data</div>}>
                    <LineChart ref={setLeftChartRef} data={viz1()} options={compareOpts()} />
                  </Show>
                </div>
              </Show>

              {/* Stimulus + gaze overlay (LEFT) */}
              <div class="rounded border p-3">
                <div class="text-xs text-muted-foreground mb-2">
                  {selTest1() ? <>Current word: <b>{currentWord1() ?? "(none)"}</b></> : "(select a test)"}
                </div>
                <Show when={imgUrl1()} fallback={<div class="h-[220px] grid place-items-center text-sm text-muted-foreground">No image</div>}>
                  <div class="relative w-full flex justify-center">
                    <img
                      ref={el => (img1El = el)}
                      src={imgUrl1()!}
                      alt="stimulus left"
                      onLoad={() => {
                        if (!canvas1El || !img1El) return;
                        canvas1El.width = img1El.clientWidth;
                        canvas1El.height = img1El.clientHeight;
                        drawFrameLeft(playSec());
                      }}
                      class="max-h-[240px] max-w-full object-contain rounded-md border"
                    />
                    <canvas ref={el => (canvas1El = el)} class="absolute inset-0 pointer-events-none" />
                  </div>
                  {/* gradient legend */}
                  <div class="flex items-center gap-2 justify-center mt-2">
                    <span class="text-[10px] text-muted-foreground">old</span>
                    <div class="h-2 w-28 rounded-full"
                      style="background: linear-gradient(to right, hsl(220 100% 50%), hsl(0 100% 50%))" />
                    <span class="text-[10px] text-muted-foreground">new</span>
                  </div>
                </Show>
              </div>
            </div>

            {/* Right side */}
            <div class="space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <Select
                  value={selTest2()}
                  onChange={(v) => { setSelTest2(v || ""); setSelTimeline2(""); setSelRecording2(""); }}
                  options={testNames()}
                  itemComponent={(p) => <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>}
                >
                  <SelectTrigger class="w-60">
                    <SelectValue>{selTest2() || "Select test…"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>

                <Select
                  value={selPart2()}
                  onChange={(v) => { setSelPart2(v || ""); setSelTimeline2(""); setSelRecording2(""); }}
                  options={participants()}
                  itemComponent={(p) => <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>}
                >
                  <SelectTrigger class="w-60">
                    <SelectValue>{selPart2() || "Select participant…"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>

                <Show when={combos2().length > 1}>
                  <Select
                    value={selTimeline2()}
                    onChange={(v) => { setSelTimeline2(v || ""); setSelRecording2(""); }}
                    options={timelines2()}
                    itemComponent={(p) => <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>}
                  >
                    <SelectTrigger class="w-56">
                      <SelectValue>{selTimeline2() || "Select timeline…"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>

                  <Select
                    value={selRecording2()}
                    onChange={(v) => setSelRecording2(v || "")}
                    options={recOpts2()}
                    itemComponent={(p) => <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>}
                  >
                    <SelectTrigger class="w-56">
                      <SelectValue>{selRecording2() || "Select recording…"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </Show>
              </div>

              <Show when={combos2().length <= 1 || (selTimeline2() && selRecording2())} fallback={
                <div class="rounded border px-3 py-2 text-xs text-amber-700 bg-amber-50">
                  Multiple sessions found. Please choose <b>timeline</b> and <b>recording</b> to render.
                </div>
              }>
                <div class="h-[360px] rounded border">
                  <Show when={mounted() && viz2().datasets.length} fallback={<div class="h-full grid place-items-center text-sm text-muted-foreground">No data</div>}>
                    <LineChart ref={setRightChartRef} data={viz2()} options={compareOpts()} />
                  </Show>
                </div>
              </Show>

              {/* Stimulus + gaze overlay (RIGHT) */}
              <div class="rounded border p-3">
                <div class="text-xs text-muted-foreground mb-2">
                  {selTest2() ? <>Current word: <b>{currentWord2() ?? "(none)"}</b></> : "(select a test)"}
                </div>
                <Show when={imgUrl2()} fallback={<div class="h-[220px] grid place-items-center text-sm text-muted-foreground">No image</div>}>
                  <div class="relative w-full flex justify-center">
                    <img
                      ref={el => (img2El = el)}
                      src={imgUrl2()!}
                      alt="stimulus right"
                      onLoad={() => {
                        if (!canvas2El || !img2El) return;
                        canvas2El.width = img2El.clientWidth;
                        canvas2El.height = img2El.clientHeight;
                        drawFrameRight(playSec());
                      }}
                      class="max-h-[240px] max-w-full object-contain rounded-md border"
                    />
                    <canvas ref={el => (canvas2El = el)} class="absolute inset-0 pointer-events-none" />
                  </div>
                  <div class="flex items-center gap-2 justify-center mt-2">
                    <span class="text-[10px] text-muted-foreground">old</span>
                    <div class="h-2 w-28 rounded-full"
                      style="background: linear-gradient(to right, hsl(220 100% 50%), hsl(0 100% 50%))" />
                    <span class="text-[10px] text-muted-foreground">new</span>
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison cards (multi) */}
      <For each={compareBy()}>
        {(field) => {
          const rowsFor = createMemo(() => makeCompare(field));
          return (
            <Card>
              <CardHeader>
                <CardTitle>Comparison by {field.split("_").join(" ")} ({aggMode()})</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="overflow-x-auto">
                  <table class="min-w-full text-sm">
                    <thead>
                      <tr class="text-left">
                        <th class="px-2 py-1">Bucket</th>
                        <th class="px-2 py-1">Tests</th>
                        <th class="px-2 py-1">Participants</th>
                        <th class="px-2 py-1">Mean %</th>
                        <th class="px-2 py-1">Median %</th>
                        <th class="px-2 py-1"># ≥ {thresholdPct()}%</th>
                        <th class="px-2 py-1">Top participants</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={rowsFor()}>
                        {(r) => (
                          <tr>
                            <td class="px-2 py-1">{r.bucket}</td>
                            <td class="px-2 py-1">{r.tests}</td>
                            <td class="px-2 py-1">{r.participants}</td>
                            <td class="px-2 py-1">{r.mean.toFixed(1)}%</td>
                            <td class="px-2 py-1">{r.median.toFixed(1)}%</td>
                            <td class="px-2 py-1">{r.geThresh}</td>
                            <td class="px-2 py-1">
                              <div class="flex flex-wrap gap-2">
                                <For each={r.leaders}>{(x) => <Badge variant="secondary">{x.id}: {x.pct.toFixed(1)}%</Badge>}</For>
                              </div>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        }}
      </For>

      {/* Detailed table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Rows (test × participant)</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={makeColumns()} data={rows()} />
        </CardContent>
      </Card>

      {/* Explainer */}
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <CircleHelp class="w-5 h-5" /> Notes
          </CardTitle>
        </CardHeader>
        <CardContent class="prose prose-sm max-w-none text-muted-foreground">
          <ul class="list-disc pl-5 space-y-2">
            <li><b>Progressive draw</b>: the line charts are clipped to the current time so you can watch the curves being “traced” as playback advances.</li>
            <li><b>% Valid</b> line shows (per bin) the proportion of samples not in the selected invalid categories.</li>
            <li><b>Stimulus overlays</b> use the same point-by-time logic and heat-hue gradient as <code>gaze-analysis.tsx</code>, synced to the same playhead.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
