// src/components/GazeOverTimeChart.tsx

import { createSignal, onMount } from 'solid-js';
import { fetchGazeOverTime, AggregatedData } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart } from '@/components/ui/charts';

const GazeOverTimeChart = () => {
  const [chartData, setChartData] = createSignal<any>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      const data: AggregatedData = await fetchGazeOverTime();

      setChartData({
        labels: data.data.map((_, index) => `Time ${index + 1}`), // Replace with actual time labels if available
        datasets: [
          {
            label: data.label,
            data: data.data,
            fill: false,
            borderColor: 'rgb(75, 192, 192)',
            tension: 0.1,
          },
        ],
      });
    } catch (err) {
      setError(`Failed to fetch gaze over time data: ${err}`);
    } finally {
      setLoading(false);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gaze Points Over Time</CardTitle>
      </CardHeader>
      <CardContent class="h-64 w-full">
        {loading() ? (
          <p>Loading...</p>
        ) : error() ? (
          <p class="text-red-500">{error()}</p>
        ) : (
          <LineChart data={chartData()} />
        )}
      </CardContent>
    </Card>
  );
};

export default GazeOverTimeChart;
