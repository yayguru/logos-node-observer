import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT || 4173);
const webRoot = join(import.meta.dirname, "..", "web");
const nodeId = "node_demo4R7xQ2";
const now = new Date().toISOString();

const record = {
  nodeId,
  displayName: "Devnet core / Warsaw 01",
  visibility: "public",
  createdAt: now,
  lastSeen: now,
  health: {
    level: "healthy",
    label: "Healthy",
    sentence: "Blockchain is online, all four modules are loaded and the Blend listener is active.",
  },
  snapshot: {
    schemaVersion: 1,
    observedAt: now,
    services: { node: "active", bootstrap: "active" },
    daemon: { status: "running", version: "1.0.0" },
    blockchain: {
      mode: "Online",
      height: 22857,
      slot: 703588,
      libSlot: 700144,
      tip: "c20bb15b7d9b1a8bfaed716b91d07c83c447fce05ee6d7e783e16c590165f792",
    },
    network: {
      peerId: "12D3KooWNehoiab93UMWrmdeH1A7ipAxFADeamhxgoWZDc7JH2gC",
      peers: 9,
      connections: 12,
      pendingConnections: 0,
    },
    blend: { declared: true, listening: true },
    host: { diskUsedPercent: 19, memoryUsedPercent: 28, uptimeSeconds: 692440 },
    modules: [
      { name: "blockchain_module", status: "loaded", version: "0.2.2", uptimeSeconds: 28727 },
      { name: "delivery_module", status: "loaded", version: "0.2.0", uptimeSeconds: 28726 },
      { name: "storage_module", status: "loaded", version: "2.1.0", uptimeSeconds: 28727 },
      { name: "capability_module", status: "loaded", version: "1.0.0", uptimeSeconds: 28732 },
    ],
    listeners: {
      p2pUdp: true,
      blendUdp: true,
      storageUdp: true,
      storageTcp: false,
      deliveryUdp: true,
      deliveryTcp: false,
    },
  },
};

function sendJson(response, body, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === "/api/nodes") {
    sendJson(response, { nodes: [{ ...record, snapshot: undefined, mode: "Online", height: 22857 }] });
    return;
  }
  if (url.pathname === "/api/node") {
    sendJson(response, url.searchParams.get("id") === nodeId ? record : { error: "Node not found." }, url.searchParams.get("id") === nodeId ? 200 : 404);
    return;
  }
  if (url.pathname === "/api/register") {
    sendJson(response, { error: "Registration is disabled in the local visual preview." }, 409);
    return;
  }

  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = normalize(join(webRoot, requested));
  if (!filePath.startsWith(webRoot)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" }[extname(filePath)] || "application/octet-stream";
    response.writeHead(200, { "content-type": `${mime}; charset=utf-8` });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Preview server: http://127.0.0.1:${port}\n`);
});
