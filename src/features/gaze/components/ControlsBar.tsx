import { Show } from "solid-js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberField, NumberFieldInput } from "@/components/ui/number-field";
import { Button } from "@/components/ui/button";

type Props = {
  truths: string[]; morphs: string[]; poss: string[]; series: string[]; groups: string[];
  truthF: string; setTruthF: (v: string) => void;
  morphF: string; setMorphemeF: (v: string) => void;
  posF: string; setPosF: (v: string) => void;
  seriesF: string; setSeriesF: (v: string) => void;
  groupF: string; setGroupF: (v: string) => void;

  tests: string[]; selectedTest: string | null; setSelectedTestValue: (v: string | null) => void;
  participants: string[]; selectedPart: string | null; setSelectedPartValue: (v: string | null) => void;

  timelineOptions: string[]; recordingOptions: string[];
  selectedTimeline: string | null; setSelectedTimeline: (v: string | null) => void;
  selectedRecording: string | null; setSelectedRecording: (v: string | null) => void;

  intervalMs: number; setIntervalMs: (n: number) => void;
  pxPerSec: number; setPxPerSec: (n: number) => void;
  spanSec: number; setSpanSec: (n: number) => void;
  viewSec: number; setViewSec: (n: number) => void;

  minValidPct: number; setMinValidPct: (n: number) => void;
  reset: () => void;
};

export default function ControlsBar(p: Props) {
  return (
    <div class="flex flex-wrap items-end gap-3">

      {/* filters */}
      <Select value={p.truthF} onChange={p.setTruthF} options={["all", ...p.truths]}
        itemComponent={(i) => <SelectItem item={i.item}>{i.item.rawValue}</SelectItem>}>
        <SelectTrigger class="w-28"><SelectValue>{p.truthF === "all" ? "all truth values" : p.truthF}</SelectValue></SelectTrigger>
        <SelectContent />
      </Select>

      <Select value={p.morphF} onChange={p.setMorphemeF} options={["all", ...p.morphs]}
        itemComponent={(i) => <SelectItem item={i.item}>{i.item.rawValue}</SelectItem>}>
        <SelectTrigger class="w-28"><SelectValue>{p.morphF === "all" ? "all morphemes" : p.morphF}</SelectValue></SelectTrigger>
        <SelectContent />
      </Select>

      <Select value={p.posF} onChange={p.setPosF} options={["all", ...p.poss]}
        itemComponent={(i) => <SelectItem item={i.item}>{i.item.rawValue}</SelectItem>}>
        <SelectTrigger class="w-28"><SelectValue>{p.posF === "all" ? "all positions" : p.posF}</SelectValue></SelectTrigger>
        <SelectContent />
      </Select>

      <Select value={p.seriesF} onChange={p.setSeriesF} options={["all", ...p.series]}
        itemComponent={(i) => <SelectItem item={i.item}>{i.item.rawValue}</SelectItem>}>
        <SelectTrigger class="w-28"><SelectValue>{p.seriesF === "all" ? "all series" : p.seriesF}</SelectValue></SelectTrigger>
        <SelectContent />
      </Select>

      <Select value={p.groupF} onChange={p.setGroupF} options={["all", ...p.groups]}
        itemComponent={(i) => <SelectItem item={i.item}>{i.item.rawValue}</SelectItem>}>
        <SelectTrigger class="w-28"><SelectValue>{p.groupF === "all" ? "all groups" : p.groupF}</SelectValue></SelectTrigger>
        <SelectContent />
      </Select>

      {/* main selects */}
      <Select
        value={p.selectedTest ?? ""}
        onChange={(v) => p.setSelectedTestValue(v || null)}
        options={p.tests}
        placeholder="Select test…"
        itemComponent={(i) => <SelectItem item={i.item}>{i.item.rawValue}</SelectItem>}
      >
        <SelectTrigger class="w-64">
          <SelectValue>{p.selectedTest ?? "Select test…"}</SelectValue>
        </SelectTrigger>
        <SelectContent />
      </Select>

      <Select
        value={p.selectedPart ?? ""}
        onChange={(v) => p.setSelectedPartValue(v || null)}
        options={p.participants}
        placeholder="Select participant…"
        itemComponent={(i) => <SelectItem item={i.item}>{i.item.rawValue}</SelectItem>}
      >
        <SelectTrigger class="w-64">
          <SelectValue>{p.selectedPart ?? "Select participant…"}</SelectValue>
        </SelectTrigger>
        <SelectContent />
      </Select>

      {/* timeline / recording */}
      <Show when={p.timelineOptions.length > 0}>
        <Select
          value={p.selectedTimeline ?? ""}
          onChange={(v) => p.setSelectedTimeline(v || null)}
          options={p.timelineOptions}
          placeholder="Select timeline…"
          itemComponent={(i) => <SelectItem item={i.item}>{i.item.rawValue}</SelectItem>}
        >
          <SelectTrigger class="w-48"><SelectValue>{p.selectedTimeline ?? "Select timeline…"}</SelectValue></SelectTrigger>
          <SelectContent />
        </Select>
      </Show>

      <Show when={p.recordingOptions.length > 0}>
        <Select
          value={p.selectedRecording ?? ""}
          onChange={(v) => p.setSelectedRecording(v || null)}
          options={p.recordingOptions}
          placeholder="Select recording…"
          itemComponent={(i) => <SelectItem item={i.item}>{i.item.rawValue}</SelectItem>}
        >
          <SelectTrigger class="w-48"><SelectValue>{p.selectedRecording ?? "Select recording…"}</SelectValue></SelectTrigger>
          <SelectContent />
        </Select>
      </Show>

      {/* numeric controls */}
      <label class="text-sm flex items-center gap-1">
        Sampling&nbsp;interval&nbsp;(ms):
        <NumberField value={p.intervalMs} class="w-20">
          <NumberFieldInput min={1} onInput={(e) => p.setIntervalMs(+e.currentTarget.value || 1)} />
        </NumberField>
      </label>

      <label class="text-sm flex items-center gap-1">
        Horizontal&nbsp;scale&nbsp;(px/s):
        <NumberField value={p.pxPerSec} class="w-20">
          <NumberFieldInput min={5} max={200} onInput={(e) => p.setPxPerSec(+e.currentTarget.value || 1)} />
        </NumberField>
      </label>

      <label class="text-sm flex items-center gap-1">
        Timeline&nbsp;span&nbsp;(s):
        <NumberField value={p.spanSec} class="w-20">
          <NumberFieldInput min={1} max={300} onInput={(e) => p.setSpanSec(+e.currentTarget.value || 1)} />
        </NumberField>
      </label>

      <label class="text-sm flex items-center gap-1">
        Current&nbsp;view&nbsp;width&nbsp;(s):
        <NumberField value={p.viewSec} class="w-20">
          <NumberFieldInput min={1} max={300} onInput={(e) => p.setViewSec(+e.currentTarget.value || 1)} />
        </NumberField>
      </label>

      {/* min valid % */}
      <label class="text-sm flex items-center gap-2">
        Min&nbsp;recording&nbsp;valid&nbsp;%:
        <input type="range" min="0" max="100" value={p.minValidPct} class="w-40 accent-primary-500"
               onInput={(e) => p.setMinValidPct(+e.currentTarget.value)} />
        <span class="w-10 text-right tabular-nums">{p.minValidPct}%</span>
      </label>

      <Button size="sm" variant="secondary" onClick={p.reset}>Reset</Button>
    </div>
  );
}
