/** Single-file UI. All captured data is inserted with textContent, never innerHTML. */
export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Webhook Inspector</title>
<style>
  :root { --bg:#0f1115; --fg:#e6e8ee; --muted:#8b93a7; --card:#171a21; --line:#252a35; --accent:#4c9aff; }
  @media (prefers-color-scheme: light) { :root { --bg:#f6f7f9; --fg:#14171f; --muted:#5b6478; --card:#fff; --line:#e1e4ea; --accent:#0b6bcb; } }
  body { margin:0; font:15px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--fg); }
  main { max-width:1000px; margin:0 auto; padding:16px; display:grid; gap:16px; grid-template-columns:minmax(0,1fr); }
  @media (min-width:800px) { main { grid-template-columns:320px minmax(0,1fr); } }
  h1 { font-size:20px; margin:0 0 8px; grid-column:1/-1; }
  .panel { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px; }
  .item { padding:8px; border-radius:6px; cursor:pointer; border:1px solid transparent; }
  .item:hover, .item.sel { border-color:var(--accent); }
  .m { font-weight:700; margin-right:6px; } .muted { color:var(--muted); font-size:13px; }
  pre { white-space:pre-wrap; word-break:break-word; background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:8px; max-height:320px; overflow:auto; }
  input, button { font:inherit; background:var(--bg); color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:6px 10px; }
  button { cursor:pointer; } input { width:min(100%,320px); }
</style>
</head>
<body>
<main>
  <h1>Webhook Inspector</h1>
  <section class="panel">
    <p class="muted" id="hint"></p>
    <button id="clear">Clear all</button>
    <div id="list"></div>
  </section>
  <section class="panel" id="detail"><p class="muted">Select a request.</p></section>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  let items = [], selected = null;
  $("hint").textContent = "Send webhooks to " + location.origin + "/h/anything (add ?status=500 to make the response fail).";
  function pretty(body) { try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; } }
  function renderList() {
    $("list").replaceChildren(...items.map((r) => {
      const d = el("div", "item" + (r.id === selected ? " sel" : ""));
      d.append(el("span", "m", r.method), el("span", "", r.path), el("div", "muted", new Date(r.receivedAt).toLocaleTimeString() + " \\u00b7 " + r.size + " bytes"));
      d.onclick = () => { selected = r.id; renderList(); renderDetail(); };
      return d;
    }));
  }
  function renderDetail() {
    const r = items.find((x) => x.id === selected);
    if (!r) return;
    const url = el("input"); url.placeholder = "http://localhost:3000/webhook";
    const out = el("span", "muted");
    const btn = el("button", "", "Replay");
    btn.onclick = async () => {
      out.textContent = "sending...";
      const res = await fetch("/api/replay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id, url: url.value }) });
      const j = await res.json();
      out.textContent = res.ok ? "target answered " + j.status : j.error;
    };
    $("detail").replaceChildren(
      el("h3", "", r.method + " " + r.path),
      el("div", "muted", "Headers"), el("pre", "", Object.entries(r.headers).map(([k, v]) => k + ": " + v).join("\\n")),
      el("div", "muted", "Body" + (r.truncated ? " (truncated)" : "")), el("pre", "", pretty(r.body)),
      el("div", "muted", "Replay to"), url, btn, out);
  }
  $("clear").onclick = async () => { await fetch("/api/requests", { method: "DELETE" }); load(); };
  async function load() {
    try { items = await (await fetch("/api/requests")).json(); renderList(); if (selected) renderDetail(); } catch {}
  }
  load(); setInterval(load, 2000);
</script>
</body>
</html>`;
