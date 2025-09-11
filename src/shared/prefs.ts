// src/shared/prefs.ts
import type { AoiKey } from "@/features/catalog/types";
import { Store } from "@tauri-apps/plugin-store";

type InvalidKey = "other" | "missing" | "out_of_screen";

export type ComparePrefs = {
  blueKeys: AoiKey[];
  redKeys: AoiKey[];
  redCustom: boolean;
  invalidCats: InvalidKey[];
};

const STORE_FILE = "user_prefs.json"; // stored under AppData by Tauri Store
const KEY_COMPARE = "compare_prefs";

async function getStore(): Promise<Store | null> {
  try {
    const store = await Store.load(STORE_FILE);
    return store as Store;
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

// Dump/load the whole user_prefs.json for Settings export/import
export async function loadStoreDump(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const store = await getStore();
  if (store) {
    try {
      const entries = await store.entries();
      for (const [k, v] of entries) out[k] = v;
      return out;
    } catch {
      // fall back to localStorage below
    }
  }
  try {
    const compare = window?.localStorage?.getItem(KEY_COMPARE);
    if (compare != null) out[KEY_COMPARE] = JSON.parse(compare);
  } catch {}
  try {
    const xai = window?.localStorage?.getItem("xai_api_key");
    if (xai != null) out["xai_api_key"] = JSON.parse(xai);
  } catch {
    // if it was stored as plain string
    const xai = window?.localStorage?.getItem("xai_api_key");
    if (xai != null) out["xai_api_key"] = xai;
  }
  return out;
}

export async function saveStoreDump(all: Record<string, unknown>): Promise<void> {
  const store = await getStore();
  if (store) {
    for (const [k, v] of Object.entries(all)) {
      await store.set(k, v as any);
    }
    await store.save();
  }
  try {
    if (all[KEY_COMPARE] != null) {
      window?.localStorage?.setItem(KEY_COMPARE, JSON.stringify(all[KEY_COMPARE]));
    }
    if (all["xai_api_key"] != null) {
      const v = all["xai_api_key"] as any;
      const str = typeof v === "string" ? v : JSON.stringify(v);
      window?.localStorage?.setItem("xai_api_key", str);
    }
  } catch {
    // ignore
  }
}
