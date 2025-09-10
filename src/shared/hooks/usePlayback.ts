import { createSignal, onCleanup } from "solid-js";

export interface PlaybackOptions {
  onFrame?: (sec: number) => void;
}

export function usePlayback(opts: PlaybackOptions = {}) {
  const [duration, setDuration] = createSignal(0);
  const [playSec, setPlaySec] = createSignal(0);
  const [isPlaying, setIsPlaying] = createSignal(false);
  let raf = 0;
  let playStart = 0;

  function loop() {
    if (!isPlaying()) return;
    const t = (performance.now() - playStart) / 1000;
    if (t >= duration()) {
      setPlaySec(duration());
      opts.onFrame?.(duration());
      pause();
      return;
    }
    setPlaySec(t);
    opts.onFrame?.(t);
    raf = requestAnimationFrame(loop);
  }

  function play() {
    if (duration() <= 0) return;
    playStart = performance.now() - playSec() * 1000;
    setIsPlaying(true);
    loop();
  }
  function pause() { setIsPlaying(false); cancelAnimationFrame(raf); }
  function stop() { pause(); setPlaySec(0); opts.onFrame?.(0); }
  function scrub(next: number) {
    setPlaySec(next);
    if (isPlaying()) playStart = performance.now() - next * 1000;
    else opts.onFrame?.(next);
  }

  onCleanup(() => cancelAnimationFrame(raf));

  return { duration, setDuration, playSec, setPlaySec, isPlaying, play, pause, stop, scrub };
}

