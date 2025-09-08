import { createSignal, onCleanup } from "solid-js";

export function usePlayback() {
  const [duration, setDuration] = createSignal(0);
  const [playSec, setPlaySec] = createSignal(0);
  const [isPlaying, setIsPlaying] = createSignal(false);

  let raf = 0;
  let playStart = 0;

  function play() {
    if (duration() <= 0) return;
    playStart = performance.now() - playSec() * 1000;
    setIsPlaying(true);
    loop();
  }
  function pause() { setIsPlaying(false); cancelAnimationFrame(raf); }
  function stop()  { setIsPlaying(false); cancelAnimationFrame(raf); setPlaySec(0); }

  function loop() {
    if (!isPlaying()) return;
    const t = (performance.now() - playStart) / 1000;
    if (t >= duration()) { setPlaySec(duration()); pause(); return; }
    setPlaySec(t);
    raf = requestAnimationFrame(loop);
  }

  onCleanup(() => cancelAnimationFrame(raf));

  function scrub(next: number) {
    setPlaySec(next);
    if (isPlaying()) playStart = performance.now() - next * 1000;
  }

  return { duration, setDuration, playSec, setPlaySec, isPlaying, play, pause, stop, scrub };
}
