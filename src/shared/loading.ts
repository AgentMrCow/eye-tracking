import { createSignal } from "solid-js";

const [loadingCount, setLoadingCount] = createSignal(0);

export const isLoading = () => loadingCount() > 0;

export function startLoading() {
  setLoadingCount((c) => c + 1);
}

export function stopLoading() {
  setLoadingCount((c) => Math.max(0, c - 1));
}

export async function withLoading<T>(p: Promise<T>): Promise<T> {
  startLoading();
  try {
    return await p;
  } finally {
    stopLoading();
  }
}

