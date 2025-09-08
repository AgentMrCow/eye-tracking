import { For, Show } from "solid-js";
import { LineChart } from "@/components/ui/charts";
import type { MetaKey, WordWindow } from "../types";
import { DEFAULT_COLORS } from "../constants";

type RowPoint = { timestamp: string } & Record<string, number>;
type Props = {
  rows: RowPoint[];
  baseMs: number;
  viewSec: number;
  wordWin: WordWindow[];
  selectedBoxes: Set<string>;
  colorMap: Record<string, string>;
  toggleMeta: (k: MetaKey) => void;
  activeMetaFilters: Set<MetaKey>;
  testHasSetSizes: Record<MetaKey, number>;
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
      const hide = p.selectedBoxes.size ? !p.selectedBoxes.has(b) : false;
      return {
        label: b,
        data: dat().map(r => ({ x: r.t, y: (r as any)[b] || 0 })),
        borderColor: p.colorMap[b] || DEFAULT_COLORS[b as keyof typeof DEFAULT_COLORS],
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

  return (
    <div class="h-[500px] w-full">
      {/* AOI-set toggles */}
      <div class="flex flex-wrap gap-2 justify-end mb-2 text-xs">
        <For each={META_KEYS}>{k => {
          const size = p.testHasSetSizes[k] ?? 0;
          const active = p.activeMetaFilters.has(k);
          const disabled = size === 0;
          return (
            <button
              class={`px-2 py-0.5 rounded border transition
                      ${active ? "bg-primary text-primary-foreground" : "bg-muted"}
                      ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              disabled={disabled}
              onClick={() => p.toggleMeta(k)}
              title={k.replace(/_/g, " ")}
            >
              {k.replace(/_/g, " ")}
            </button>
          );
        }}</For>
      </div>

      <div class="h-full overflow-x-auto">
        <div style={{ width: `100%`, height: "100%" }}>
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
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
