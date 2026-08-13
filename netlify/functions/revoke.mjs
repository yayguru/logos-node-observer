import { bearerToken, tokenMatches } from "../lib/security.mjs";
import { error, handleError, json } from "../lib/http.mjs";
import { deleteNode, getRegistry } from "../lib/storage.mjs";
import { validateNodeId } from "../lib/validate.mjs";

export default async (request) => {
  try {
    const nodeId = validateNodeId(new URL(request.url).searchParams.get("id"));
    const registry = await getRegistry(nodeId);
    if (!registry || !tokenMatches(bearerToken(request), registry.tokenHash)) {
      return error("Invalid node credentials.", 401);
    }

    await deleteNode(nodeId);
    return json({ revoked: true, nodeId });
  } catch (cause) {
    return handleError(cause);
  }
};

export const config = {
  path: "/api/revoke",
  method: "DELETE",
  rateLimit: {
    windowLimit: 6,
    windowSize: 3_600,
    aggregateBy: ["ip", "domain"],
  },
};
