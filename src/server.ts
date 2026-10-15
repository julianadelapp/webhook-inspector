import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { PAGE } from "./page.js";
import { checkTarget, replay } from "./replay.js";
import { RequestStore } from "./store.js";

async function readBody(req: IncomingMessage, limit = 1_048_576): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) return null;
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface InspectorOptions {
  allowRemoteReplay?: boolean;
}

export function createServer(store: RequestStore, opts: InspectorOptions = {}): Server {
  const json = (res: ServerResponse, status: number, payload: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(payload));
  };

  return createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/h" || url.pathname.startsWith("/h/")) {
      const body = await readBody(req);
      if (body === null) return json(res, 413, { error: "payload too large" });
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers[k] = v;
      const entry = store.add({
        method: req.method ?? "GET",
        path: url.pathname + url.search,
        headers,
        body,
        size: Buffer.byteLength(body),
      });
      const wanted = Number(url.searchParams.get("status") ?? 200);
      const status = Number.isInteger(wanted) && wanted >= 200 && wanted <= 599 ? wanted : 200;
      return json(res, status, { captured: entry.id });
    }

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" });
      return void res.end(PAGE);
    }
    if (req.method === "GET" && url.pathname === "/api/requests") return json(res, 200, store.list());
    if (req.method === "DELETE" && url.pathname === "/api/requests") {
      store.clear();
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/replay") {
      const raw = await readBody(req, 16 * 1024);
      let input: { id?: unknown; url?: unknown };
      try {
        input = JSON.parse(raw ?? "");
      } catch {
        return json(res, 400, { error: "invalid json" });
      }
      const entry = typeof input.id === "string" ? store.get(input.id) : undefined;
      if (!entry) return json(res, 404, { error: "request not found" });
      const target = checkTarget(input.url, opts.allowRemoteReplay === true);
      if (!target.ok) return json(res, 400, { error: target.reason });
      try {
        return json(res, 200, await replay(entry, target.url));
      } catch (err) {
        return json(res, 502, { error: err instanceof Error ? err.message : "replay failed" });
      }
    }

    return json(res, 404, { error: "not found" });
  });
}
