import { For } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart } from "@/components/ui/charts";
import { Badge } from "@/components/ui/badge";
import type { CompareBy } from "../types";
import { FIELD_MAP } from "../constants";
import { median } from "../utils";

type DetailedRow = {
  test: string; participant: string;
  blue: number; red: number; pctBlue: number;
  group: string | null; truth: string | null; series: string | null;
  morph: string | null; pos: string | null; case_no: number | null;
};

type Props = {
  title: string;
  pieData: any;
  thresholdPct: number;
  aggMode: "discrete" | "continuous";
  compareBy: CompareBy[];
  rows: DetailedRow[];
};

export default function SummaryCards(p: Props) {
  const makeCompare = (field: CompareBy) => {
    const keyOnRow = FIELD_MAP[field];
    const byBucket = new Map<string, DetailedRow[]>();
    p.rows.forEach((r) => {
      const bucket = String((r as any)[keyOnRow] ?? "—");
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket)!.push(r);
    });

    const result: { bucket: string; tests: number; participants: number; mean: number; median: number; geThresh: number; leaders: { id: string; pct: number }[] }[] = [];
    byBucket.forEach((rws, bucket) => {
      const testSet = new Set(rws.map((r) => r.test));
      const perP = new Map<string, { pcts: number[]; blue: number; red: number }>();
      rws.forEach((r) => {
        const rec = perP.get(r.participant) ?? { pcts: [], blue: 0, red: 0 };
        rec.pcts.push(r.pctBlue); rec.blue += r.blue; rec.red += r.red; perP.set(r.participant, rec);
      });

      const metrics: { id: string; value: number }[] = [];
      perP.forEach((acc, id) => {
        const disc = acc.pcts.length ? acc.pcts.reduce((a, b) => a + b, 0) / acc.pcts.length : 0;
        const den = acc.blue + acc.red;
        const cont = den ? (acc.blue / den) * 100 : 0;
        metrics.push({ id, value: p.aggMode === "discrete" ? disc : cont });
      });

      const mVals = metrics.map((x) => x.value);
      const mean = mVals.length ? mVals.reduce((a, b) => a + b, 0) / mVals.length : 0;
      const med = median(mVals);
      const ge = metrics.filter((x) => x.value >= p.thresholdPct).length;
      const leaders = metrics.sort((a, b) => b.value - a.value).slice(0, 3).map((x) => ({ id: x.id, pct: x.value }));

      result.push({ bucket, tests: testSet.size, participants: perP.size, mean, median: med, geThresh: ge, leaders });
    });

    return result.sort((a, b) => a.bucket.localeCompare(b.bucket));
  };

  return (
    <>
      <Card>
        <CardHeader><CardTitle>{p.title}</CardTitle></CardHeader>
        <CardContent class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="text-sm text-muted-foreground">
            In <b>discrete</b> mode we compare each participant’s <b>mean</b> % in the blue set across tests.
            In <b>continuous</b> mode we pool samples and compare their <b>time-weighted</b> % in the blue set.
          </div>
          <div class="h-[240px]"><PieChart data={p.pieData} options={{ maintainAspectRatio: false, responsive: true }} /></div>
        </CardContent>
      </Card>

      <For each={p.compareBy}>
        {(field) => {
          const rowsFor = makeCompare(field);
          return (
            <Card>
              <CardHeader><CardTitle>Comparison by {field.split("_").join(" ")} ({p.aggMode})</CardTitle></CardHeader>
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
                        <th class="px-2 py-1"># ≥ {p.thresholdPct}%</th>
                        <th class="px-2 py-1">Top participants</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsFor.map((r) => (
                        <tr>
                          <td class="px-2 py-1">{r.bucket}</td>
                          <td class="px-2 py-1">{r.tests}</td>
                          <td class="px-2 py-1">{r.participants}</td>
                          <td class="px-2 py-1">{r.mean.toFixed(1)}%</td>
                          <td class="px-2 py-1">{r.median.toFixed(1)}%</td>
                          <td class="px-2 py-1">{r.geThresh}</td>
                          <td class="px-2 py-1">
                            <div class="flex flex-wrap gap-2">
                              {r.leaders.map((x) => <Badge variant="secondary">{x.id}: {x.pct.toFixed(1)}%</Badge>)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        }}
      </For>
    </>
  );
}
