import { createEffect } from "solid-js";
import { useIsRouting } from "@solidjs/router";
import { startLoading, stopLoading } from "@/shared/loading";

export default function RouteLoadingTracker() {
  const routing = useIsRouting();
  createEffect(() => {
    if (routing()) startLoading();
    else stopLoading();
  });
  return null;
}

