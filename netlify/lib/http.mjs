const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}

export async function readJson(request, maxBytes = 32_768) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) {
    throw new RequestError("Request body is too large.", 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RequestError("Request body is too large.", 413);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new RequestError("Request body must be valid JSON.", 400);
  }
}

export class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

export function handleError(cause) {
  if (cause instanceof RequestError) {
    return error(cause.message, cause.status);
  }

  console.error(cause);
  return error("The service could not complete this request.", 500);
}

