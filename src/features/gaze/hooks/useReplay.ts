import { createMemo, createSignal, onCleanup } from "solid-js";
import { timeColor } from "../utils";
import type { GazeData, WordWindow } from "../types";

export function useReplay(params: () => {
  gaze: GazeData[];
  baseMs: number;
  wordWin: WordWindow[];
  imgEl: HTMLImageElement | null;
  canvasEl: HTMLCanvasElement | null;
}) {
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [curTime, setCurTime] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [ready, setReady] = createSignal(false);
  const [winPctValid, setWinPctValid] = createSignal(0);
  let raf = 0; let playStart = 0;

  const replayPoints = createMemo(() => {
    const g = params().gaze;
    const base = params().baseMs;
    const pts = g
      .filter(d => d.gaze_x !== null && d.gaze_y !== null && d.box_name !== "missing" && d.box_name !== "out_of_screen")
      .map(d => ({ t: (+new Date(d.timestamp) - base) / 1000, x: d.gaze_x!, y: d.gaze_y! }));
    if (pts.length) { setDuration(pts[pts.length - 1].t); setCurTime(0); setReady(true); }
    else { setReady(false); }
    return pts;
  });

  function drawFrame(sec: number) {
    // window validity
    const ww = params().wordWin;
    const cur = ww.find(w => sec >= w.start_sec && sec <= w.end_sec);
    if (cur) {
      const g = params().gaze;
      const base = params().baseMs;
      const ptsInWin = g.filter(p => {
        const t = (+new Date(p.timestamp) - base) / 1000;
        return t >= cur.start_sec && t <= cur.end_sec;
      });
      const valid = ptsInWin.filter(p => p.box_name !== "missing").length;
      setWinPctValid(ptsInWin.length ? (valid / ptsInWin.length) * 100 : 0);
    } else setWinPctValid(0);

    // overlay
    const img = params().imgEl, cvs = params().canvasEl;
    if (!img || !cvs) return;
    const ctx = cvs.getContext("2d")!;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    const scaleX = cvs.width / 1920;
    const scaleY = cvs.height / 1080;

    for (const p of replayPoints()) {
      if (p.t > sec) break;
      const frac = duration() ? p.t / duration() : 0;
      ctx.beginPath();
      ctx.arc(p.x * scaleX, p.y * scaleY, 4, 0, Math.PI * 2);
      ctx.fillStyle = timeColor(frac);
      ctx.fill();
    }
  }

  function play() {
    if (!ready()) return;
    playStart = performance.now() - curTime() * 1000;
    setIsPlaying(true);
    loop();
  }
  function pause() { setIsPlaying(false); cancelAnimationFrame(raf); }
  function stop()  { pause(); setCurTime(0); drawFrame(0); }
  function loop()  {
    if (!isPlaying()) return;
    const t = (performance.now() - playStart) / 1000;
    if (t >= duration()) { stop(); return; }
    setCurTime(t); drawFrame(t); raf = requestAnimationFrame(loop);
  }
  function scrub(v: number) {
    setCurTime(v);
    if (!isPlaying()) drawFrame(v);
    else playStart = performance.now() - v * 1000;
  }

  onCleanup(() => cancelAnimationFrame(raf));

  return { isPlaying, play, pause, stop, scrub, duration, curTime, ready, winPctValid, drawFrame };
}
