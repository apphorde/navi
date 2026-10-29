export function sanitizeWorkspacePath(input) {
  if (typeof input !== "string" || input.length > 4096 || input.includes("\0") || input.includes("\\")) {
    return null;
  }

  const segments = input.split("/");
  if (segments.some((segment) => segment === "..")) {
    return null;
  }

  const relative = segments.filter((segment) => segment && segment !== ".").join("/");
  return relative || null;
}
