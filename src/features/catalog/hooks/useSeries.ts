import { createEffect, createSignal } from "solid-js";
import type { BoxTypes, GazeData } from "../types";
import { getGazeData } from "../services/catalogApi";

type Out = { datasets: any[]; xMax: number; gaze: GazeData[]; baseMs: number };

export function useSeries(params: () => {
  testName: string | null;
  participant: string | null;
  binMs: number;
  invalidCats: ("other" | "missing" | "out_of_screen")[];
  blue: Set<BoxTypes>;
  red: Set<BoxTypes>;
  timeline?: string | null;
  recording?: string | null;
}) {
  const [series, setSeries] = createSignal<Out | null>(null);

  createEffect(async () => {
    const p = params();
    if (!p.testName || !p.participant) { setSeries(null); return; }
    // if many sessions require explicit selection
    if (p.timeline === undefined && p.recording === undefined) {
      // allow single-session fetch (backend can still return single combined)
    }
    const invalidSet = new Set<BoxTypes>(p.invalidCats as BoxTypes[]);
    const gaze = await getGazeData({
      testName: p.testName,
      participants: [p.participant],
      timeline: p.timeline ?? null,
      recording: p.recording ?? null,
    });

    if (!gaze.length) { setSeries({ datasets: [], xMax: 0, gaze: [], baseMs: 0 }); return; }

    const baseMs = +new Date(gaze[0].timestamp);
    const ms = Math.max(1, p.binMs);

    type Acc = { blue: number; red: number; tot: number; invalid: number };
    const bins = new Map<number, Acc>();
    let lastSec = 0;

    for (const g of gaze) {
      const b = g.box_name as BoxTypes;
      const t = +new Date(g.timestamp) - baseMs;
      const key = Math.floor(t / ms) * ms;

      const rec = bins.get(key) ?? { blue: 0, red: 0, tot: 0, invalid: 0 };
      rec.tot += 1;
      if (invalidSet.has(b)) rec.invalid += 1;

      if (p.blue.has(b)) rec.blue += 1;
      else if (p.red.has(b)) rec.red += 1;

      bins.set(key, rec);
      lastSec = Math.max(lastSec, t / 1000);
    }

    const pointsBlue: { x: number; y: number }[] = [];
    const pointsRed:  { x: number; y: number }[] = [];
    const pointsValid:{ x: number; y: number }[] = [];

    const sortedKeys = Array.from(bins.keys()).sort((a, b) => a - b);
    for (const k of sortedKeys) {
      const { blue, red, tot, invalid } = bins.get(k)!;
      const denom = blue + red;
      const x = k / 1000;
      const yB = denom ? (blue / denom) * 100 : 0;
      const yR = denom ? (red  / denom) * 100 : 0;
      const yV = tot ? ((tot - invalid) / tot) * 100 : 0;
      pointsBlue.push({ x, y: yB });
      pointsRed.push ({ x, y: yR });
      pointsValid.push({ x, y: yV });
    }

    const datasets = [
      { label: "% Blue",  data: pointsBlue,  borderColor: "#2563eb", backgroundColor: "transparent", borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
      { label: "% Red",   data: pointsRed,   borderColor: "#e11d48", backgroundColor: "transparent", borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
      { label: "% Valid", data: pointsValid, borderColor: "#64748b", backgroundColor: "transparent", borderDash: [4,4], borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
    ];

    setSeries({ datasets, xMax: lastSec, gaze, baseMs });
  });

  return series;
}
