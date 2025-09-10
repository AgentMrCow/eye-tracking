import { For, Show, createMemo } from "solid-js";
import { LineChart } from "@/components/ui/charts";
import type { MetaKey, WordWindow } from "../types";
import { DEFAULT_COLORS } from "../constants";
import { parseAOISet } from "../utils";

type RowPoint = { timestamp: string } & Record<string, number>;
type Props = {
  rows: RowPoint[];
  baseMs: number;
  viewSec: number;
  wordWin: WordWindow[];
  selectedBoxes: () => Set<string>;
  colorMap: () => Record<string, string>;
  toggleMeta: (k: MetaKey) => void;
  activeMetaFilters: () => Set<MetaKey>;
  // Optional: raw AOI strings from catalog row to compute sizes locally
  aoiRow?: Partial<Record<MetaKey, string | null>> & Record<string, any>;
  testHasSetSizes?: () => Record<MetaKey, number>;
};

const META_KEYS: MetaKey[] = [
  "correct_AOIs","potentially_correct_AOIs","incorrect_AOIs",
  "correct_NULL","potentially_correct_NULL","incorrect_NULL",
];

export default function TimelineChart(p: Props) {
  const dat = () => p.rows.map(r => ({ t: (+new Date(r.timestamp) - p.baseMs) / 1000, ...r }));

  const ds = () => {
    const keys = Object.keys(DEFAULT_COLORS);
    return keys.map(b => {
      const sel = p.selectedBoxes();
      const hide = sel.size ? !sel.has(b) : false;
      return {
        label: b,
        data: dat().map(r => ({ x: r.t, y: (r as any)[b] || 0 })),
        borderColor: p.colorMap()[b] || DEFAULT_COLORS[b as keyof typeof DEFAULT_COLORS],
        backgroundColor: "transparent",
        borderDash: b.startsWith("Object 1") ? [12, 6] : b.startsWith("Object 2") ? [4, 4] : [],
        borderWidth: 1, pointRadius: 1, tension: 0.2, fill: false, hidden: hide,
      };
    });
  };

  const windowLines = () =>
    p.wordWin.flatMap(w => [
      { label: `${w.chinese_word} (start)`, data: [{ x: w.start_sec, y: 0 }, { x: w.start_sec, y: 100 }],
        borderColor: "#222", borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false, order: 0, _window: true },
      { label: `${w.chinese_word} (end)`,   data: [{ x: w.end_sec,   y: 0 }, { x: w.end_sec,   y: 100 }],
        borderColor: "#222", borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false, order: 0, _window: true },
    ]);

  const data = () => ({ datasets: [...ds(), ...windowLines()] });

  // Compute AOI sizes locally when possible for reliability
  const sizesLocal = createMemo<Record<MetaKey, number>>(() => {
    const row = p.aoiRow as any;
    if (!row) return { correct_AOIs:0, potentially_correct_AOIs:0, incorrect_AOIs:0, correct_NULL:0, potentially_correct_NULL:0, incorrect_NULL:0 };
    return {
      correct_AOIs:             parseAOISet(row?.correct_AOIs).length,
      potentially_correct_AOIs: parseAOISet(row?.potentially_correct_AOIs).length,
      incorrect_AOIs:           parseAOISet(row?.incorrect_AOIs).length,
      correct_NULL:             parseAOISet(row?.correct_NULL).length,
      potentially_correct_NULL: parseAOISet(row?.potentially_correct_NULL).length,
      incorrect_NULL:           parseAOISet(row?.incorrect_NULL).length,
    } as Record<MetaKey, number>;
  });

  // Word labels between window start/end using annotation plugin
  const wordAnnotations = () => {
    const entries = p.wordWin.map((w, i) => [
      `ww_label_${i}`,
      {
        type: "box",
        xMin: w.start_sec,
        xMax: w.end_sec,
        yMin: 92,
        yMax: 100,
        backgroundColor: "rgba(0,0,0,0)",
        borderWidth: 0,
        label: {
          display: true,
          content: w.chinese_word,
          position: "center",
          color: "#222",
          backgroundColor: "rgba(255,255,255,0.65)",
          font: { size: 10, style: 'normal', weight: 'normal' },
        },
      },
    ] as const);
    return Object.fromEntries(entries);
  };

  return (
    <div class="h-[500px] w-full">
      {/* AOI-set toggles */}
      <div class="flex flex-wrap gap-2 justify-end mb-2 text-xs relative z-50 pointer-events-auto">
        <For each={META_KEYS}>{k => {
          const sizes = p.aoiRow ? sizesLocal() : (p.testHasSetSizes ? p.testHasSetSizes() : sizesLocal());
          const size = (sizes?.[k] as number) ?? 0;
          const active = p.activeMetaFilters().has(k);
          const disabled = size === 0;
          return (
            <button type="button"
              class={`px-2 py-0.5 rounded border transition ${active ? "bg-primary text-primary-foreground" : "bg-muted"} ${disabled ? "opacity-50" : ""}`}
              style={{ 'pointer-events': 'auto', position: 'relative', 'z-index': 60 }}
              onClick={(e) => { e.stopPropagation(); if (!disabled) p.toggleMeta(k); }}
              onMouseDown={(e) => { e.stopPropagation(); if (!disabled) p.toggleMeta(k); }}
              onPointerDown={(e) => { e.stopPropagation(); if (!disabled) p.toggleMeta(k); }}
              title={k.replace(/_/g, " ")}
            >
              {k.replace(/_/g, " ")} {size ? `(${size})` : ""}
            </button>
          );
        }}</For>
      </div>

      <div class="h-full overflow-x-auto relative z-0">
        <div style={{ width: `100%`, height: "100%" }} class="relative z-0">
          <LineChart
            data={data()}
            options={{
              responsive: true, maintainAspectRatio: false,
              scales: { x: { type: "linear", min: 0, max: p.viewSec }, y: { beginAtZero: true, max: 100 } },
              plugins: {
                legend: { position: "top", align: "start", labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 },
                  filter: (l: any, d: any) => !(d.datasets?.[l.datasetIndex]?._window) } },
                tooltip: { mode: "index", intersect: false, filter: (c: any) => !(c.dataset?._window),
                  itemSort: (a: any, b: any) => b.parsed.y - a.parsed.y,
                  callbacks: { label: (c: any) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } },
                // @ts-ignore annotation plugin options (typed via plugin)
                annotation: { annotations: wordAnnotations() },
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
