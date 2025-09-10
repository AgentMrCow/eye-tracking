import { createMemo, createSignal } from "solid-js";
import { usePlayback } from "@/shared/hooks/usePlayback";
import { timeColor } from "../utils";
import type { GazeData, WordWindow } from "../types";

export function useReplay(params: () => {
  gaze: GazeData[];
  baseMs: number;
  wordWin: WordWindow[];
  imgEl: HTMLImageElement | null;
  canvasEl: HTMLCanvasElement | null;
}) {
  const [ready, setReady] = createSignal(false);
  const [winPctValid, setWinPctValid] = createSignal(0);

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

  const {
    isPlaying,
    play,
    pause,
    stop,
    scrub,
    duration,
    setDuration,
    playSec: curTime,
    setPlaySec: setCurTime,
  } = usePlayback({ onFrame: drawFrame });

  const replayPoints = createMemo(() => {
    const g = params().gaze;
    const base = params().baseMs;

    // Build the points (still filtering for drawing)
    const pts = g
      .filter(d => d.gaze_x !== null && d.gaze_y !== null && d.box_name !== "missing" && d.box_name !== "out_of_screen")
      .map(d => ({ t: (+new Date(d.timestamp) - base) / 1000, x: d.gaze_x!, y: d.gaze_y! }));

    // Compute duration from the *full* time range, not just the filtered list
    if (g.length) {
      const first = +new Date(g[0].timestamp);
      const last  = +new Date(g[g.length - 1].timestamp);
      setDuration(Math.max(0, (last - first) / 1000));
      setCurTime(0);
      setReady(true);
    } else {
      setReady(false);
      setDuration(0);
    }

    return pts;
  });

  function playGuarded() {
    if (!ready()) return;
    play();
  }

  return { isPlaying, play: playGuarded, pause, stop, scrub, duration, curTime, ready, winPctValid, drawFrame };
}
