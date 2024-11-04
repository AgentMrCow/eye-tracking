// src/api.ts

import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';

// Command to get the absolute database path from Rust
export const getDatabasePath = async (): Promise<string> => {
  try {
    const dbPath = await invoke<string>('get_db_path');
    return dbPath;
  } catch (error) {
    console.error('Failed to get database path:', error);
    throw error;
  }
};

// Initialize the database with the correct path
export const loadDatabase = async (): Promise<Database> => {
  const absoluteDbPath = await getDatabasePath();
  const DB_PATH = `sqlite:${absoluteDbPath}`;

  try {
    const db = await Database.load(DB_PATH);
    console.log('Database loaded successfully');
    return db;
  } catch (error) {
    console.error('Failed to load database:', error);
    throw error;
  }
};

// Define TypeScript interfaces matching your data with camelCase properties
export interface GazeData {
  gazePointX: number;
  gazePointY: number;
  participantName: string;
  count: number;
}

export interface AggregatedData {
  label: string;
  data: number[];
}

// Define specific types for query results
interface AverageGazePointRow {
  gazePointX: number;
  gazePointY: number;
  participantName: string;
  count: number;
}

interface GazeHeatmapRow {
  gazePointX: number;
  gazePointY: number;
  count: number;
}

/**
 * Fetch average gaze points per participant.
 */
export const fetchAverageGazePoints = async (): Promise<GazeData[]> => {
  const db = await loadDatabase();
  const query = `
    SELECT AVG(gaze_point_x) AS gazePointX,
           AVG(gaze_point_y) AS gazePointY,
           participant_name AS participantName,
           COUNT(*) AS count
    FROM gaze_data
    GROUP BY participant_name
    LIMIT 100;
  `;
  
  try {
    const result = await db.select<Array<AverageGazePointRow>>(query);
    const gazeData: GazeData[] = result.map(row => ({
      gazePointX: row.gazePointX,
      gazePointY: row.gazePointY,
      participantName: row.participantName,
      count: row.count,
    }));
    return gazeData;
  } catch (error) {
    console.error('Failed to fetch average gaze points:', error);
    throw error;
  }
};

/**
 * Fetch gaze points over time (e.g., per minute).
 */
export const fetchGazeOverTime = async (): Promise<AggregatedData> => {
  const db = await loadDatabase();
  const query = `
    SELECT 
      strftime('%Y-%m-%d %H:%M', exact_time) AS timeMin,
      COUNT(*) AS count
    FROM gaze_data
    GROUP BY timeMin
    ORDER BY timeMin
    LIMIT 1000;
  `;
  
  try {
    const result = await db.select<Array<Record<string, any>>>(query);
    const labels: string[] = [];
    const data: number[] = [];
    
    result.forEach((row: Record<string, any>) => {
      labels.push(row['timeMin'] as string);
      data.push(row['count'] as number);
    });
    
    return {
      label: 'Gaze Points Over Time',
      data,
    };
  } catch (error) {
    console.error('Failed to fetch gaze over time:', error);
    throw error;
  }
};

/**
 * Fetch gaze heatmap data.
 */
export const fetchGazeHeatmap = async (): Promise<GazeData[]> => {
  const db = await loadDatabase();
  const query = `
    SELECT gaze_point_x AS gazePointX, 
           gaze_point_y AS gazePointY, 
           COUNT(*) AS count
    FROM gaze_data
    GROUP BY gaze_point_x, gaze_point_y
    ORDER BY count DESC
    LIMIT 10000;
  `;
  
  try {
    const result = await db.select<Array<GazeHeatmapRow>>(query);
    const heatmapData: GazeData[] = result.map(row => ({
      gazePointX: row.gazePointX,
      gazePointY: row.gazePointY,
      participantName: '', // Not needed for heatmap
      count: row.count,
    }));
    return heatmapData;
  } catch (error) {
    console.error('Failed to fetch gaze heatmap:', error);
    throw error;
  }
};

/**
 * Fetch and print the first 5 rows from the database.
 */
export const fetchFirstFiveRows = async (): Promise<GazeData[]> => {
  try {
    console.log('Attempting to load database'); // Debug statement
    const db = await loadDatabase();
    console.log('Database loaded successfully'); // Debug statement

    const query = `
      SELECT gaze_point_x AS gazePointX,
             gaze_point_y AS gazePointY,
             participant_name AS participantName,
             exact_time AS exactTime
      FROM gaze_data
      LIMIT 5;
    `;
    
    console.log('Executing query'); // Debug statement
    const result = await db.select<Array<GazeData>>(query);
    console.log('Query executed successfully'); // Debug statement

    console.log('First 5 rows:', result);
    return result;
  } catch (error) {
    console.error('Failed to fetch first 5 rows:', error);
    throw error;
  }
};

// Command to invoke the Rust backend to print first five rows
export const invokePrintFirstFiveRows = async (): Promise<void> => {
  try {
    console.log('Invoking print_first_five_rows command');
    await invoke('print_first_five_rows');
    console.log('print_first_five_rows command executed successfully');
  } catch (error) {
    console.error('Failed to invoke print_first_five_rows:', error);
  }
};