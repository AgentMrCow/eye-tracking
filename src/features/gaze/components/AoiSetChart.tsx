import { LineChart } from "@/components/ui/charts";
import type { BoxTypes } from "../types";

type RowPoint = { t: number } & Record<string, number>;
type Sets = Record<"correct_AOIs" | "potentially_correct_AOIs" | "incorrect_AOIs" | "correct_NULL" | "potentially_correct_NULL" | "incorrect_NULL", Set<BoxTypes>>;

type Props = {
  rows: { timestamp: string } & Record<string, number>[];
  baseMs: number;
  viewSec: number;
  sets: Sets;
};

export default function AoiSetChart(p: Props) {
  const dat = () => p.rows.map(r => ({ t: (+new Date(r.timestamp) - p.baseMs) / 1000, ...r })) as RowPoint[];

  const mk = (label: string, boxes: Set<BoxTypes>, color: string, dash: number[] = []) => {
    if (!boxes.size) return null;
    const data = dat().map(r => {
      let sum = 0; boxes.forEach(b => sum += (r[b] ?? 0)); return { x: r.t, y: sum };
    });
    return { label, data, borderColor: color, backgroundColor: "transparent",
      borderDash: dash, borderWidth: 1, pointRadius: 1, tension: 0.2, fill: false };
  };

  const datasets = [
    mk("correct_AOIs",             p.sets.correct_AOIs,             "green"),
    mk("potentially_correct_AOIs", p.sets.potentially_correct_AOIs, "teal", [6, 4]),
    mk("incorrect_AOIs",           p.sets.incorrect_AOIs,           "red"),
    mk("correct_NULL",             p.sets.correct_NULL,             "#444", [2, 2]),
    mk("potentially_correct_NULL", p.sets.potentially_correct_NULL, "#777", [8, 4]),
    mk("incorrect_NULL",           p.sets.incorrect_NULL,           "orange"),
  ].filter(Boolean) as any[];

  return (
    <div class="h-[400px]">
      <LineChart
        data={{ datasets }}
        options={{
          responsive: true, maintainAspectRatio: false,
          scales: { x: { type: "linear", min: 0, max: p.viewSec }, y: { beginAtZero: true, max: 100 } },
          plugins: { legend: { position: "top", align: "start", labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } } } },
        }}
      />
    </div>
  );
}
