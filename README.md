# webhook-inspector

A local, dependency-free TypeScript tool for seeing what webhooks actually look like and replaying them at your own code. Think of a tiny self-hosted webhook.site.

## Use

```bash
npm install && npm run build
npm start            # http://127.0.0.1:4000
```

1. Point a sender (or `curl`) at `http://127.0.0.1:4000/h/anything`.
2. Open `http://127.0.0.1:4000` to see method, headers and body (JSON is pretty-printed).
3. Pick a request, enter your handler's URL, and click **Replay**.

Add `?status=500` to a capture URL to make the inspector answer with that status, which is handy for testing a sender's retry behavior.

To receive real webhooks from GitHub or Stripe during development, expose the port with a tunnel such as `cloudflared` or `ngrok`.

## Safety defaults

- **Binds to `127.0.0.1`.** Captured requests often contain tokens and signatures, so nothing is exposed to the network unless you set `HOST`.
- **Replay is SSRF-guarded.** A replay endpoint that calls arbitrary URLs would let anyone who can reach it probe internal services (cloud metadata, admin panels). By default only `localhost`, `127.0.0.1` and `[::1]` targets are allowed; set `ALLOW_REMOTE_REPLAY=1` to opt out. Redirects are never followed.
- **No `innerHTML`.** Captured data is rendered with `textContent`, so a hostile payload can't run script in the UI.
- Bodies over 256 KB are truncated, and only the latest 200 requests are kept in memory.

## Develop

```bash
npm test
```

## Ideas to extend

- Live updates over server-sent events instead of polling
- Re-sign payloads on replay with a secret you supply
- Export a captured request as a `curl` command or a test fixture

## License

MIT
