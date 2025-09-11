import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { explainJsonAiStream, hasXaiKey } from "@/shared/ai";
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
  const [activeTab, setActiveTab] = createSignal<"local" | "ai">("local");
  const [copiedMd, setCopiedMd] = createSignal(false);
  let abortCtrl: AbortController | null = null;
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
            <Button size="sm" variant="outline" onClick={() => { setOpenAI(!openAI()); }}>{openAI() ? "Hide" : "Explain"}</Button>
          </Show>
        </div>
      </CardHeader>
      <CardContent class="space-y-3">
        <pre class="text-xs bg-muted rounded p-3 overflow-auto max-h-[320px] whitespace-pre-wrap break-words">
{json()}
        </pre>
        <Show when={openAI()}>
          <div class="rounded border bg-background">
            <div class="flex border-b">
              <button class={`px-3 py-2 text-xs ${activeTab()==='local' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`} onClick={() => setActiveTab('local')}>Local</button>
              <button class={`px-3 py-2 text-xs ${activeTab()==='ai' ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'}`} onClick={() => setActiveTab('ai')}>AI</button>
              <div class="ml-auto flex items-center gap-2 p-2">
                <Show when={activeTab()==='ai'}>
                  <Show when={!aiBusy()} fallback={<Button size="sm" variant="destructive" onClick={() => { abortCtrl?.abort(); }}>{'Stop'}</Button>}>
                    <Button size="sm" variant="outline" disabled={!aiAvail()} onClick={async () => {
                      setAiText("");
                      setAiBusy(true);
                      abortCtrl = new AbortController();
                      try {
                        await explainJsonAiStream({ data: props.data, context: props.title, signal: abortCtrl.signal, onChunk: (d) => { setAiText((aiText() || '') + d); } });
                      } catch (e) {
                        if ((e as any)?.name !== 'AbortError') {
                          setAiText((aiText() || '') + `\n\n_Error_: ${String(e)}`);
                        }
                      } finally {
                        setAiBusy(false);
                        abortCtrl = null;
                      }
                    }}>{aiText() ? 'Regenerate' : 'Ask AI'}</Button>
                  </Show>
                  <Button size="sm" variant="outline" disabled={!aiText()} onClick={async () => {
                    try { await navigator.clipboard.writeText(aiText() || ''); setCopiedMd(true); setTimeout(()=>setCopiedMd(false), 1200);} catch {}
                  }}>{copiedMd() ? 'Copied' : 'Copy Markdown'}</Button>
                </Show>
              </div>
            </div>
            <div class="p-3">
              <Show when={activeTab()==='local'}>
                <Markdown content={(localText() ?? 'No local explanation available.') as string} />
              </Show>
              <Show when={activeTab()==='ai'}>
                <Show when={aiAvail()} fallback={<div class="text-xs text-muted-foreground">No API key. Set VITE_XAI_API_KEY or use Settings → xAI Grok API.</div>}>
                  <Markdown content={(aiText() ?? '') as string} />
                </Show>
              </Show>
            </div>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
}
