import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttp, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { checkTarget } from "./replay.js";
import { createServer } from "./server.js";
import { MAX_BODY_CHARS, RequestStore } from "./store.js";

const base = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
const listen = (s: Server) => new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
const close = (s: Server) => new Promise((r) => s.close(r));

async function withInspector(fn: (url: string, store: RequestStore) => Promise<void>) {
  const store = new RequestStore();
  const server = createServer(store);
  await listen(server);
  try {
    await fn(base(server), store);
  } finally {
    await close(server);
  }
}

test("store keeps newest first, caps capacity and truncates huge bodies", () => {
  const s = new RequestStore(2);
  const mk = (body: string) => s.add({ method: "POST", path: "/h/x", headers: {}, body, size: body.length });
  mk("a");
  mk("b");
  mk("c");
  assert.deepEqual(s.list().map((i) => i.body), ["c", "b"]);
  const big = mk("x".repeat(MAX_BODY_CHARS + 5));
  assert.equal(big.truncated, true);
  assert.equal(big.body.length, MAX_BODY_CHARS);
});

test("captures method, headers and body and honours ?status=", async () => {
  await withInspector(async (url, store) => {
    const res = await fetch(`${url}/h/stripe?status=503`, { method: "POST", headers: { "x-test": "1" }, body: '{"a":1}' });
    assert.equal(res.status, 503);
    const [entry] = store.list();
    assert.equal(entry?.method, "POST");
    assert.equal(entry?.headers["x-test"], "1");
    assert.equal(entry?.body, '{"a":1}');
    assert.equal(entry?.path, "/h/stripe?status=503");
    assert.equal((await fetch(`${url}/h/x?status=999`, { method: "POST" })).status, 200);
  });
});

test("replay re-sends method, body and headers to a localhost target", async () => {
  const seen: { body: string; ev?: string; host?: string }[] = [];
  const target = createHttp(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    seen.push({ body: Buffer.concat(chunks).toString(), ev: req.headers["x-github-event"] as string, host: req.headers.host });
    res.writeHead(201).end();
  });
  await listen(target);
  await withInspector(async (url) => {
    await fetch(`${url}/h/gh`, { method: "POST", headers: { "x-github-event": "push" }, body: '{"ok":true}' });
    const id = ((await (await fetch(`${url}/api/requests`)).json()) as { id: string }[])[0]?.id;
    const res = await fetch(`${url}/api/replay`, {
      method: "POST",
      body: JSON.stringify({ id, url: `${base(target)}/webhook` }),
    });
    assert.deepEqual(await res.json(), { status: 201 });
  });
  await close(target);
  assert.equal(seen[0]?.body, '{"ok":true}');
  assert.equal(seen[0]?.ev, "push");
  assert.notEqual(seen[0]?.host, "inspector"); // the original Host header is not copied
});

test("replay refuses non-loopback and non-http targets (SSRF guard)", async () => {
  assert.equal(checkTarget("http://169.254.169.254/latest/meta-data", false).ok, false);
  assert.equal(checkTarget("https://example.com/hook", false).ok, false);
  assert.equal(checkTarget("file:///etc/passwd", true).ok, false);
  assert.equal(checkTarget("not a url", true).ok, false);
  assert.equal(checkTarget("http://localhost:3000/x", false).ok, true);
  assert.equal(checkTarget("https://example.com/hook", true).ok, true);
  await withInspector(async (url) => {
    await fetch(`${url}/h/x`, { method: "POST", body: "{}" });
    const id = ((await (await fetch(`${url}/api/requests`)).json()) as { id: string }[])[0]?.id;
    const res = await fetch(`${url}/api/replay`, { method: "POST", body: JSON.stringify({ id, url: "http://10.0.0.5/x" }) });
    assert.equal(res.status, 400);
  });
});

test("replay reports unknown ids and bad json; clear empties the list; page renders", async () => {
  await withInspector(async (url) => {
    const unknown = await fetch(`${url}/api/replay`, { method: "POST", body: JSON.stringify({ id: "nope", url: "http://localhost/" }) });
    assert.equal(unknown.status, 404);
    assert.equal((await fetch(`${url}/api/replay`, { method: "POST", body: "{bad" })).status, 400);
    await fetch(`${url}/h/x`, { method: "POST", body: "{}" });
    await fetch(`${url}/api/requests`, { method: "DELETE" });
    assert.deepEqual(await (await fetch(`${url}/api/requests`)).json(), []);
    assert.match(await (await fetch(url)).text(), /Webhook Inspector/);
  });
});
