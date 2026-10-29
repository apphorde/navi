import { sanitizeWorkspacePath } from "./workspace-path.js";

export function createShareUrl(currentUrl, workspacePath) {
  const path = sanitizeWorkspacePath(workspacePath);
  if (!path) {
    throw new TypeError("Invalid workspace path");
  }

  const url = new URL(currentUrl);
  url.searchParams.set("p", `/${path}`);
  return url.href;
}
