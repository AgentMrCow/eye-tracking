// frontend/src/App.jsx

import { createSignal, createEffect, onMount, For } from 'solid-js';
import { getGazeData } from './utils/tauri';
import { LineChartComponent, PieChartComponent, BarChartComponent } from './components/Charts';
import TestSelector from './components/Controls/TestSelector';
import ParticipantSelector from './components/Controls/ParticipantSelector';
import { Card, CardContent, CardHeader, CardTitle } from './components/UI/Card';
import { prepareLineChartData, preparePieChartData, prepareBarChartData } from './utils/dataTransform';

function App() {
  // State signals
  const [testName, setTestName] = createSignal('');
  const [participants, setParticipants] = createSignal([]);
  const [selectedParticipants, setSelectedParticipants] = createSignal([]);
  const [gazeData, setGazeData] = createSignal([]);

  // Fetch initial data on mount
  onMount(async () => {
    // Optionally, fetch available tests and participants from backend
    // For simplicity, using hardcoded values here
    setTestName('NOzinghaiT1_TS_video_apr18.mp4 & NOzinghaiT1_image_apr18.png');
    setParticipants(['TLK311', 'Participant2', 'Participant3']);
    setSelectedParticipants(['TLK311']); // Default selection
  });

  // Fetch gaze data whenever testName or selectedParticipants change
  createEffect(async () => {
    if (testName() && selectedParticipants().length > 0) {
      const data = await getGazeData(testName(), selectedParticipants());
      setGazeData(data);
    } else {
      setGazeData([]);
    }
  });

  return (
    <div class="p-4">
      <h1 class="text-2xl font-bold mb-4">Eye-Tracking Data Visualization</h1>
      
      {/* Selection Controls */}
      <div class="flex space-x-4 mb-6">
        <TestSelector 
          selectedTest={testName()} 
          onSelectTest={(test) => setTestName(test)} 
        />
        <ParticipantSelector 
          participants={participants()} 
          selectedParticipants={selectedParticipants()} 
          onSelectParticipants={(selected) => setSelectedParticipants(selected)} 
        />
      </div>
      
      {/* Charts */}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Gaze Points Over Time</CardTitle>
          </CardHeader>
          <CardContent class="h-64 w-full">
            <LineChartComponent data={prepareLineChartData(gazeData())} />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Box Distribution</CardTitle>
          </CardHeader>
          <CardContent class="h-64 w-full">
            <PieChartComponent data={preparePieChartData(gazeData())} />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Participant Comparison</CardTitle>
          </CardHeader>
          <CardContent class="h-64 w-full">
            <BarChartComponent data={prepareBarChartData(gazeData())} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default App;
