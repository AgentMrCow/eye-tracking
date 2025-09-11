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
    model: "grok-code-fast-1",
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

export async function explainJsonAiStream(opts: {
  data: unknown;
  context?: string;
  signal?: AbortSignal;
  onChunk: (delta: string) => void;
}): Promise<void> {
  const apiKey = await getXaiApiKey();
  if (!apiKey) throw new Error("No xAI API key configured");

  const body = {
    model: "grok-code-fast-1",
    messages: [
      { role: "system", content: "You explain JSON from an eye-tracking analysis app. Respond in Markdown. Be precise, short, and reproducible. Show formulas as fenced code blocks when helpful. Avoid hallucination; reason only from the JSON and brief context." },
      { role: "user", content: `${opts.context ? `Context: ${opts.context}\n\n` : ""}Explain the following JSON in Markdown:\n\n${safeJson(opts.data)}` },
    ],
    temperature: 0.2,
    stream: true,
  } as const;

  const resp = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  }).catch((e) => ({ ok: false, statusText: String(e) } as Response));

  if (!resp || !(resp as Response).ok) {
    throw new Error(`xAI request failed: ${((resp as Response)?.statusText || "network error")}`);
  }

  const reader = (resp as Response).body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  while (!done) {
    const { value, done: rdDone } = await reader.read();
    if (rdDone) break;
    buffer += decoder.decode(value, { stream: true });
    // Normalize newlines
    buffer = buffer.replace(/\r\n/g, "\n");
    // Process complete SSE events separated by double newlines
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = chunk.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr || dataStr === "[DONE]") { done = dataStr === "[DONE]"; continue; }
        try {
          const json = JSON.parse(dataStr);
          const delta = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content ?? "";
          if (delta) opts.onChunk(String(delta));
        } catch {
          // ignore parse errors for non-JSON lines
        }
      }
    }
  }
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v, null, 2); } catch { return String(v ?? ""); }
}
