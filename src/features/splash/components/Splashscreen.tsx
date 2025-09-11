import { onMount } from "solid-js";

export default function Splashscreen() {
  onMount(() => {
    // Main window will signal frontend readiness; nothing to do here.
  });

  return (
    <div class="min-h-screen flex items-center justify-center bg-background">
      <div class="flex flex-col items-center gap-4">
        <div class="h-12 w-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <div class="text-sm text-muted-foreground">Starting up…</div>
      </div>
    </div>
  );
}
