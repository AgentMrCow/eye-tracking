import { isLoading } from "@/shared/loading";

export default function GlobalLoadingBar() {
  return isLoading() ? (
    <div class="fixed left-0 right-0 top-0 z-[1000] h-1">
      <div class="h-full w-full bg-primary animate-pulse" />
    </div>
  ) : null;
}

