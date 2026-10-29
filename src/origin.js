export function requestOrigin(request, { trustProxy = false } = {}) {
  let forwardedValues = {};
  if (trustProxy) {
    const forwarded = String(request.headers.forwarded || "").split(",")[0];
    forwardedValues = Object.fromEntries(
      forwarded
        .split(";")
        .map((part) => {
          const [key, ...rest] = part.trim().split("=");
          return [key?.toLowerCase(), rest.join("=").replace(/^"|"$/g, "")];
        })
        .filter(([key, value]) => key && value),
    );
  }
  const protocol = trustProxy
    ? forwardedValues.proto ||
      String(request.headers["x-forwarded-proto"] || "")
        .split(",")[0]
        .trim() ||
      (request.socket?.encrypted ? "https" : "http")
    : request.socket?.encrypted
      ? "https"
      : "http";
  const host = trustProxy
    ? forwardedValues.host ||
      String(request.headers["x-forwarded-host"] || "")
        .split(",")[0]
        .trim() ||
      request.headers.host
    : request.headers.host;
  if (!host || !["http", "https"].includes(protocol) || /[\s/\\]/.test(host)) {
    throw new Error("Invalid request origin");
  }
  try {
    const parsed = new URL(`${protocol}://${host}`);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("Invalid request origin");
    }
    return parsed.origin;
  } catch {
    throw new Error("Invalid request origin");
  }
}
