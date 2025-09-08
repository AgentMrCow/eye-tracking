import { Button } from "@/components/ui/button";
import { NumberField, NumberFieldInput } from "@/components/ui/number-field";

export default function PlaybackBar(props: {
  duration: number; playSec: number; isPlaying: boolean;
  play: () => void; pause: () => void; stop: () => void; scrub: (n: number) => void;
  binMs: number; setBinMs: (n: number) => void; viewSec: number; setViewSec: (n: number) => void;
}) {
  return (
    <div class="flex flex-wrap items-end gap-4">
      <div class="flex items-center gap-2">
        <Button size="icon" onClick={props.isPlaying ? props.pause : props.play} disabled={props.duration <= 0}>
          {props.isPlaying ? "❚❚" : "►"}
        </Button>
        <Button size="icon" variant="secondary" onClick={props.stop} disabled={props.duration <= 0}>■</Button>
      </div>

      <div class="flex items-center gap-2">
        <input
          type="range"
          min="0"
          max={props.duration}
          step="0.01"
          value={props.playSec}
          class="w-64 accent-primary-500"
          onInput={(e) => props.scrub(+((e.currentTarget as HTMLInputElement).value))}
        />
        <span class="text-xs tabular-nums">{props.playSec.toFixed(2)} / {props.duration.toFixed(2)} s</span>
      </div>

      <label class="text-sm flex items-center gap-2 ml-auto">
        Bin size (ms):
        <NumberField value={props.binMs()} class="w-24">
          <NumberFieldInput min={1} max={2000} onInput={(e) => props.setBinMs(Math.max(1, +e.currentTarget.value || 1))} />
        </NumberField>
      </label>

      <label class="text-sm flex items-center gap-2">
        View width (s):
        <NumberField value={props.viewSec()} class="w-24">
          <NumberFieldInput min={1} max={600} onInput={(e) => props.setViewSec(Math.max(1, +e.currentTarget.value || 1))} />
        </NumberField>
      </label>
    </div>
  );
}
