// src/lib/skiplist.ts
import { Store } from "@tauri-apps/plugin-store";

/** A rule can target a participant, and (optionally) a specific test/timeline/recording */
export type SkipSelector = {
  participant?: string;
  test_name?: string;
  timeline?: string;
  recording?: string;
};

export type SkipList = { selectors: SkipSelector[] };

const FILE_NAME = "skiplist.json";
let storePromise: Promise<Store> | null = null;

async function getStore(): Promise<Store> {
  if (!storePromise) storePromise = Store.load(FILE_NAME);
  return storePromise;
}

async function read(): Promise<SkipList> {
  const store = await getStore();

  // Primary location: key "selectors"
  const selectors = await store.get<unknown>("selectors");
  if (Array.isArray(selectors)) return { selectors: selectors as SkipSelector[] };
  if (selectors && typeof selectors === "object" && Array.isArray((selectors as any).selectors)) {
    return { selectors: (selectors as any).selectors as SkipSelector[] };
  }

  // Legacy migration path: whole object under "skiplist"
  const legacy = await store.get<unknown>("skiplist");
  if (legacy && typeof legacy === "object" && Array.isArray((legacy as any).selectors)) {
    const list = { selectors: (legacy as any).selectors as SkipSelector[] };
    await store.set("selectors", list.selectors);
    await store.delete("skiplist");
    await store.save();
    return list;
  }

  return { selectors: [] };
}

async function write(sl: SkipList): Promise<SkipList> {
  const store = await getStore();
  await store.set("selectors", sl.selectors);
  await store.save();
  return sl;
}

export async function loadSkiplist(): Promise<SkipList> {
  return read();
}

function eq(a?: string, b?: string) {
  return a != null && b != null && a === b;
}

function matches(sel: SkipSelector, t: SkipSelector): boolean {
  if (sel.participant != null && !eq(sel.participant, t.participant)) return false;
  if (sel.test_name  != null && !eq(sel.test_name,  t.test_name))  return false;
  if (sel.timeline   != null && !eq(sel.timeline,   t.timeline))   return false;
  if (sel.recording  != null && !eq(sel.recording,  t.recording))  return false;
  return true;
}

export function shouldSkip(list: SkipList, target: SkipSelector): boolean {
  return list.selectors.some((s) => matches(s, target));
}

export function isGlobalParticipantSkip(list: SkipList, participant: string): boolean {
  return list.selectors.some(
    (s) =>
      s.participant === participant &&
      s.test_name == null &&
      s.timeline == null &&
      s.recording == null
  );
}

function dedupe(arr: SkipSelector[]): SkipSelector[] {
  const key = (s: SkipSelector) =>
    [s.participant ?? "", s.test_name ?? "", s.timeline ?? "", s.recording ?? ""].join("|");
  const seen = new Set<string>();
  const out: SkipSelector[] = [];
  for (const s of arr) {
    const k = key(s);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

export async function addSkipRule(list: SkipList, rule: SkipSelector): Promise<SkipList> {
  const next = { selectors: dedupe([...list.selectors, rule]) };
  return write(next);
}

export async function removeSkipRule(list: SkipList, rule: SkipSelector): Promise<SkipList> {
  const key = (s: SkipSelector) =>
    [s.participant ?? "", s.test_name ?? "", s.timeline ?? "", s.recording ?? ""].join("|");
  const rkey = key(rule);
  const next = { selectors: list.selectors.filter((s) => key(s) !== rkey) };
  return write(next);
}

export async function clearSkiplist(): Promise<void> {
  const store = await getStore();
  await store.set("selectors", []);
  await store.save();
}

export async function listSkipRules(): Promise<SkipSelector[]> {
  const sl = await read();
  return sl.selectors;
}
