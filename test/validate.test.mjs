import test from "node:test";
import assert from "node:assert/strict";

import { createNodeCredentials, hashToken, tokenMatches } from "../netlify/lib/security.mjs";
import {
  applyStaleness,
  deriveHealth,
  normalizeRegistration,
  normalizeSnapshot,
} from "../netlify/lib/validate.mjs";

function healthySnapshot(overrides = {}) {
  return normalizeSnapshot({
    schemaVersion: 1,
    nodeId: "node_AbCdEf012345",
    agentVersion: "0.1.0",
    collectedAt: "2026-08-13T12:00:00Z",
    services: { node: "active", bootstrap: "active" },
    daemon: { status: "running", version: "1.0.0", pid: 4200 },
    modules: [
      { name: "blockchain_module", status: "loaded", version: "0.2.2" },
      { name: "storage_module", status: "loaded", version: "2.1.0" },
      { name: "delivery_module", status: "loaded", version: "0.2.0" },
    ],
    blockchain: { mode: "Online", height: 22857, slot: 703588, libSlot: 700000 },
    network: { peers: 9, connections: 12, pendingConnections: 0 },
    blend: { declared: true, listening: true, activeEpoch: 18 },
    host: { uptimeSeconds: 3000, diskUsedPercent: 19, memoryUsedPercent: 41 },
    listeners: { p2pUdp: true, blendUdp: true },
    ...overrides,
  });
}

test("credentials are random, correctly shaped and verifiable", () => {
  const left = createNodeCredentials();
  const right = createNodeCredentials();

  assert.match(left.nodeId, /^node_[A-Za-z0-9_-]{12}$/);
  assert.match(left.token, /^lno_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(left.nodeId, right.nodeId);
  assert.equal(tokenMatches(left.token, hashToken(left.token)), true);
  assert.equal(tokenMatches(right.token, hashToken(left.token)), false);
});

test("registration defaults to unlisted and rejects short names", () => {
  assert.deepEqual(normalizeRegistration({ displayName: "Relay 01" }), {
    displayName: "Relay 01",
    visibility: "unlisted",
  });
  assert.throws(() => normalizeRegistration({ displayName: "x" }), /at least 2/);
});

test("healthy online snapshot is classified as healthy", () => {
  const health = deriveHealth(healthySnapshot(), "2026-08-13T12:00:00Z");
  assert.equal(health.level, "healthy");
});

test("bootstrapping is warning, not critical", () => {
  const snapshot = healthySnapshot({ blockchain: { mode: "Bootstrapping", height: 0, slot: 4 } });
  assert.equal(deriveHealth(snapshot).level, "warning");
});

test("crashed module is critical", () => {
  const snapshot = healthySnapshot({
    modules: [{ name: "blockchain_module", status: "crashed", version: "0.2.2" }],
  });
  assert.equal(deriveHealth(snapshot).level, "critical");
});

test("records become stale after five minutes", () => {
  const record = {
    lastSeen: "2026-08-13T12:00:00Z",
    health: { level: "healthy", label: "Healthy", sentence: "OK" },
  };
  const stale = applyStaleness(record, Date.parse("2026-08-13T12:06:00Z"));
  assert.equal(stale.health.level, "stale");
  assert.equal(stale.ageSeconds, 360);
});

test("snapshot normalization drops unexpected secret-shaped fields", () => {
  const snapshot = healthySnapshot({
    walletKey: "must-not-pass",
    host: { diskUsedPercent: 200, memoryUsedPercent: -10, privateKey: "must-not-pass" },
  });

  assert.equal("walletKey" in snapshot, false);
  assert.equal("privateKey" in snapshot.host, false);
  assert.equal(snapshot.host.diskUsedPercent, 100);
  assert.equal(snapshot.host.memoryUsedPercent, 0);
});
