import { For, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import type { AoiKey } from "../types";
import { ALL_AOI_KEYS, AOI_KEY_LABEL } from "../constants";
import { labelForKey } from "../utils";
import { ChevronDown } from "lucide-solid";

type Props = {
  blueKeys: AoiKey[]; setBlueKeys: (ks: AoiKey[]) => void;
  redKeys: AoiKey[]; setRedKeys: (ks: AoiKey[]) => void;
  redCustom: boolean; setRedCustom: (v: boolean) => void;
  invalidCats: ("other" | "missing" | "out_of_screen")[]; setInvalidCats: (v: ("other" | "missing" | "out_of_screen")[]) => void;
};

export default function AoISelects(p: Props) {
  const renderBlueSummary = () => (
    <div class="flex flex-wrap gap-1">
      <For each={p.blueKeys}>{(k) => <Badge variant="secondary">{labelForKey(k, AOI_KEY_LABEL)}</Badge>}</For>
    </div>
  );
  const renderRedSummary = () => (
    <div class="flex flex-wrap gap-1">
      <Badge variant={p.redCustom ? "default" : "secondary"}>{p.redCustom ? "custom compare set" : "auto: remaining"}</Badge>
      <Show when={p.redCustom}>
        <For each={p.redKeys}>{(k) => <Badge variant="outline">{labelForKey(k, AOI_KEY_LABEL)}</Badge>}</For>
      </Show>
    </div>
  );

  return (
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* BLUE */}
      <DropdownMenu placement="bottom-start">
        <DropdownMenuTrigger as={Button<"button">} variant="outline" class="justify-between">
          <div class="flex items-center gap-2">
            <span class="inline-block w-2 h-2 rounded-full bg-blue-600" />
            Blue set (AOIs)
          </div>
          <ChevronDown class="w-4 h-4 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent class="w-[420px] max-h-80 overflow-y-auto">
          <DropdownMenuLabel>Count as “blue”</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <For each={ALL_AOI_KEYS}>
            {(k) => (
              <DropdownMenuCheckboxItem
                checked={p.blueKeys.includes(k)}
                onChange={(v) => {
                  const next = new Set(p.blueKeys);
                  if (v) next.add(k);
                  else next.delete(k);
                  const arr = Array.from(next);
                  if (!arr.length) return; // require ≥1
                  p.setBlueKeys(arr);
                }}
              >
                {labelForKey(k, AOI_KEY_LABEL)}
              </DropdownMenuCheckboxItem>
            )}
          </For>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* RED */}
      <DropdownMenu placement="bottom-start">
        <DropdownMenuTrigger as={Button<"button">} variant="outline" class="justify-between">
          <div class="flex items-center gap-2">
            <span class="inline-block w-2 h-2 rounded-full bg-rose-500" />
            Compare against
          </div>
          <ChevronDown class="w-4 h-4 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent class="w-[440px] max-h-80 overflow-y-auto">
          <DropdownMenuLabel>Red set options</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { p.setRedCustom(false); }}>
            Auto (remaining)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => p.setRedCustom(true)}>
            Custom selection…
          </DropdownMenuItem>

          <Show when={p.redCustom}>
            <>
              <DropdownMenuSeparator />
              <For each={ALL_AOI_KEYS}>
                {(k) => (
                  <DropdownMenuCheckboxItem
                    disabled={p.blueKeys.includes(k)}
                    checked={p.redKeys.includes(k)}
                    onChange={(v) => {
                      const set = new Set(p.redKeys);
                      if (v) set.add(k); else set.delete(k);
                      const arr = Array.from(set).filter((x) => !p.blueKeys.includes(x));
                      p.setRedKeys(arr.length ? arr : ALL_AOI_KEYS.filter((x) => !p.blueKeys.includes(x)));
                    }}
                  >
                    {labelForKey(k, AOI_KEY_LABEL)} {p.blueKeys.includes(k) ? "(in blue)" : ""}
                  </DropdownMenuCheckboxItem>
                )}
              </For>
            </>
          </Show>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* INVALID */}
      <DropdownMenu placement="bottom-start">
        <DropdownMenuTrigger as={Button<"button">} variant="outline" class="justify-between">
          <div class="flex items-center gap-2">
            <span class="inline-block w-2 h-2 rounded-full bg-amber-500" />
            Invalid AOI categories
          </div>
          <ChevronDown class="w-4 h-4 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent class="min-w-[260px]">
          <DropdownMenuLabel>Exclude from Valid% and denominators</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(["missing", "out_of_screen", "other"] as const).map((k) => (
            <DropdownMenuCheckboxItem
              checked={p.invalidCats.includes(k)}
              onChange={(v) => {
                const s = new Set(p.invalidCats as string[]);
                if (v) s.add(k); else s.delete(k);
                const arr = Array.from(s) as any[];
                p.setInvalidCats(arr.length ? (arr as any) : ["missing"]);
              }}
            >
              {k}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* summaries */}
      <div class="md:col-span-3 flex flex-wrap gap-4 pt-1">
        {renderBlueSummary()}
        {renderRedSummary()}
      </div>
    </div>
  );
}
