import { handleError, json } from "../lib/http.mjs";
import { listPublicSummaries } from "../lib/storage.mjs";
import { applyStaleness } from "../lib/validate.mjs";

export default async () => {
  try {
    const nodes = (await listPublicSummaries())
      .map((node) => applyStaleness(node))
      .sort((left, right) => Date.parse(right.lastSeen) - Date.parse(left.lastSeen));
    return json({ nodes, count: nodes.length });
  } catch (cause) {
    return handleError(cause);
  }
};

export const config = { path: "/api/nodes", method: "GET" };

