import type { Captured } from "./store.js";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SKIP_HEADERS = new Set(["host", "content-length", "connection", "transfer-encoding", "keep-alive", "expect"]);

export type TargetCheck = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Replay is an SSRF risk: anyone who can reach the inspector could make it call internal services.
 * By default only loopback targets are allowed; remote targets need an explicit opt-in.
 */
export function checkTarget(raw: unknown, allowRemote: boolean): TargetCheck {
  if (typeof raw !== "string") return { ok: false, reason: "url must be a string" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "only http(s) urls" };
  if (!allowRemote && !LOOPBACK.has(url.hostname)) {
    return { ok: false, reason: "only localhost targets are allowed (set ALLOW_REMOTE_REPLAY=1 to change)" };
  }
  return { ok: true, url };
}

export async function replay(entry: Captured, url: URL): Promise<{ status: number }> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(entry.headers)) if (!SKIP_HEADERS.has(k)) headers[k] = v;
  const hasBody = entry.method !== "GET" && entry.method !== "HEAD";
  const res = await fetch(url, {
    method: entry.method,
    headers,
    body: hasBody ? entry.body : undefined,
    redirect: "manual", // never follow a redirect off the checked host
    signal: AbortSignal.timeout(5000),
  });
  await res.arrayBuffer().catch(() => undefined);
  return { status: res.status };
}
