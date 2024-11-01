// src/components/AverageGazePointsChart.tsx

import { createSignal, onMount } from 'solid-js';
import { fetchAverageGazePoints, GazeData } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart } from '@/components/ui/charts';

const AverageGazePointsChart = () => {
  const [chartData, setChartData] = createSignal<any>(null);

  onMount(async () => {
    const data: GazeData[] = await fetchAverageGazePoints();

    const labels = data.map(d => d.gaze_point_x.toFixed(2)); // Replace with participant names if needed
    const counts = data.map(d => d.count);

    setChartData({
      labels,
      datasets: [
        {
          label: 'Average Gaze Points',
          data: counts,
          backgroundColor: 'rgba(54, 162, 235, 0.5)'
        }
      ]
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Average Gaze Points per Participant</CardTitle>
      </CardHeader>
      <CardContent class="h-64 w-full">
        {chartData() ? <BarChart data={chartData()} /> : <p>Loading...</p>}
      </CardContent>
    </Card>
  );
};

export default AverageGazePointsChart;
