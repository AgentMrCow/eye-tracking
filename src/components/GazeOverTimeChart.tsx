// src/components/GazeOverTimeChart.tsx

import { createSignal, onMount } from 'solid-js';
import { fetchGazeOverTime, AggregatedData } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart } from '@/components/ui/charts';

const GazeOverTimeChart = () => {
  const [chartData, setChartData] = createSignal<any>(null);

  onMount(async () => {
    const data: AggregatedData = await fetchGazeOverTime();

    setChartData({
      labels: Array.from({ length: data.data.length }, (_, i) => `Time ${i + 1}`), // Replace with actual time labels if available
      datasets: [
        {
          label: data.label,
          data: data.data,
          fill: false,
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1
        }
      ]
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gaze Points Over Time</CardTitle>
      </CardHeader>
      <CardContent class="h-64 w-full">
        {chartData() ? <LineChart data={chartData()} /> : <p>Loading...</p>}
      </CardContent>
    </Card>
  );
};

export default GazeOverTimeChart;
