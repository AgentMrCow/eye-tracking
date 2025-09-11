import type { BoxTypes, GazeData } from "@/features/gaze/types";

export type BinSummary = { bluePct: number; redPct: number; validPct: number; blueN: number; redN: number; validN: number };

export function buildBins(
  gaze: GazeData[],
  anchorAbsMs: number,
  binMs: number,
  numBins: number,
  invalid: Set<string>,
  blue: Set<BoxTypes>,
  red: Set<BoxTypes>,
): BinSummary[] {
  const bins: { total: number; invalid: number; blue: number; red: number }[] = Array.from({ length: numBins }, () => ({ total: 0, invalid: 0, blue: 0, red: 0 }));
  for (const g of gaze) {
    const ts = +new Date(g.timestamp);
    const rel = ts - anchorAbsMs;
    if (rel < 0) continue;
    const idx = Math.floor(rel / Math.max(1, binMs));
    if (idx < 0 || idx >= numBins) continue;
    bins[idx].total += 1;
    const box = g.box_name as BoxTypes;
    if (invalid.has(g.box_name)) bins[idx].invalid += 1;
    else if (blue.has(box)) bins[idx].blue += 1;
    else if (red.has(box)) bins[idx].red += 1;
  }
  return bins.map(b => {
    const valid = Math.max(0, b.total - b.invalid);
    const denom = Math.max(0, b.blue + b.red);
    return {
      bluePct: denom ? (b.blue / denom) * 100 : 0,
      redPct: denom ? (b.red / denom) * 100 : 0,
      validPct: b.total ? ((b.total - b.invalid) / b.total) * 100 : 0,
      blueN: b.blue,
      redN: b.red,
      validN: valid,
    };
  });
}

export type GroupCurve = {
  xSec: number[];
  mean: number[]; // mean(bluePct - redPct)
  ciLow: number[];
  ciHigh: number[];
  perParticipant: number[][]; // per-participant effect per bin
};

export function bootstrapCI(perParticipant: number[][], xSec: number[], nBoot = 500, alpha = 0.05): GroupCurve {
  const n = perParticipant.length;
  const T = xSec.length;
  const mean = Array.from({ length: T }, (_, t) => perParticipant.reduce((a, arr) => a + (arr[t] ?? 0), 0) / Math.max(1, n));
  const ciLow = new Array<number>(T).fill(0);
  const ciHigh = new Array<number>(T).fill(0);
  if (n <= 1) return { xSec, mean, ciLow: [...mean], ciHigh: [...mean], perParticipant };

  const samples = new Array<number>(n);
  for (let t = 0; t < T; t++) {
    const vals = perParticipant.map(arr => arr[t] ?? 0);
    const boots: number[] = [];
    for (let b = 0; b < nBoot; b++) {
      for (let i = 0; i < n; i++) samples[i] = vals[Math.floor(Math.random() * n)];
      const m = samples.reduce((a, v) => a + v, 0) / n;
      boots.push(m);
    }
    boots.sort((a, b) => a - b);
    const loIdx = Math.floor((alpha / 2) * nBoot);
    const hiIdx = Math.floor((1 - alpha / 2) * nBoot);
    ciLow[t] = boots[Math.max(0, Math.min(nBoot - 1, loIdx))];
    ciHigh[t] = boots[Math.max(0, Math.min(nBoot - 1, hiIdx))];
  }
  return { xSec, mean, ciLow, ciHigh, perParticipant };
}

export type ClusterSig = { mask: boolean[]; clusters: { start: number; end: number; mass: number; p: number }[] };

export function clusterPermutation(perParticipant: number[][], threshold = 2.0, nPerm = 200): ClusterSig {
  // Compute t-stat per time from participant arrays
  const n = perParticipant.length;
  const T = (perParticipant[0]?.length ?? 0);
  const mean = new Array<number>(T).fill(0);
  const sd = new Array<number>(T).fill(0);
  for (let t = 0; t < T; t++) {
    const vals = perParticipant.map(v => v[t] ?? 0);
    const m = vals.reduce((a, v) => a + v, 0) / Math.max(1, n);
    const s2 = vals.reduce((a, v) => a + Math.pow(v - m, 2), 0) / Math.max(1, n - 1);
    mean[t] = m; sd[t] = Math.sqrt(Math.max(0, s2));
  }
  const tstat = mean.map((m, t) => (sd[t] > 0 ? (m / (sd[t] / Math.sqrt(Math.max(1, n)))) : 0));

  function clustersFromT(ts: number[]): { start: number; end: number; mass: number }[] {
    const out: { start: number; end: number; mass: number }[] = [];
    let i = 0;
    while (i < ts.length) {
      if (Math.abs(ts[i]) >= threshold) {
        let j = i; let mass = 0;
        while (j < ts.length && Math.abs(ts[j]) >= threshold) { mass += Math.abs(ts[j]); j++; }
        out.push({ start: i, end: j - 1, mass });
        i = j;
      } else i++;
    }
    return out;
  }
  const obs = clustersFromT(tstat);
  const obsMax = obs.length ? Math.max(...obs.map(c => c.mass)) : 0;

  // sign-flip permutations
  let count = 0;
  for (let p = 0; p < nPerm; p++) {
    const flipped: number[][] = perParticipant.map(arr => {
      const s = Math.random() < 0.5 ? 1 : -1; return arr.map(v => v * s);
    });
    const fm = new Array<number>(T).fill(0);
    const fsd = new Array<number>(T).fill(0);
    for (let t = 0; t < T; t++) {
      const vals = flipped.map(v => v[t] ?? 0);
      const m = vals.reduce((a, v) => a + v, 0) / Math.max(1, n);
      const s2 = vals.reduce((a, v) => a + Math.pow(v - m, 2), 0) / Math.max(1, n - 1);
      fm[t] = m; fsd[t] = Math.sqrt(Math.max(0, s2));
    }
    const ft = fm.map((m, t) => (fsd[t] > 0 ? (m / (fsd[t] / Math.sqrt(Math.max(1, n)))) : 0));
    const permClusters = clustersFromT(ft);
    const permMax = permClusters.length ? Math.max(...permClusters.map(c => c.mass)) : 0;
    if (permMax >= obsMax) count++;
  }
  const pval = nPerm > 0 ? (count + 1) / (nPerm + 1) : 1;
  const mask = new Array<boolean>(T).fill(false);
  obs.forEach(c => { if (pval < 0.05) { for (let i = c.start; i <= c.end; i++) mask[i] = true; } });
  const clusters = obs.map(c => ({ ...c, p: pval }));
  return { mask, clusters };
}

