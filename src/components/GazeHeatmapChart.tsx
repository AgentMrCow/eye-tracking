// src/components/GazeHeatmapChart.tsx

import { createSignal, onMount } from 'solid-js';
import { fetchGazeHeatmap, GazeData } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScatterChart } from '@/components/ui/charts';

const GazeHeatmapChart = () => {
  const [chartData, setChartData] = createSignal<any>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      const data: GazeData[] = await fetchGazeHeatmap();

      const scatterData = data.map(d => ({
        x: d.gazePointX,
        y: d.gazePointY,
        r: Math.min(d.count, 50), // Adjust radius based on count
      }));

      setChartData({
        datasets: [
          {
            label: 'Gaze Heatmap',
            data: scatterData,
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
          },
        ],
      });
    } catch (err) {
      setError(`Failed to fetch heatmap data: ${err}`);
    } finally {
      setLoading(false);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gaze Heatmap</CardTitle>
      </CardHeader>
      <CardContent class="h-64 w-full">
        {loading() ? (
          <p>Loading...</p>
        ) : error() ? (
          <p class="text-red-500">{error()}</p>
        ) : (
          <ScatterChart data={chartData()} />
        )}
      </CardContent>
    </Card>
  );
};

export default GazeHeatmapChart;
