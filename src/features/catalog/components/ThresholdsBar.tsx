import { Button } from "@/components/ui/button";
import { Slider, SliderTrack, SliderFill, SliderThumb } from "@/components/ui/slider";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { AggMode } from "../types";
import { RefreshCcw } from "lucide-solid";

type Props = {
  minValidPct: number; setMinValidPct: (n: number) => void;
  thresholdPct: number; setThresholdPct: (n: number) => void;
  aggMode: AggMode; setAggMode: (m: AggMode) => void;
  busy: boolean; onCompute: () => void;
  counts: { tests: number; participants: number };
};

export default function ThresholdsBar(p: Props) {
  return (
    <>
      <div class="flex flex-wrap items-center gap-4 pt-1">
        <div class="flex items-center gap-3 min-w-[260px]">
          <div class="text-sm whitespace-nowrap">Min recording valid %:</div>
          <div class="flex-1">
            <Slider value={[p.minValidPct]} minValue={0} maxValue={100} step={1}
                    onChange={(v) => p.setMinValidPct(v[0] ?? 0)}>
              <SliderTrack><SliderFill /></SliderTrack>
              <SliderThumb />
            </Slider>
          </div>
          <div class="w-10 text-right tabular-nums text-xs">{p.minValidPct.toFixed(0)}%</div>
        </div>

        <div class="flex items-center gap-3 min-w-[260px]">
          <div class="text-sm whitespace-nowrap">Correct threshold %:</div>
          <div class="flex-1">
            <Slider value={[p.thresholdPct]} minValue={0} maxValue={100} step={1}
                    onChange={(v) => p.setThresholdPct(v[0] ?? 0)}>
              <SliderTrack><SliderFill /></SliderTrack>
              <SliderThumb />
            </Slider>
          </div>
          <div class="w-10 text-right tabular-nums text-xs">{p.thresholdPct.toFixed(0)}%</div>
        </div>

        <div class="flex items-center gap-3 min-w-[260px]">
          <div class="text-sm whitespace-nowrap">Aggregate mode:</div>
          <Select
            value={p.aggMode}
            onChange={(v) => p.setAggMode((v as any) ?? "discrete")}
            options={["discrete", "continuous"]}
            itemComponent={(props) => <SelectItem item={props.item}>{props.item.rawValue as string}</SelectItem>}
          >
            <SelectTrigger><SelectValue>{p.aggMode}</SelectValue></SelectTrigger>
            <SelectContent />
          </Select>
        </div>

        <Button onClick={p.onCompute} disabled={p.busy} class="ml-auto">
          <RefreshCcw class="mr-2 h-4 w-4" /> {p.busy ? "Computing…" : "Compute"}
        </Button>
      </div>

      <div class="text-xs text-muted-foreground">{p.counts.tests} tests selected • {p.counts.participants} participants</div>
    </>
  );
}
