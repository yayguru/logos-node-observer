import { bearerToken, tokenMatches } from "../lib/security.mjs";
import { error, handleError, json, readJson } from "../lib/http.mjs";
import { getRegistry, savePublicSummary, saveSnapshot } from "../lib/storage.mjs";
import { deriveHealth, normalizeSnapshot } from "../lib/validate.mjs";

export default async (request) => {
  try {
    const snapshot = normalizeSnapshot(await readJson(request));
    const registry = await getRegistry(snapshot.nodeId);
    if (!registry || !tokenMatches(bearerToken(request), registry.tokenHash)) {
      return error("Invalid node credentials.", 401);
    }

    const lastSeen = new Date().toISOString();
    const health = deriveHealth(snapshot, lastSeen);
    const record = {
      nodeId: snapshot.nodeId,
      displayName: registry.displayName,
      visibility: registry.visibility,
      lastSeen,
      health,
      snapshot,
    };

    await saveSnapshot(snapshot.nodeId, record);
    if (registry.visibility === "public") {
      await savePublicSummary(snapshot.nodeId, {
        nodeId: snapshot.nodeId,
        displayName: registry.displayName,
        lastSeen,
        health,
        mode: snapshot.blockchain.mode,
        height: snapshot.blockchain.height,
        peers: snapshot.network.peers,
      });
    }

    return json({ accepted: true, nodeId: snapshot.nodeId, lastSeen, health });
  } catch (cause) {
    return handleError(cause);
  }
};

export const config = {
  path: "/api/ingest",
  method: "POST",
  rateLimit: {
    windowLimit: 90,
    windowSize: 3_600,
    aggregateBy: ["ip", "domain"],
  },
};

