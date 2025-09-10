import { For, createMemo } from "solid-js";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

type Props = {
  groups: string[]; truths: string[]; poss: string[]; morphs: string[]; series: string[]; cases: string[];
  groupF: string; setGroupF: (v: string) => void;
  truthF: string; setTruthF: (v: string) => void;
  posF:   string; setPosF:   (v: string) => void;
  morphF: string; setMorphF: (v: string) => void;
  seriesF:string; setSeriesF:(v: string) => void;
  caseF:  string; setCaseF:  (v: string) => void;
};

export default function FiltersBar(p: Props) {
  const items = createMemo(() => [
    { value: () => p.groupF, set: p.setGroupF, opts: p.groups, label: "all groups" },
    { value: () => p.truthF, set: p.setTruthF, opts: p.truths, label: "all truth values" },
    { value: () => p.posF,   set: p.setPosF,   opts: p.poss,   label: "all positions" },
    { value: () => p.morphF, set: p.setMorphF, opts: p.morphs, label: "all morphemes" },
    { value: () => p.seriesF,set: p.setSeriesF,opts: p.series, label: "all series" },
    { value: () => p.caseF,  set: p.setCaseF,  opts: p.cases,  label: "all cases" },
  ]);
  return (
    <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <For each={items()}>
        {(it) => (
          <Select
            value={it.value()}
            onChange={(v) => it.set(v ?? "all")}
            options={["all", ...it.opts]}
            itemComponent={(props) => <SelectItem item={props.item}>{props.item.rawValue as string}</SelectItem>}
          >
            <SelectTrigger>
              <SelectValue>{it.value() === "all" ? it.label : it.value()}</SelectValue>
            </SelectTrigger>
            <SelectContent />
          </Select>
        )}
      </For>
    </div>
  );
}
