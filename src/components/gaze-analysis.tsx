import { createSignal, createEffect, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LineChart, PieChart } from "@/components/ui/charts";
import type { ChartData } from "chart.js";

interface GazeData {
  gaze_x: number;
  gaze_y: number;
  box_name: string;
  timestamp: string; // "2025-01-01T10:10:30.123Z"
  participant: string;
  test_name: string;
}

interface SelectOption {
  label: string;
  value: string;
}

type BoxTypes =
  | "Animal 1"
  | "Object 1 for Animal 1"
  | "Object 2 for Animal 1"
  | "Animal 2"
  | "Object 1 for Animal 2"
  | "Object 2 for Animal 2"
  | "Animal 3"
  | "Object 1 for Animal 3"
  | "Object 2 for Animal 3"
  | "others"
  | "out of screen";

/**
 * Color palette for different box types
 */
const COLORS: Record<BoxTypes, string> = {
  "Animal 1": "red",
  "Object 1 for Animal 1": "darkred",
  "Object 2 for Animal 1": "firebrick",
  "Animal 2": "blue",
  "Object 1 for Animal 2": "darkblue",
  "Object 2 for Animal 2": "royalblue",
  "Animal 3": "green",
  "Object 1 for Animal 3": "darkgreen",
  "Object 2 for Animal 3": "limegreen",
  "others": "grey",
  "out of screen": "#666666",
};

