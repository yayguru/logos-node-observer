import { RequestError } from "./http.mjs";

const NODE_ID_PATTERN = /^node_[A-Za-z0-9_-]{12}$/;
const STATES = new Set(["active", "inactive", "failed", "unknown"]);
const VISIBILITIES = new Set(["public", "unlisted"]);

function text(value, fallback = "", maxLength = 120) {
  if (typeof value !== "string") return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
}

function integer(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function percent(value) {
  return integer(value, 0, 0, 100);
}

function state(value) {
  const normalized = text(value, "unknown", 16).toLowerCase();
  return STATES.has(normalized) ? normalized : "unknown";
}

function boolean(value) {
  return value === true;
}

function shortHash(value) {
  return text(value, "", 128).replace(/[^A-Za-z0-9:_-]/g, "");
}

export function normalizeRegistration(input) {
  const displayName = text(input?.displayName, "", 48);
  const visibility = text(input?.visibility, "unlisted", 16).toLowerCase();

  if (displayName.length < 2) {
    throw new RequestError("Display name must contain at least 2 characters.");
  }
  if (!VISIBILITIES.has(visibility)) {
    throw new RequestError("Visibility must be public or unlisted.");
  }

  return { displayName, visibility };
}

export function validateNodeId(value) {
  const nodeId = text(value, "", 32);
  if (!NODE_ID_PATTERN.test(nodeId)) {
    throw new RequestError("Invalid node id.");
  }
  return nodeId;
}

export function normalizeSnapshot(input) {
  const nodeId = validateNodeId(input?.nodeId);
  if (integer(input?.schemaVersion, -1) !== 1) {
    throw new RequestError("Unsupported snapshot schema version.");
  }

  const modules = Array.isArray(input?.modules)
    ? input.modules.slice(0, 24).map((module) => ({
        name: text(module?.name, "unknown", 48),
        status: text(module?.status, "unknown", 24).toLowerCase(),
        version: text(module?.version, "", 24),
        uptimeSeconds: integer(module?.uptimeSeconds),
      }))
    : [];

  return {
    schemaVersion: 1,
    agentVersion: text(input?.agentVersion, "unknown", 24),
    nodeId,
    collectedAt: text(input?.collectedAt, "", 40),
    services: {
      node: state(input?.services?.node),
      bootstrap: state(input?.services?.bootstrap),
    },
    daemon: {
      status: text(input?.daemon?.status, "unknown", 24).toLowerCase(),
      version: text(input?.daemon?.version, "", 24),
      pid: integer(input?.daemon?.pid),
    },
    modules,
    blockchain: {
      mode: text(input?.blockchain?.mode, "Unknown", 24),
      height: integer(input?.blockchain?.height),
      slot: integer(input?.blockchain?.slot),
      libSlot: integer(input?.blockchain?.libSlot),
      tip: shortHash(input?.blockchain?.tip),
      lib: shortHash(input?.blockchain?.lib),
    },
    network: {
      peerId: shortHash(input?.network?.peerId),
      peers: integer(input?.network?.peers, 0, 0, 100_000),
      connections: integer(input?.network?.connections, 0, 0, 100_000),
      pendingConnections: integer(input?.network?.pendingConnections, 0, 0, 100_000),
    },
    blend: {
      declared: boolean(input?.blend?.declared),
      listening: boolean(input?.blend?.listening),
      activeEpoch: integer(input?.blend?.activeEpoch),
    },
    host: {
      uptimeSeconds: integer(input?.host?.uptimeSeconds),
      diskUsedPercent: percent(input?.host?.diskUsedPercent),
      memoryUsedPercent: percent(input?.host?.memoryUsedPercent),
    },
    listeners: {
      p2pUdp: boolean(input?.listeners?.p2pUdp),
      blendUdp: boolean(input?.listeners?.blendUdp),
      storageUdp: boolean(input?.listeners?.storageUdp),
      storageTcp: boolean(input?.listeners?.storageTcp),
      deliveryUdp: boolean(input?.listeners?.deliveryUdp),
      deliveryTcp: boolean(input?.listeners?.deliveryTcp),
    },
  };
}

export function deriveHealth(snapshot, receivedAt = new Date().toISOString()) {
  const reasons = [];
  const failedModules = snapshot.modules.filter((module) =>
    ["crashed", "failed", "not_loaded"].includes(module.status),
  );

  if (snapshot.services.node !== "active") reasons.push("Node service is not active");
  if (snapshot.daemon.status !== "running") reasons.push("Logos daemon is not running");
  if (failedModules.length) reasons.push(`${failedModules.length} module(s) require attention`);
  if (!snapshot.blockchain.mode || snapshot.blockchain.mode === "Unknown") {
    reasons.push("Blockchain state is unavailable");
  }

  if (reasons.length) {
    return { level: "critical", label: "Critical", sentence: reasons[0] };
  }

  if (snapshot.blockchain.mode.toLowerCase() !== "online") {
    reasons.push(`Blockchain is ${snapshot.blockchain.mode.toLowerCase()}`);
  }
  if (snapshot.network.peers === 0) reasons.push("No peers are connected");
  if (snapshot.host.diskUsedPercent >= 85) reasons.push("Disk usage is above 85%");
  if (snapshot.blend.declared && !snapshot.blend.listening) {
    reasons.push("Blend declaration exists but listener is inactive");
  }

  if (reasons.length) {
    return { level: "warning", label: "Attention", sentence: reasons[0] };
  }

  return {
    level: "healthy",
    label: "Healthy",
    sentence: `Node reported a healthy snapshot at ${receivedAt}.`,
  };
}

export function applyStaleness(record, now = Date.now()) {
  if (!record?.lastSeen) return record;
  const ageSeconds = Math.max(0, Math.floor((now - Date.parse(record.lastSeen)) / 1000));
  if (ageSeconds <= 300) return { ...record, ageSeconds };

  return {
    ...record,
    ageSeconds,
    health: {
      level: "stale",
      label: "Stale",
      sentence: `No snapshot received for ${Math.floor(ageSeconds / 60)} minutes.`,
    },
  };
}

