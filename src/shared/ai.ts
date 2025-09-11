import { Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "user_prefs.json";
const KEY_XAI = "xai_api_key";

let _store: Store | null = null;
async function store(): Promise<Store> {
  if (_store) return _store;
  _store = await Store.load(STORE_FILE);
  return _store;
}

export async function saveXaiApiKey(key: string): Promise<void> {
  const s = await store();
  await s.set(KEY_XAI, key);
  await s.save();
}

export async function getXaiApiKey(): Promise<string | null> {
  try {
    // 1) Prefer environment variable injected at build time (Vite)
    const envKey = (import.meta as any).env?.VITE_XAI_API_KEY as string | undefined;
    if (envKey && envKey.trim()) return envKey.trim();

    // 2) Fall back to Tauri Store
    const s = await store();
    const v = (await s.get(KEY_XAI)) as string | null | undefined;
    return v ?? null;
  } catch {
    return null;
  }
}

export async function hasXaiKey(): Promise<boolean> {
  const envKey = (import.meta as any).env?.VITE_XAI_API_KEY as string | undefined;
  if (envKey && envKey.trim()) return true;
  const k = await getXaiApiKey();
  return !!(k && k.trim());
}

export async function explainJsonAi(data: unknown, context?: string): Promise<string> {
  const apiKey = await getXaiApiKey();
  if (!apiKey) return "No xAI API key configured in Settings.";

  const body = {
    model: "grok-2-latest",
    messages: [
      { role: "system", content: "You explain JSON from an eye-tracking analysis app. Respond in Markdown. Be precise, short, and reproducible. Show formulas as fenced code blocks when helpful. Avoid hallucination; reason only from the JSON and brief context." },
      { role: "user", content: `${context ? `Context: ${context}\n\n` : ""}Explain the following JSON in Markdown:\n\n${safeJson(data)}` },
    ],
    temperature: 0.2,
    stream: false,
  } as const;

  const resp = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  }).catch((e) => ({ ok: false, statusText: String(e) } as Response));

  if (!resp || !(resp as Response).ok) {
    return `xAI request failed: ${((resp as Response)?.statusText || "network error")}`;
  }
  const json = await (resp as Response).json().catch(() => null);
  const txt = json?.choices?.[0]?.message?.content ?? null;
  return txt || "No content returned by xAI.";
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v, null, 2); } catch { return String(v ?? ""); }
}
