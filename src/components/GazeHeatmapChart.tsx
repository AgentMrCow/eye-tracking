// src/components/GazeHeatmapChart.tsx

import { createSignal, onMount } from 'solid-js';
import { fetchGazeHeatmap, GazeData } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScatterChart } from '@/components/ui/charts';

const GazeHeatmapChart = () => {
  const [chartData, setChartData] = createSignal<any>(null);

  onMount(async () => {
    const data: GazeData[] = await fetchGazeHeatmap();

    const scatterData = data.map(d => ({
      x: d.gaze_point_x,
      y: d.gaze_point_y,
      r: Math.min(d.count, 50) // Adjust radius based on count
    }));

    setChartData({
      datasets: [
        {
          label: 'Gaze Heatmap',
          data: scatterData,
          backgroundColor: 'rgba(255, 99, 132, 0.5)'
        }
      ]
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gaze Heatmap</CardTitle>
      </CardHeader>
      <CardContent class="h-64 w-full">
        {chartData() ? <ScatterChart data={chartData()} /> : <p>Loading...</p>}
      </CardContent>
    </Card>
  );
};

export default GazeHeatmapChart;
