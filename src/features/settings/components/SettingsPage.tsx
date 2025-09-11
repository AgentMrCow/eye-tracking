import { createEffect, createSignal, Show } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDisabledSlicesRaw, setDisabledSlicesRaw } from "@/shared/tauriClient";
import { saveXaiApiKey, getXaiApiKey } from "@/shared/ai";
import { TextField, TextFieldInput } from "@/components/ui/text-field";
import JsonViewer from "@/components/ui/json-viewer";
import type { DisabledSlice } from "@/shared/type";
import { loadStoreDump, saveStoreDump } from "@/shared/prefs";

export default function SettingsPage() {
  const [count, setCount] = createSignal<number | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [apiKey, setApiKey] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  const [storeDump, setStoreDump] = createSignal<Record<string, unknown> | null>(null);
  const [disabledJson, setDisabledJson] = createSignal<DisabledSlice[]>([]);
  const envKey = (import.meta as any).env?.VITE_XAI_API_KEY as string | undefined;
  const usingEnv = !!(envKey && envKey.trim());

  async function refresh() {
    const rows = await getDisabledSlicesRaw().catch(() => []);
    setCount(rows.length);
    setDisabledJson(rows as DisabledSlice[]);
    const dump = await loadStoreDump().catch(() => ({}));
    setStoreDump(dump);
  }

  createEffect(() => { refresh(); (async () => setApiKey((await getXaiApiKey()) ?? ""))(); });

  async function clearDisabled() {
    setBusy(true);
    try {
      await setDisabledSlicesRaw([]);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="space-y-6">
      <Card>
        <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <div class="rounded border p-3 space-y-2">
            <div class="flex items-center justify-between">
              <div class="font-medium">user_prefs.json</div>
              <div class="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={async () => {
                  const txt = JSON.stringify(storeDump() ?? {}, null, 2);
                  await navigator.clipboard.writeText(txt).catch(()=>{});
                }}>Copy</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const blob = new Blob([JSON.stringify(storeDump() ?? {}, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = 'user_prefs.json'; a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}>Export</Button>
                <label class="inline-flex items-center gap-2">
                  <input type="file" accept="application/json,.json" class="hidden" onChange={async (e) => {
                    const file = e.currentTarget.files?.[0]; if (!file) return;
                    const txt = await file.text();
                    try {
                      const obj = JSON.parse(txt);
                      await saveStoreDump(obj);
                      setStoreDump(obj);
                    } catch {}
                    e.currentTarget.value = '';
                  }} />
                  <Button size="sm" variant="outline" onClick={(ev) => {
                    const input = (ev.currentTarget.previousSibling as HTMLInputElement) || null;
                    (input as HTMLInputElement)?.click();
                  }}>Import</Button>
                </label>
              </div>
            </div>
            <div class="text-xs text-muted-foreground">Full contents of the Tauri Store file. Copy, export, or import to migrate settings.</div>
            <JsonViewer title="Store JSON" data={storeDump()} />
          </div>
          <div class="rounded border p-3 space-y-2">
            <div class="flex items-center justify-between">
              <div class="font-medium">xAI Grok API</div>
              <Show when={usingEnv}>
                <span class="text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">Using env key</span>
              </Show>
            </div>
            <div class="text-xs text-muted-foreground">Stored locally via Tauri Store (unless an env key is provided). Never sent anywhere except your API calls.</div>
            <div class="flex items-end gap-2">
              <TextField value={apiKey()} onChange={(v) => { setApiKey(v); setSaved(false); }}>
                <TextFieldInput type="password" placeholder={usingEnv ? "Managed by env (VITE_XAI_API_KEY)" : "xai-..."} class="w-[420px]" disabled={usingEnv} />
              </TextField>
              <Button variant="outline" disabled={usingEnv} onClick={async () => { await saveXaiApiKey(apiKey()); setSaved(true); }}>Save</Button>
              <Show when={saved()}>
                <span class="text-xs text-green-600">Saved</span>
              </Show>
            </div>
            <Show when={usingEnv}>
              <div class="text-xs text-muted-foreground">To change the key, edit your .env.local and restart the app.</div>
            </Show>
          </div>
          <div class="rounded border p-3 space-y-2">
            <div class="flex items-center justify-between">
              <div class="font-medium">Disabled Slices</div>
              <div class="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={async () => {
                  const txt = JSON.stringify(disabledJson() ?? [], null, 2);
                  await navigator.clipboard.writeText(txt).catch(()=>{});
                }}>Copy</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const blob = new Blob([JSON.stringify(disabledJson() ?? [], null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = 'disabled_slices.json'; a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}>Export</Button>
                <label class="inline-flex items-center gap-2">
                  <input type="file" accept="application/json,.json" class="hidden" onChange={async (e) => {
                    const file = e.currentTarget.files?.[0]; if (!file) return;
                    const txt = await file.text();
                    try {
                      const arr = JSON.parse(txt);
                      if (Array.isArray(arr)) {
                        await setDisabledSlicesRaw(arr);
                        setDisabledJson(arr);
                        setCount(arr.length);
                      }
                    } catch {}
                    e.currentTarget.value = '';
                  }} />
                  <Button size="sm" variant="outline" onClick={(ev) => {
                    const input = (ev.currentTarget.previousSibling as HTMLInputElement) || null;
                    (input as HTMLInputElement)?.click();
                  }}>Import</Button>
                </label>
                <Button size="sm" variant="outline" disabled={busy()} onClick={clearDisabled}>Enable all</Button>
              </div>
            </div>
            <div class="text-sm text-muted-foreground">Triples currently disabled: <b>{count() ?? "…"}</b></div>
            <JsonViewer title="disabled_slices.json" data={disabledJson()} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
