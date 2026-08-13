import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createNodeCredentials() {
  return {
    nodeId: `node_${randomBytes(9).toString("base64url")}`,
    token: `lno_${randomBytes(32).toString("base64url")}`,
  };
}

export function hashToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokenMatches(token, expectedHash) {
  if (typeof token !== "string" || typeof expectedHash !== "string") {
    return false;
  }

  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function bearerToken(request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

