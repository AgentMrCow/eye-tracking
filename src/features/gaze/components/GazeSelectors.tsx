import { Show } from "solid-js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function GazeSelectors(props: {
  tests: string[]; participants: string[];
  selTest: string; setSelTest: (v: string) => void;
  selPart: string; setSelPart: (v: string) => void;
  timelines: string[]; recOpts: string[];
  selTimeline: string; setSelTimeline: (v: string) => void;
  selRecording: string; setSelRecording: (v: string) => void;
  hasMultiSession: boolean;
}) {
  return (
    <div class="flex flex-wrap items-center gap-2">
      <Select
        value={props.selTest}
        onChange={(v) => { props.setSelTest(v || ""); props.setSelTimeline(""); props.setSelRecording(""); }}
        options={props.tests}
        itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}
      >
        <SelectTrigger class="w-64"><SelectValue>{props.selTest || "Select test…"}</SelectValue></SelectTrigger>
        <SelectContent />
      </Select>

      <Select
        value={props.selPart}
        onChange={(v) => { props.setSelPart(v || ""); props.setSelTimeline(""); props.setSelRecording(""); }}
        options={props.participants}
        itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}
      >
        <SelectTrigger class="w-56"><SelectValue>{props.selPart || "Select participant…"}</SelectValue></SelectTrigger>
        <SelectContent />
      </Select>

      <Show when={props.hasMultiSession}>
        <Select
          value={props.selTimeline}
          onChange={(v) => { props.setSelTimeline(v || ""); props.setSelRecording(""); }}
          options={props.timelines}
          itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}
        >
          <SelectTrigger class="w-52"><SelectValue>{props.selTimeline || "Select timeline…"}</SelectValue></SelectTrigger>
          <SelectContent />
        </Select>

        <Select
          value={props.selRecording}
          onChange={(v) => props.setSelRecording(v || "")}
          options={props.recOpts}
          itemComponent={(pp) => <SelectItem item={pp.item}>{pp.item.rawValue}</SelectItem>}
        >
          <SelectTrigger class="w-52"><SelectValue>{props.selRecording || "Select recording…"}</SelectValue></SelectTrigger>
          <SelectContent />
        </Select>
      </Show>
    </div>
  );
}
