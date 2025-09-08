import { For } from "solid-js";
import type { WordWindow } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WindowsTable(p: { wordWin: WordWindow[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Chinese Word Windows</CardTitle></CardHeader>
      <CardContent class="max-h-[500px] overflow-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="sticky top-0 bg-background">
              <th class="py-1 px-2 text-left">Word</th>
              <th class="py-1 px-2 text-right">Start&nbsp;(s)</th>
              <th class="py-1 px-2 text-right">End&nbsp;(s)</th>
            </tr>
          </thead>
        <tbody>
          <For each={p.wordWin}>{w =>
            <tr>
              <td class="py-1 px-2">{w.chinese_word}</td>
              <td class="py-1 px-2 text-right">{w.start_sec.toFixed(2)}</td>
              <td class="py-1 px-2 text-right">{w.end_sec.toFixed(2)}</td>
            </tr>
          }</For>
        </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
