import { createEffect, createSignal, onCleanup } from "solid-js";
import { isLoading } from "@/shared/loading";

export default function GlobalLoadingOverlay() {
  const [visible, setVisible] = createSignal(false);
  let timer: number | undefined;

  createEffect(() => {
    const active = isLoading();
    if (active) {
      clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(true), 200);
    } else {
      clearTimeout(timer);
      setVisible(false);
    }
  });

  onCleanup(() => clearTimeout(timer));

  return visible() ? (
    <div class="fixed inset-0 z-[1100] bg-background/60 backdrop-blur-[1.5px]">
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="flex flex-col items-center gap-3">
          <div class="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <div class="text-sm text-muted-foreground">Loading…</div>
        </div>
      </div>
    </div>
  ) : null;
}