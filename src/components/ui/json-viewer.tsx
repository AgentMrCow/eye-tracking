import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { explainJsonAi, hasXaiKey } from "@/shared/ai";
import Markdown from "@/components/ui/markdown";

type Props = {
  title?: string;
  data: unknown;
  collapsed?: boolean;
  aiEnabled?: boolean;
  getExplanation?: (data: unknown) => string;
};

export default function JsonViewer(props: Props) {
  const [openAI, setOpenAI] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const [aiText, setAiText] = createSignal<string | null>(null);
  const [aiBusy, setAiBusy] = createSignal(false);
  const [aiAvail, setAiAvail] = createSignal(false);
  const json = createMemo(() => {
    try { return JSON.stringify(props.data, null, 2); } catch { return String(props.data ?? ""); }
  });
  const localText = createMemo(() => {
    if (!props.getExplanation) return null;
    try { return props.getExplanation(props.data); } catch { return null; }
  });

  createEffect(async () => { setAiAvail(await hasXaiKey()); });

  async function copy() {
    try {
      await navigator.clipboard.writeText(json());
      setCopied(true); setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <Card>
      <CardHeader class="flex items-center justify-between flex-row gap-2">
        <CardTitle class="text-base">{props.title ?? "JSON"}</CardTitle>
        <div class="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={copy}>{copied() ? "Copied" : "Copy JSON"}</Button>
          <Show when={props.aiEnabled !== false}>
            <Button size="sm" variant="outline" onClick={async () => {
              const next = !openAI(); setOpenAI(next);
              if (next && !aiText() && aiAvail()) {
                setAiBusy(true);
                const txt = await explainJsonAi(props.data, props.title).catch((e) => `xAI error: ${String(e)}`);
                setAiText(txt);
                setAiBusy(false);
              }
            }}>{openAI() ? "Hide" : aiBusy() ? "Loading…" : "Explain"}</Button>
          </Show>
        </div>
      </CardHeader>
      <CardContent class="space-y-3">
        <pre class="text-xs bg-muted rounded p-3 overflow-auto max-h-[320px] whitespace-pre-wrap break-words">
{json()}
        </pre>
        <Show when={openAI()}>
          <div class="rounded border p-3 bg-background space-y-4">
            <div>
              <div class="text-xs uppercase tracking-wide text-muted-foreground mb-1">Local Explanation</div>
              <Markdown content={(localText() ?? "No local explanation available.") as string} />
            </div>
            <div>
              <div class="text-xs uppercase tracking-wide text-muted-foreground mb-2">AI Explanation</div>
              <div class="flex items-center gap-2 mb-2">
                <Button size="sm" variant="outline" disabled={!aiAvail() || aiBusy()} onClick={async () => {
                  setAiBusy(true);
                  const txt = await explainJsonAi(props.data, props.title).catch((e) => `xAI error: ${String(e)}`);
                  setAiText(txt);
                  setAiBusy(false);
                }}>{aiBusy() ? "Generating…" : aiText() ? "Regenerate" : "Ask AI"}</Button>
                <Show when={!aiAvail()}>
                  <span class="text-xs text-muted-foreground">No API key. Set VITE_XAI_API_KEY or use Settings → xAI Grok API.</span>
                </Show>
              </div>
              <Markdown content={(aiText() ?? "") as string} />
            </div>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
}
