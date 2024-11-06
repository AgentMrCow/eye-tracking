// src/TestComponent.tsx

import { createSignal, onMount } from "solid-js";
import Database from "@tauri-apps/plugin-sql";
import { appDataDir } from '@tauri-apps/api/path';

export interface Test {
  test_name: string;
}

function TestComponent() {
  const [tests, setTests] = createSignal<Test[]>([]);

  const loadTests = async () => {
    try {
      const path = await appDataDir();
      console.log('App directory:', path);
      const dbPath = `${path}/eye_tracking.db`;
      console.log('Loading database from path:', dbPath);
      const db = await Database.load(`sqlite:${dbPath}`);
      console.log('Database loaded:', db);

      const result = await db.select<Test[]>('SELECT DISTINCT test_name FROM gaze_data');
      console.log('Fetched tests:', result);

      setTests(result);
      console.log('Tests set:', tests());
    } catch (error) {
      console.error('Error loading tests:', error);
    }
  };

  onMount(() => {
    loadTests();
  });

  return (
    <div>
      <h1>Tests</h1>
      <pre>{JSON.stringify(tests(), null, 2)}</pre>
    </div>
  );
}

export default TestComponent;
