// src/api.ts

import { invoke } from '@tauri-apps/api/core';

export async function fetchTests(): Promise<string[]> {
  const response = await invoke('get_tests');
  return response.map((test: { test_name: string }) => test.test_name);
}

export async function fetchParticipants(): Promise<string[]> {
  const response = await invoke('get_participants');
  return response.map((participant: { participant_name: string }) => participant.participant_name);
}

export interface GazeData {
  gaze_point_x: number;
  gaze_point_y: number;
  box_name: string;
  presented_media_name: string;
  timeline_name: string;
  participant_name: string;
  recording_name: string;
  exact_time: string;
  test_name: string;
}

export async function fetchGazeData(testName?: string, participantNames?: string[]): Promise<GazeData[]> {
  const response = await invoke('get_gaze_data', { test_name: testName, participant_names: participantNames });
  return response;
}

export interface AggregatedGazeData {
  exact_time: string;
  box_name: string;
  percentage: number;
}

export async function fetchAggregatedGazeData(testName?: string, participantNames?: string[]): Promise<AggregatedGazeData[]> {
  const response = await invoke('get_aggregated_gaze_data', { test_name: testName, participant_names: participantNames });
  return response;
}

export interface ComparisonData {
  participant_name: string;
  exact_time: string;
  box_name: string;
  gaze_count: number;
}

export async function compareParticipants(testName: string, participantNames: string[]): Promise<ComparisonData[]> {
  const response = await invoke('compare_participants', { test_name: testName, participant_names: participantNames });
  return response;
}
