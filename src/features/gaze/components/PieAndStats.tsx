import { For } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart } from "@/components/ui/charts";
import { Progress } from "@/components/ui/progress";
import JsonViewer from "@/components/ui/json-viewer";

type Props = {
  boxStats: Record<string, number>;
  colorMap: Record<string, string>;
  statsWhole: { pct_including_missing: number; pct_excluding_missing: number; pct_excluding_missing_oob: number; };
  validityCounts?: { total: number; missing: number; out_of_screen: number; inAoi: number };
};

export default function PieAndStats(p: Props) {
  const pieData = () => ({
    labels: Object.keys(p.boxStats),
    datasets: [{ data: Object.values(p.boxStats), backgroundColor: Object.keys(p.boxStats).map(k => p.colorMap[k] || "#888") }],
  });

  const equations = () => {
    const c = p.validityCounts;
    if (!c) return null;
    const denom2 = Math.max(0, c.total - c.missing);
    return {
      pct_including_missing: `(${c.total}-${c.missing})/${c.total} = ${(((c.total - c.missing) / Math.max(1,c.total)) * 100).toFixed(1)}%`,
      pct_excluding_missing: `${denom2}-${c.out_of_screen} / ${denom2} = ${(((Math.max(0, denom2 - c.out_of_screen)) / Math.max(1, denom2)) * 100).toFixed(1)}%`,
      pct_excluding_missing_oob: `${c.inAoi} / ${denom2} = ${((c.inAoi / Math.max(1, denom2)) * 100).toFixed(1)}%`,
      counts: c,
    };
  };

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
          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <JsonViewer title="Pie dataset (chart.js)" data={pieData()} />
            <JsonViewer title="Validity equations" data={equations() ?? { note: "counts unavailable" }} getExplanation={(d) =>
              `This shows how the validity percentages are computed using raw counts.\n`+
              `#1 includes missing: (total - missing) / total.\n`+
              `#2 excludes missing: (total - missing - out_of_screen) / (total - missing).\n`+
              `#3 excludes missing & out_of_screen (and 'other'): inAOI / (total - missing).`}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
