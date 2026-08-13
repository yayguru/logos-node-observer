import { handleError, json, readJson } from "../lib/http.mjs";
import { createNodeCredentials, hashToken } from "../lib/security.mjs";
import { createRegistry } from "../lib/storage.mjs";
import { normalizeRegistration } from "../lib/validate.mjs";

export default async (request) => {
  try {
    const registration = normalizeRegistration(await readJson(request, 2_048));
    const { nodeId, token } = createNodeCredentials();
    const createdAt = new Date().toISOString();

    await createRegistry({
      nodeId,
      tokenHash: hashToken(token),
      displayName: registration.displayName,
      visibility: registration.visibility,
      createdAt,
    });

    const origin = new URL(request.url).origin;
    return json(
      {
        nodeId,
        token,
        displayName: registration.displayName,
        visibility: registration.visibility,
        ingestUrl: `${origin}/api/ingest`,
        dashboardUrl: `${origin}/#/node/${nodeId}`,
        warning: "This write token is shown once. Store it only on the node.",
      },
      201,
    );
  } catch (cause) {
    return handleError(cause);
  }
};

export const config = {
  path: "/api/register",
  method: "POST",
  rateLimit: {
    windowLimit: 3,
    windowSize: 3_600,
    aggregateBy: ["ip", "domain"],
  },
};

