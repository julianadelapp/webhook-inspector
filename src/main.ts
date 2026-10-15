import { createServer } from "./server.js";
import { RequestStore } from "./store.js";

const port = Number(process.env.PORT ?? 4000);
// Loopback by default: captured requests can contain secrets, so don't expose them to the network unless asked.
const host = process.env.HOST ?? "127.0.0.1";
const allowRemoteReplay = process.env.ALLOW_REMOTE_REPLAY === "1";

createServer(new RequestStore(), { allowRemoteReplay }).listen(port, host, () => {
  console.log(`webhook-inspector on http://${host}:${port}  (send webhooks to /h/<anything>)`);
});
