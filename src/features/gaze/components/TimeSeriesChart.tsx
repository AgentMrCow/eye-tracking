import { createMemo } from "solid-js";
import { LineChart } from "@/components/ui/charts";
import { Chart as ChartJS } from "chart.js";

const RevealClipPlugin = {
  id: "revealClip",
  beforeDatasetsDraw(chart: any, _args: any, pluginOpts: any) {
    const { ctx, chartArea, scales } = chart; if (!chartArea) return;
    const x = scales.x; const play: number = pluginOpts?.playSec ?? 0;
    const clipX = Math.max(chartArea.left, Math.min(x.getPixelForValue(play), chartArea.right));
    ctx.save(); ctx.beginPath(); ctx.rect(chartArea.left, chartArea.top, clipX - chartArea.left, chartArea.bottom - chartArea.top); ctx.clip();
  },
  afterDatasetsDraw(chart: any) { try { chart.ctx.restore(); } catch {} },
};

try { ChartJS.register(RevealClipPlugin as any); } catch {}

export default function TimeSeriesChart(props: {
  datasets: any[];
  playSec: number;
  viewSec: number;
}) {
  const data = createMemo(() => ({
    datasets: [
      ...props.datasets,
      { label: "playhead", data: [{ x: props.playSec, y: 0 }, { x: props.playSec, y: 100 }],
        borderColor: "#111", borderDash: [6,3], borderWidth: 1, pointRadius: 0, fill: false, tension: 0, _ph: true }
    ]
  }));

  const options = createMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    scales: { x: { type: "linear", min: 0, max: props.viewSec, ticks: { maxTicksLimit: 10 } }, y: { beginAtZero: true, max: 100 } },
    plugins: {
      legend: { position: "top" as const, align: "start" as const,
        labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 }, filter: (l: any, d: any) => !(d.datasets?.[l.datasetIndex]?._ph) } },
      tooltip: { mode: "index", intersect: false, filter: (c: any) => !(c.dataset?._ph),
        callbacks: { label: (c: any) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } },
      revealClip: { playSec: props.playSec },
    },
    animation: false,
  }));

  return <div class="h-[360px] rounded border">{data().datasets.length ? <LineChart data={data()} options={options()} /> : <div class="h-full grid place-items-center text-sm text-muted-foreground">No data</div>}</div>;
}
