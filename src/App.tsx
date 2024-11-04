// src/App.tsx

import { Component } from 'solid-js';
import GazeOverTimeChart from '@/components/GazeOverTimeChart';
import AverageGazePointsChart from '@/components/AverageGazePointsChart';
import GazeHeatmapChart from '@/components/GazeHeatmapChart';
import TestComponent from '@/components/TestComponent';

const App: Component = () => {
  return (
    <div class="p-4 space-y-4">
      <GazeOverTimeChart />
      <AverageGazePointsChart />
      <GazeHeatmapChart />
      <TestComponent />
    </div>
  );
};

export default App;
