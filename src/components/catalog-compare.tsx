// src/components/catalog-compare.tsx
import { createMemo, createSignal, For, Show, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

/* UI */
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
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
import { PieChart } from "@/components/ui/charts";

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

/* AOI map + helpers */
type BoxTypes =
  | "Animal 1" | "Object 1 for Animal 1" | "Object 2 for Animal 1"
  | "Animal 2" | "Object 1 for Animal 2" | "Object 2 for Animal 2"
  | "Animal 3" | "Object 1 for Animal 3" | "Object 2 for Animal 3"
  | "other" | "missing" | "out_of_screen";

// NOTE: keep your current mapping
const AOI_CODE_TO_BOX: Record<string, Exclude<BoxTypes, "other" | "missing" | "out_of_screen">> = {
  S1: "Animal 1",  O1A: "Object 1 for Animal 1", O2A: "Object 2 for Animal 1",
  S2: "Animal 2",  O1B: "Object 1 for Animal 2", O2B: "Object 2 for Animal 2",
  S3: "Animal 3",  O1C: "Object 1 for Animal 3", O2C: "Object 2 for Animal 3",
};

type AoiKey =
  | "correct_AOIs"
  | "potentially_correct_AOIs"
  | "incorrect_AOIs"
  | "correct_NULL"
  | "potentially_correct_NULL"
  | "incorrect_NULL";

const AOI_KEY_LABEL: Record<AoiKey, string> = {
  correct_AOIs: "correct AOIs",
  potentially_correct_AOIs: "potentially correct AOIs",
  incorrect_AOIs: "incorrect AOIs",
  correct_NULL: "correct NULL",
  potentially_correct_NULL: "potentially correct NULL",
  incorrect_NULL: "incorrect NULL",
};

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
  blue: number;   // NEW: counts for continuous weighting
  red: number;    // NEW: counts for continuous weighting
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
  meanPct: number;      // discrete (unweighted mean across tests)
  weightedPct: number;  // continuous (time-weighted)
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
   Component
   ────────────────────────────────────────────────────────────── */
const ALL_AOI_KEYS: AoiKey[] = [
  "correct_AOIs",
  "potentially_correct_AOIs",
  "incorrect_AOIs",
  "correct_NULL",
  "potentially_correct_NULL",
  "incorrect_NULL",
];

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
  const [minValidPct, setMinValidPct] = createSignal(0);
  const [thresholdPct, setThresholdPct] = createSignal(50);

  /* Compare-by (multi) */
  const [compareBy, setCompareBy] = createSignal<CompareBy[]>(["truth_value"]);

  /* NEW: aggregation mode */
  const [aggMode, setAggMode] = createSignal<AggMode>("discrete");

  /* compute results */
  const [busy, setBusy] = createSignal(false);
  const [rows, setRows] = createSignal<DetailedRow[]>([]);
  const [pSummary, setPSummary] = createSignal<ParticipantSummary[]>([]);
  const [mounted, setMounted] = createSignal(false); // for Chart.js safe mount

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

  /* utility: AOI boxes for a row given a selection of AOI keys */
  function boxesFor(row: TestCatalogRow, keys: AoiKey[]): Set<BoxTypes> {
    const sets = keys.map((k) => parseAoiList(row[k]));
    return unionSets(sets);
  }

  /* main compute */
  async function compute() {
    setBusy(true);
    const out: DetailedRow[] = [];
    try {
      const t = tests();
      const parts = participants();

      // cache AOI sets per test for performance
      const blueMap = new Map<string, Set<BoxTypes>>();
      const redMap = new Map<string, Set<BoxTypes>>();
      t.forEach((r) => {
        blueMap.set(r.test_name, boxesFor(r, blueKeys()));
        const rk = redCustom()
          ? redKeys().filter((k) => !blueKeys().includes(k)) // never overlap
          : ALL_AOI_KEYS.filter((k) => !blueKeys().includes(k));
        redMap.set(r.test_name, boxesFor(r, rk));
      });

      for (const row of t) {
        for (const p of parts) {
          // NOTE: send both snake_case and camelCase for HTTP IPC compatibility
          const gaze = (await invoke<GazeData[]>("get_gaze_data", {
            test_name: row.test_name,
            testName: row.test_name,
            participants: [p],
          }).catch(() => [])) as GazeData[];

          if (!gaze.length) continue;

          const total = gaze.length;
          const missing = gaze.filter((g) => g.box_name === "missing").length;
          const valid = total - missing;
          const validPct = total ? (valid / total) * 100 : 0;
          if (validPct < minValidPct()) continue;

          let blue = 0, red = 0;
          const blueBoxes = blueMap.get(row.test_name)!;
          const redBoxes  = redMap.get(row.test_name)!;

          for (const g of gaze) {
            const b = g.box_name as BoxTypes;
            if (b === "missing" || b === "out_of_screen" || b === "other") continue;
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
            blue,   // NEW
            red,    // NEW
            pctBlue,
          });
        }
      }

      setRows(out);

      // participant summaries: discrete (mean of pctBlue) AND continuous (weighted by samples)
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
    } finally {
      setBusy(false);
    }
  }

  /* pie data (respects aggregation mode) */
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

  /* comparison cards */
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
    const lbls = blueKeys().map((k) => AOI_KEY_LABEL[k]).join(" + ");
    const mode = aggMode() === "discrete" ? "discrete" : "continuous";
    return `Participants ≥ threshold (${mode}, % in ${lbls})`;
  });

  /* badge builders */
  const renderBlueSummary = () => (
    <div class="flex flex-wrap gap-1">
      <For each={blueKeys()}>{(k) => <Badge variant="secondary">{AOI_KEY_LABEL[k]}</Badge>}</For>
    </div>
  );
  const renderRedSummary = () => (
    <div class="flex flex-wrap gap-1">
      <Badge variant={redCustom() ? "default" : "secondary"}>{redCustom() ? "custom compare set" : "auto: remaining"}</Badge>
      <Show when={redCustom()}>
        <For each={redKeys()}>{(k) => <Badge variant="outline">{AOI_KEY_LABEL[k]}</Badge>}</For>
      </Show>
    </div>
  );

  onCleanup(() => {});

  return (
    <div class="space-y-6">
      <Card>
        <CardHeader class="flex flex-col gap-2">
          <CardTitle class="flex items-center gap-2">
            <Settings2 class="h-5 w-5" /> Catalog Comparison
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          {/* row 1: basic filters — NOTE: Solid-UI Select with options + itemComponent */}
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

          {/* row 2: AOI multi-selects + compare-by multi-select (DropdownMenus) */}
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
              <DropdownMenuContent class="min-w-[260px]">
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
                      {AOI_KEY_LABEL[k]}
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
              <DropdownMenuContent class="min-w-[280px]">
                <DropdownMenuLabel>Red set options</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => { setRedCustom(false); syncRed(); }}>Auto (remaining)</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setRedCustom(true)}>Custom selection…</DropdownMenuItem>
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
                          {AOI_KEY_LABEL[k]} {blueKeys().includes(k) ? "(in blue)" : ""}
                        </DropdownMenuCheckboxItem>
                      )}
                    </For>
                  </>
                </Show>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Compare-by multi */}
            <DropdownMenu placement="bottom-start">
              <DropdownMenuTrigger as={Button<"button">} variant="outline" class="justify-between">
                Compare by (multi) <ChevronDown class="w-4 h-4 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent class="min-w-[260px]">
                <DropdownMenuLabel>Choose dimensions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(["group", "truth_value", "only_position", "morpheme", "series", "case_no"] as CompareBy[]).map((f) => (
                  <DropdownMenuCheckboxItem
                    checked={compareBy().includes(f)}
                    onChange={(v) => {
                      const s = new Set(compareBy());
                      if (v) s.add(f);
                      else s.delete(f);
                      const arr = Array.from(s);
                      setCompareBy(arr.length ? arr : ["truth_value"]);
                    }}
                  >
                    {f.split("_").join(" ")}
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
                <Slider
                  value={[minValidPct()]}
                  minValue={0}
                  maxValue={100}
                  step={1}
                  onChange={(v) => {
                    setMinValidPct(v[0] ?? 0);
                  }}
                />
              </div>
              <div class="w-10 text-right tabular-nums text-xs">{minValidPct().toFixed(0)}%</div>
            </div>

            <div class="flex items-center gap-3 min-w-[260px]">
              <div class="text-sm whitespace-nowrap">Correct threshold %:</div>
              <div class="flex-1">
                <Slider
                  value={[thresholdPct()]}
                  minValue={0}
                  maxValue={100}
                  step={1}
                  onChange={(v) => {
                    setThresholdPct(v[0] ?? 0);
                  }}
                />
              </div>
              <div class="w-10 text-right tabular-nums text-xs">{thresholdPct().toFixed(0)}%</div>
            </div>

            {/* Aggregation mode */}
            <div class="flex items-center gap-3 min-w-[260px]">
              <div class="text-sm whitespace-nowrap">Aggregate mode:</div>
              <Select
                value={aggMode()}
                onChange={(v) => setAggMode((v as AggMode) ?? "discrete")}
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

      {/* Participants ≥ threshold pie (guarded so Chart.js mounts after DOM is ready) */}
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

      {/* Comparison cards (multi) */}
      <For each={compareBy()}>
        {(field) => {
          // recompute when rows(), aggMode() or thresholdPct() change (they're read inside makeCompare)
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
                                <For each={r.leaders}>
                                  {(x) => <Badge variant="secondary">{x.id}: {x.pct.toFixed(1)}%</Badge>}
                                </For>
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

      {/* Explainer card */}
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <CircleHelp class="w-5 h-5" /> What everything means
          </CardTitle>
        </CardHeader>

        <CardContent class="prose prose-sm max-w-none text-muted-foreground">
          <ul class="list-disc pl-5 space-y-2">
            <li>
              <b>Blue set (AOIs)</b> — union of the selected AOI columns from the catalog
              (e.g., <i>correct_AOIs</i> + <i>potentially_correct_AOIs</i>). AOI codes
              like <code>S1</code>, <code>O1A</code>, … are mapped to boxes (Animal/Object).
            </li>

            <li>
              <b>Compare against (Red set)</b> — by default this is the remaining AOI columns
              not in Blue. If you switch to “custom”, you can pick a subset. Blue and Red are
              always disjoint so denominators stay valid.
            </li>

            <li>
              <b>Total</b> (per row in the detailed table) — number of gaze samples returned by
              <code>get_gaze_data</code> for the (test, participant). This includes all boxes
              (even <i>missing</i>, <i>out_of_screen</i>, <i>other</i>).
            </li>

            <li>
              <b>Valid</b> — samples that are not <i>missing</i>. Formally:
              <div class="mt-1"><code>valid = total − count(box = "missing")</code></div>
            </li>

            <li>
              <b>Min recording valid % filter</b> — removes (test, participant) rows when
              <code>valid_pct</code> is below the slider:
              <div class="mt-1"><code>valid_pct = valid / total × 100</code></div>
            </li>

            <li>
              <b>% in blue</b> (shown as “% in blue” and used for all comparisons) — computed only
              on samples that fall in the Blue or Red sets; samples in <i>other</i> or
              <i>out_of_screen</i> are excluded from the denominator:
              <div class="mt-1">
                <code>
                  pct_blue = blue / (blue + red) × 100
                </code>
              </div>
              where <code>blue</code> is count of samples whose box ∈ Blue, and
              <code>red</code> is count of samples whose box ∈ Red.
            </li>

            <li>
              <b>Aggregate mode</b> —
              <ul class="list-[circle] pl-5 mt-1 space-y-1">
                <li><b>discrete</b>: per participant, average the test-level <code>pct_blue</code> unweighted.</li>
                <li><b>continuous</b>: per participant, pool all samples across the selected tests and compute
                  <code> sum(blue) / sum(blue + red) × 100</code>.</li>
              </ul>
            </li>

            <li>
              <b>Participant mean %</b> (used for <i>discrete</i> mode) — arithmetic mean of a
              participant’s <code>pct_blue</code> across all selected tests that passed the “valid %” filter:
              <div class="mt-1">
                <code>
                  mean_i = (1 / n_i) · Σ<sub>t ∈ tests(i)</sub> pct_blue(i,t)
                </code>
              </div>
            </li>

            <li>
              <b>Participants ≥ threshold</b> (pie) — compares either the discrete mean or the continuous
              weighted % (depending on the selected aggregate mode) to the threshold.
            </li>

            <li>
              <b>Comparison cards</b> — for the selected “Compare by” field, rows are grouped
              into buckets. The Mean/Median/%≥X and “Top participants” are computed from the
              participant metrics according to the current aggregate mode.
            </li>

            <li>
              <b>Detailed table</b> — the raw (test × participant) rows: <i>Valid</i>,
              <i>Total</i>, and <i>% in blue</i> as defined above. Sorting/filtering/pagination
              are provided via the data table controls.
            </li>

            <li>
              <b>Edge cases</b> — if <code>blue + red = 0</code> for a row (all samples are
              <i>other</i>/<i>out_of_screen</i>/<i>missing</i>), we treat <code>pct_blue = 0</code>
              so that the row still participates in summaries without dividing by zero.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