const GazeAnalysis = () => {
  // State management
  const [selectedTest, setSelectedTest] = createSignal<SelectOption | null>(null);
  const [selectedParticipants, setSelectedParticipants] = createSignal<SelectOption[]>([]);
  const [tests, setTests] = createSignal<SelectOption[]>([]);
  const [participants, setParticipants] = createSignal<SelectOption[]>([]);
  const [gazeData, setGazeData] = createSignal<GazeData[]>([]);
  const [boxStats, setBoxStats] = createSignal<Record<string, number>>({});
  const [timeseriesData, setTimeseriesData] = createSignal<any[]>([]);
  const [selectedInterval, setSelectedInterval] = createSignal<number>(1000);

  // Fetch initial test names and participants
  createEffect(async () => {
    try {
      const testsList = await invoke<string[]>("get_test_names");
      const participantsList = await invoke<string[]>("get_participants");

      setTests(testsList.map(test => ({ label: test, value: test })));
      setParticipants(participantsList.map(p => ({ label: p, value: p })));
    } catch (error) {
      console.error("Failed to load initial data:", error);
    }
  });

  // Fetch gaze data when test or participants change
  createEffect(async () => {
    if (selectedTest() && selectedParticipants().length > 0) {
      try {
        const data = await invoke<GazeData[]>("get_gaze_data", {
          testName: selectedTest()!.value,
          participants: selectedParticipants().map(p => p.value),
        });

        const stats = await invoke<{ box_percentages: Record<string, number> }>(
          "get_box_stats",
          {
            testName: selectedTest()!.value,
            participants: selectedParticipants().map(p => p.value),
          }
        );

        setGazeData(data);
        setBoxStats(stats.box_percentages);
      } catch (error) {
        console.error("Failed to fetch gaze data:", error);
      }
    }
  });

  // Process timeseries data when gazeData or interval changes
  createEffect(() => {
    if (gazeData().length > 0) {
      const processedData = processTimeseriesData(gazeData(), selectedInterval());
      setTimeseriesData(processedData);
    }
  });

  // Process time series data
  const processTimeseriesData = (data: GazeData[], intervalMs: number) => {
    const sortedData = [...data].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const timeGroups: Record<number, any> = {};

    for (const point of sortedData) {
      const timestampMs = new Date(point.timestamp).getTime();
      const floored = Math.floor(timestampMs / intervalMs) * intervalMs;

      if (!timeGroups[floored]) {
        timeGroups[floored] = {
          timestamp: floored,
          total: 0,
          ...Object.keys(COLORS).reduce((acc, key) => ({ ...acc, [key]: 0 }), {}),
        };
      }
      timeGroups[floored][point.box_name]++;
      timeGroups[floored].total++;
    }

    return Object.values(timeGroups)
      .map(group => {
        const g = group as {
          timestamp: number;
          total: number;
          [key: string]: any;
        };
        const result: Record<string, any> = {
          timestamp: new Date(g.timestamp).toISOString(),
        };
        Object.keys(COLORS).forEach(boxName => {
          result[boxName] = g.total
            ? ((g[boxName] || 0) / g.total) * 100
            : 0;
        });
        return result;
      })
      .sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
  };

  // Chart data preparation functions
  const getPieChartData = (): ChartData => ({
    labels: Object.keys(boxStats()),
    datasets: [
      {
        data: Object.values(boxStats()),
        backgroundColor: Object.keys(boxStats()).map(
          key => COLORS[key as BoxTypes] ?? "#000000"
        ),
      },
    ],
  });

  const getGazePathData = (): ChartData => ({
    datasets: [
      {
        label: "Gaze Path",
        data: gazeData().map(d => ({ x: d.gaze_x, y: d.gaze_y })),
        borderColor: "#8884d8",
        pointRadius: 0,
        fill: false,
        borderWidth: 1,
      },
    ],
  });

  const getTimeSeriesData = (): ChartData => ({
    labels: timeseriesData().map(d =>
      new Date(d.timestamp).toLocaleTimeString()
    ),
    datasets: Object.keys(COLORS).map(boxName => ({
      label: boxName,
      data: timeseriesData().map(d => d[boxName] || 0),
      borderColor: COLORS[boxName as BoxTypes],
      backgroundColor: "transparent",
      borderWidth: 1,
      pointRadius: 1,
      tension: 0.2,
      fill: false,
    })),
  });

  return (
    <div class="space-y-6">
      {/* Controls */}
      <div class="flex gap-4 flex-wrap">
        <Select<string>
          value={selectedTest()?.value ?? ""}
          onChange={value => {
            const selectedOption = tests().find(opt => opt.value === value);
            setSelectedTest(selectedOption || null);
          }}
          options={tests().map(t => t.value)}
          placeholder="Select test..."
          itemComponent={props => (
            <SelectItem item={props.item}>
              {tests().find(t => t.value === props.item.rawValue)?.label ||
                props.item.rawValue}
            </SelectItem>
          )}
        >
          <SelectTrigger aria-label="Test" class="w-64">
            <SelectValue>
              {() => selectedTest()?.label || "Select test..."}
            </SelectValue>
          </SelectTrigger>
          <SelectContent />
        </Select>

        <Select<string>
          multiple
          value={selectedParticipants().map(p => p.value)}
          onChange={values => {
            const selected = values
              .map(val => participants().find(p => p.value === val))
              .filter((p): p is SelectOption => p !== undefined);
            setSelectedParticipants(selected);
          }}
          options={participants().map(p => p.value)}
          placeholder="Select participants..."
          itemComponent={props => (
            <SelectItem item={props.item}>
              {participants().find(p => p.value === props.item.rawValue)?.label ||
                props.item.rawValue}
            </SelectItem>
          )}
        >
          <SelectTrigger aria-label="Participants" class="w-64">
            <SelectValue>
              {() =>
                selectedParticipants().length
                  ? `${selectedParticipants().length} selected`
                  : "Select participants..."
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent />
        </Select>

        <Select<string>
          value={selectedInterval().toString()}
          onChange={(value) => setSelectedInterval(parseInt(value ?? "1000"))}
          options={["200", "500", "1000", "2000", "5000"]}
          placeholder="Select interval ms..."
          itemComponent={(props) => (
            <SelectItem item={props.item}>{props.item.rawValue} ms</SelectItem>
          )}
        >
          <SelectTrigger aria-label="Interval" class="w-64">
            <SelectValue>
              {() => `Interval: ${selectedInterval()} ms`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent />
        </Select>
      </div>

      {/* Charts Grid */}
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Time Series */}
        <Card class="xl:col-span-2">
          <CardHeader>
            <CardTitle>Gaze Distribution Over Time</CardTitle>
          </CardHeader>
          <CardContent class="min-h-[700px] w-full">
            <LineChart
              data={getTimeSeriesData()}
              options={{
                maintainAspectRatio: false,
                responsive: true,
                scales: {
                  x: {
                    grid: {
                      display: true,
                      color: "rgba(0, 0, 0, 0.05)",
                    },
                    ticks: {
                      maxRotation: 0,
                      font: {
                        size: 10,
                        family: "'DejaVu Sans', 'Arial', sans-serif",
                      },
                    },
                  },
                  y: {
                    beginAtZero: true,
                    max: 100,
                    grid: {
                      display: true,
                      color: "rgba(0, 0, 0, 0.05)",
                    },
                    ticks: {
                      callback: (value) => `${value}%`,
                      font: {
                        size: 10,
                        family: "'DejaVu Sans', 'Arial', sans-serif",
                      },
                    },
                  },
                },
                interaction: {
                  mode: "nearest",
                  axis: "x",
                  intersect: false,
                },
                plugins: {
                  legend: {
                    position: "top",
                    align: "start",
                    onClick: (e, legendItem, legend) => {
                      const index = legendItem.datasetIndex;
                      const ci = legend.chart;
                      if (ci) {
                        ci.setDatasetVisibility(index, !ci.isDatasetVisible(index));
                        ci.update();
                      }
                    },
                    labels: {
                      usePointStyle: true,
                      padding: 10,
                      boxWidth: 8,
                      boxHeight: 8,
                      font: {
                        size: 10,
                        family: "'DejaVu Sans', 'Arial', sans-serif",
                      },
                    },
                  },
                  tooltip: {
                    mode: "index",
                    intersect: false,
                    callbacks: {
                      label: (context) =>
                        `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`,
                    },
                  },
                },
              }}
            />
          </CardContent>
        </Card>

        {/* Overall Distribution */}
        <Card class="xl:col-span-1">
          <CardHeader>
            <CardTitle>Overall Gaze Distribution</CardTitle>
          </CardHeader>
          <CardContent class="min-h-[500px] w-full">
            <PieChart
              data={getPieChartData()}
              options={{
                maintainAspectRatio: false,
                responsive: true,
                plugins: {
                  legend: {
                    position: "top",
                    onClick: (e, legendItem, legend) => {
                      const index = legendItem.datasetIndex;
                      const ci = legend.chart;
                      if (ci) {
                        ci.setDatasetVisibility(index, !ci.isDatasetVisible(index));
                        ci.update();
                      }
                    },
                    labels: {
                      font: {
                        size: 10,
                        family: "'DejaVu Sans', 'Arial', sans-serif",
                      },
                    },
                  },
                },
              }}
            />
          </CardContent>
        </Card>

        {/* Gaze Path */}
        <Card class="xl:col-span-1">
          <CardHeader>
            <CardTitle>Gaze Path</CardTitle>
          </CardHeader>
          <CardContent class="min-h-[500px] w-full">
            <LineChart
              data={getGazePathData()}
              options={{
                maintainAspectRatio: false,
                responsive: true,
                scales: {
                  y: {
                    reverse: true,
                    beginAtZero: true,
                  },
                  x: {
                    beginAtZero: true,
                  },
                },
                plugins: {
                  legend: {
                    display: false,
                  },
                },
              }}
            />
          </CardContent>
        </Card>

        {/* Box Distribution */}
        <Card class="xl:col-span-2">
          <CardHeader>
            <CardTitle>Box Distribution</CardTitle>
          </CardHeader>
          <CardContent class="min-h-[300px] w-full pt-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <For each={Object.entries(boxStats())}>
                {([box, percentage]) => (
                  <div>
                    <div class="flex justify-between mb-2">
                      <span class="text-sm font-medium">{box}</span>
                      <span class="text-sm text-gray-500">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                    <Progress
                      value={percentage}
                      class="h-3"
                      style={{
                        "background-color": COLORS[box as BoxTypes] + "40",
                        "--progress-background": COLORS[box as BoxTypes],
                      }}
                    />
                  </div>
                )}
              </For>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GazeAnalysis;
