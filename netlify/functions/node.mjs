import { error, handleError, json } from "../lib/http.mjs";
import { getRegistry, getSnapshot } from "../lib/storage.mjs";
import { applyStaleness, validateNodeId } from "../lib/validate.mjs";

export default async (request) => {
  try {
    const nodeId = validateNodeId(new URL(request.url).searchParams.get("id"));
    const record = await getSnapshot(nodeId);
    if (record) return json(applyStaleness(record));

    const registry = await getRegistry(nodeId);
    if (!registry) return error("Node not found.", 404);

    return json({
      nodeId,
      displayName: registry.displayName,
      visibility: registry.visibility,
      lastSeen: null,
      health: {
        level: "pending",
        label: "Waiting",
        sentence: "The node is registered but has not sent its first snapshot.",
      },
      snapshot: null,
    });
  } catch (cause) {
    return handleError(cause);
  }
};

export const config = { path: "/api/node", method: "GET" };

