import { createEffect, createSignal, Show } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDisabledSlicesRaw, setDisabledSlicesRaw } from "@/shared/tauriClient";
import { saveXaiApiKey, getXaiApiKey } from "@/shared/ai";
import { TextField, TextFieldInput } from "@/components/ui/text-field";

export default function SettingsPage() {
  const [count, setCount] = createSignal<number | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [apiKey, setApiKey] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  const envKey = (import.meta as any).env?.VITE_XAI_API_KEY as string | undefined;
  const usingEnv = !!(envKey && envKey.trim());

  async function refresh() {
    const rows = await getDisabledSlicesRaw().catch(() => []);
    setCount(rows.length);
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
          <div class="rounded border p-3 flex items-center justify-between">
            <div>
              <div class="font-medium">Disabled Slices</div>
              <div class="text-sm text-muted-foreground">Triples currently disabled: <b>{count() ?? "…"}</b></div>
            </div>
            <Button variant="outline" disabled={busy()} onClick={clearDisabled}>Enable all</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
