import { createEffect } from "solid-js";
import { timeColor } from "../../catalog/utils";

export default function StimulusOverlay(props: {
  imgUrl: string | null;
  playSec: number;
  duration: number;
  points: { t: number; x: number; y: number }[];
}) {
  let imgEl: HTMLImageElement | null = null;
  let cvsEl: HTMLCanvasElement | null = null;

  function drawFrame(sec: number) {
    if (!imgEl || !cvsEl) return;
    const ctx = cvsEl.getContext("2d")!;
    cvsEl.width = imgEl.clientWidth;
    cvsEl.height = imgEl.clientHeight;
    ctx.clearRect(0, 0, cvsEl.width, cvsEl.height);

    const sx = cvsEl.width / 1920;
    const sy = cvsEl.height / 1080;

    for (const p of props.points) {
      if (p.t > sec) break;
      const frac = props.duration ? p.t / props.duration : 0;
      ctx.beginPath();
      ctx.arc(p.x * sx, p.y * sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = timeColor(frac);
      ctx.fill();
    }
  }

  createEffect(() => drawFrame(props.playSec));

  return (
    <div class="rounded border p-3">
      <div class="text-xs text-muted-foreground mb-2">{props.imgUrl ? "Playback overlay" : "No image"}</div>
      <div class="relative w-full flex justify-center">
        <img
          ref={(el) => { imgEl = el; }}
          src={props.imgUrl ?? ""}
          alt="stimulus"
          class="max-h-[240px] max-w-full object-contain rounded-md border"
          onLoad={() => drawFrame(props.playSec)}
        />
        <canvas ref={(el) => (cvsEl = el)} class="absolute inset-0 pointer-events-none" />
      </div>
      <div class="flex items-center gap-2 justify-center mt-2">
        <span class="text-[10px] text-muted-foreground">old</span>
        <div class="h-2 w-28 rounded-full" style="background: linear-gradient(to right, hsl(220 100% 50%), hsl(0 100% 50%))" />
        <span class="text-[10px] text-muted-foreground">new</span>
      </div>
    </div>
  );
}
