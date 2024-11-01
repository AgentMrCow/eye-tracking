// src/api.ts

import { invoke } from '@tauri-apps/api/core';

export interface GazeData {
  gaze_point_x: number;
  gaze_point_y: number;
  count: number;
}

export interface AggregatedData {
  label: string;
  data: number[];
}

// Fetch average gaze points
export const fetchAverageGazePoints = async (): Promise<GazeData[]> => {
  return await invoke<GazeData[]>('get_average_gaze_points');
};

// Fetch gaze over time
export const fetchGazeOverTime = async (): Promise<AggregatedData> => {
  return await invoke<AggregatedData>('get_gaze_over_time');
};

// Fetch gaze heatmap data
export const fetchGazeHeatmap = async (): Promise<GazeData[]> => {
  return await invoke<GazeData[]>('get_gaze_heatmap');
};
