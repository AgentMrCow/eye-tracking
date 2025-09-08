import { For } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart } from "@/components/ui/charts";
import { Progress } from "@/components/ui/progress";

type Props = {
  boxStats: Record<string, number>;
  colorMap: Record<string, string>;
  statsWhole: { pct_including_missing: number; pct_excluding_missing: number; pct_excluding_missing_oob: number; };
};

export default function PieAndStats(p: Props) {
  const pieData = () => ({
    labels: Object.keys(p.boxStats),
    datasets: [{ data: Object.values(p.boxStats), backgroundColor: Object.keys(p.boxStats).map(k => p.colorMap[k] || "#888") }],
  });

  return (
    <>
      <Card>
        <CardHeader><CardTitle>Overall Gaze Distribution</CardTitle></CardHeader>
        <CardContent class="h-[420px]">
          <PieChart data={pieData()} options={{ maintainAspectRatio: false, responsive: true }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Box Distribution</CardTitle></CardHeader>
        <CardContent class="pt-4">
          <div class="grid gap-6 md:grid-cols-2">
            <For each={Object.entries(p.boxStats)}>{([b, val]) =>
              <div>
                <div class="flex justify-between mb-2 text-sm">
                  <span>{b}</span><span class="text-gray-500">{val.toFixed(1)}%</span>
                </div>
                <Progress value={val} class="h-3"
                  style={{ background: `${(p.colorMap[b] || "#999")}40`, "--progress-background": p.colorMap[b] || "#999" } as any}
                />
              </div>
            }</For>
          </div>
          <div class="text-xs text-muted-foreground mt-4 space-y-1">
            <div><b>#1</b> incl. missing: {p.statsWhole.pct_including_missing.toFixed(1)}%</div>
            <div><b>#2</b> excl. missing: {p.statsWhole.pct_excluding_missing.toFixed(1)}%</div>
            <div><b>#3</b> excl. missing & OOB: {p.statsWhole.pct_excluding_missing_oob.toFixed(1)}%</div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
