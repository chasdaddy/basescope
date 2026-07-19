/** Tiny fetch helper: JSON, timeout, and a clear error. Node 18+ global fetch. */
export async function fetchJson(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {}
): Promise<any> {
  const { timeoutMs = 12_000, headers } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
