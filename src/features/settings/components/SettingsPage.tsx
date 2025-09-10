import { createEffect, createSignal, Show } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDisabledSlicesRaw, setDisabledSlicesRaw } from "@/shared/tauriClient";

export default function SettingsPage() {
  const [count, setCount] = createSignal<number | null>(null);
  const [busy, setBusy] = createSignal(false);

  async function refresh() {
    const rows = await getDisabledSlicesRaw().catch(() => []);
    setCount(rows.length);
  }

  createEffect(() => { refresh(); });

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

