const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeMethod(method) {
  return safeMethods.has(method);
}

export function mutationRequestError(request, expectedOrigin) {
  if (isSafeMethod(request.method)) {
    return null;
  }
  if (request.headers.origin !== expectedOrigin) {
    return { status: 403, error: "INVALID_ORIGIN", message: "Cross-origin API requests are not allowed" };
  }
  if (
    String(request.headers["content-type"] || "")
      .split(";")[0]
      .trim()
      .toLowerCase() !== "application/json"
  ) {
    return { status: 415, error: "UNSUPPORTED_MEDIA_TYPE", message: "Requests must use JSON" };
  }
  return null;
}
