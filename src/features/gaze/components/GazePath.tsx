import { LineChart } from "@/components/ui/charts";
import type { GazeData } from "../types";

export default function GazePath(p: { gaze: GazeData[] }) {
  const data = () => ({
    datasets: [{
      label: "Gaze Path",
      data: p.gaze.filter(d => d.gaze_x !== null && d.gaze_y !== null).map(d => ({ x: d.gaze_x!, y: d.gaze_y! })),
      borderColor: "#8884d8", pointRadius: 0, fill: false, borderWidth: 1
    }]
  });

  return (
    <div class="h-[500px]">
      <LineChart
        data={data()}
        options={{
          maintainAspectRatio: false, responsive: true,
          scales: { y: { reverse: true, beginAtZero: true }, x: { beginAtZero: true } },
          plugins: { legend: { display: false } },
        }}
      />
    </div>
  );
}
