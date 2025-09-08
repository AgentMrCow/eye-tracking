import { Show } from "solid-js";
import { Button } from "@/components/ui/button";

type Props = {
  imgUrl: string | null;
  onReadyImage: (img: HTMLImageElement, canvas: HTMLCanvasElement) => void;
  isPlaying: boolean; play: () => void; pause: () => void; stop: () => void;
  duration: number; curTime: number; scrub: (n: number) => void; ready: boolean;
  currentWord: string | null; winPctValid: number;
};

export default function StimulusReplay(p: Props) {
  return (
    <div class="flex flex-col items-center gap-3">
      <Show when={p.imgUrl} fallback={<span class="text-sm text-muted-foreground">(no image for this test)</span>}>
        <div class="relative">
          <img
            src={p.imgUrl!}
            alt="stimulus"
            ref={(img) => {
              // ensure a canvas sibling exists and pass both back
              const parent = img.parentElement!;
              let cvs = parent.querySelector("canvas") as HTMLCanvasElement | null;
              if (!cvs) {
                cvs = document.createElement("canvas");
                cvs.className = "absolute inset-0 pointer-events-none";
                parent.appendChild(cvs);
              }
              // size canvas after image renders
              queueMicrotask(() => {
                cvs!.width = img.clientWidth; cvs!.height = img.clientHeight;
                p.onReadyImage(img, cvs!);
              });
            }}
            class="max-h-[400px] max-w-full object-contain rounded-md border"
          />
          <canvas class="absolute inset-0 pointer-events-none" />
        </div>

        {/* controls */}
        <div class="flex items-center gap-3 mt-3">
          <Button size="icon" onClick={p.isPlaying ? p.pause : p.play} disabled={!p.ready}>
            {p.isPlaying ? "❚❚" : "►"}
          </Button>
          <Button size="icon" variant="secondary" onClick={p.stop} disabled={!p.ready}>■</Button>

          <input type="range" min="0" max={p.duration} value={p.curTime} step="0.01"
                 class="w-40 accent-primary-500"
                 onInput={(e) => p.scrub(+e.currentTarget.value)} />
          <span class="text-xs tabular-nums">
            {p.curTime.toFixed(2)} / {p.duration.toFixed(2)} s
          </span>
        </div>

        {/* legend */}
        <div class="flex items-center gap-2 w-full justify-center mt-1">
          <span class="text-[10px] text-muted-foreground">old</span>
          <div class="h-2 w-32 rounded-full" style="background: linear-gradient(to right, hsl(220 100% 50%), hsl(0 100% 50%))" />
          <span class="text-[10px] text-muted-foreground">new</span>
        </div>

        {/* word + window-valid */}
        <div class="text-xs text-center mt-1">
          {p.currentWord ? <>Current word: <strong>{p.currentWord}</strong> · window valid <strong>{p.winPctValid.toFixed(1)}%</strong></>
                        : <span class="text-muted-foreground">(no word window)</span>}
        </div>
      </Show>
    </div>
  );
}
