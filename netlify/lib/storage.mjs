import { getStore } from "@netlify/blobs";

const STORE_NAME = "logos-node-observer";

function store() {
  return getStore(STORE_NAME);
}

export async function createRegistry(record) {
  const result = await store().setJSON(`registry/${record.nodeId}`, record, { onlyIfNew: true });
  if (!result.modified) throw new Error("Node id collision.");
}

export function getRegistry(nodeId) {
  return store().get(`registry/${nodeId}`, { type: "json" });
}

export function saveSnapshot(nodeId, record) {
  return store().setJSON(`snapshot/${nodeId}`, record);
}

export function getSnapshot(nodeId) {
  return store().get(`snapshot/${nodeId}`, { type: "json" });
}

export async function savePublicSummary(nodeId, summary) {
  return store().setJSON(`public/${nodeId}`, summary);
}

export async function listPublicSummaries() {
  const result = await store().list({ prefix: "public/" });
  const records = await Promise.all(
    result.blobs.slice(0, 250).map((blob) => store().get(blob.key, { type: "json" })),
  );
  return records.filter(Boolean);
}

export async function deleteNode(nodeId) {
  await Promise.all([
    store().delete(`registry/${nodeId}`),
    store().delete(`snapshot/${nodeId}`),
    store().delete(`public/${nodeId}`),
  ]);
}
