// src/components/AverageGazePointsChart.tsx

import { createSignal, onMount } from 'solid-js';
import { fetchAverageGazePoints, GazeData } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart } from '@/components/ui/charts';

const AverageGazePointsChart = () => {
  const [chartData, setChartData] = createSignal<any>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      const data: GazeData[] = await fetchAverageGazePoints();

      const labels = data.map(d => d.participantName);
      const counts = data.map(d => d.count);

      setChartData({
        labels,
        datasets: [
          {
            label: 'Average Gaze Points',
            data: counts,
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
          },
        ],
      });
    } catch (err) {
      setError(`Failed to fetch average gaze points: ${err}`);
    } finally {
      setLoading(false);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Average Gaze Points per Participant</CardTitle>
      </CardHeader>
      <CardContent class="h-64 w-full">
        {loading() ? (
          <p>Loading...</p>
        ) : error() ? (
          <p class="text-red-500">{error()}</p>
        ) : (
          <BarChart data={chartData()} />
        )}
      </CardContent>
    </Card>
  );
};

export default AverageGazePointsChart;
