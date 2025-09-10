// src/shared/prefs.ts
import type { AoiKey } from "@/features/catalog/types";

type InvalidKey = "other" | "missing" | "out_of_screen";

export type ComparePrefs = {
  blueKeys: AoiKey[];
  redKeys: AoiKey[];
  redCustom: boolean;
  invalidCats: InvalidKey[];
};

const STORE_FILE = "user_prefs.json"; // stored under AppData by Tauri Store
const KEY_COMPARE = "compare_prefs";

async function getStore(): Promise<any | null> {
  try {
    const mod: any = await import("@tauri-apps/plugin-store");
    // v2 API: constructor is private; use static load
    const store = await mod.Store.load(STORE_FILE);
    return store;
  } catch {
    return null; // likely running in web preview; fall back to localStorage
  }
}

export async function loadComparePrefs(): Promise<ComparePrefs | null> {
  const store = await getStore();
  if (store) {
    try {
      const val = await store.get(KEY_COMPARE);
      if (val != null) return val as ComparePrefs;
    } catch {
      // fallthrough to localStorage
    }
  }
  try {
    const s = window?.localStorage?.getItem(KEY_COMPARE) ?? null;
    return s ? (JSON.parse(s) as ComparePrefs) : null;
  } catch {
    return null;
  }
}

export async function saveComparePrefs(prefs: ComparePrefs): Promise<void> {
  const store = await getStore();
  if (store) {
    await store.set(KEY_COMPARE, prefs);
    await store.save();
  }
  try {
    window?.localStorage?.setItem(KEY_COMPARE, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}
