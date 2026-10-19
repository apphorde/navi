import http from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createFilesystem, FsError } from "./filesystem.js";
import { openDatabase } from "./db.js";
import { createSessions, parseCookies } from "./session.js";
import { createAi, streamWords } from "./ai.js";
import { requestOrigin } from "./origin.js";
import * as oidc from "openid-client";

const port = Number(process.env.PORT || 3000);
const dataRoot = process.env.DATA_ROOT || "/home/app/data";
const naviRoot = process.env.NAVI_ROOT || "/home/app/navi";
const authProvider = process.env.AUTH_PROVIDER;
if (!authProvider || !process.env.OIDC_CLIENT_ID || !process.env.OIDC_CLIENT_SECRET) {
  throw new Error("AUTH_PROVIDER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET are required");
}
const issuer = new URL(authProvider).href.replace(/\/$/, "");
const oidcConfig = await oidc.discovery(
  new URL(issuer),
  process.env.OIDC_CLIENT_ID,
  process.env.OIDC_CLIENT_SECRET,
  oidc.ClientSecretPost(),
);
const auth = await import(`${issuer}/node.mjs`).catch(async (error) => {
  if (error.code !== "ERR_UNSUPPORTED_ESM_URL_SCHEME") {
    throw error;
  }
  const response = await fetch(`${issuer}/node.mjs`);
  if (!response.ok) {
    throw new Error(`Could not load Auth API client: ${response.status}`);
  }
  return import(`data:text/javascript;base64,${Buffer.from(await response.text()).toString("base64")}`);
});
auth.createAuthClient({ issuer, clientId: process.env.OIDC_CLIENT_ID, clientSecret: process.env.OIDC_CLIENT_SECRET });
await mkdir(dataRoot, { recursive: true });
const database = await openDatabase(naviRoot);
const filesystem = createFilesystem(dataRoot);
const ai = createAi({
  baseURL: process.env.AI_BASE_URL,
  apiKey: process.env.AI_API_KEY,
  model: process.env.AI_MODEL,
  database,
});
const sessions = createSessions(process.env.SESSION_SECRET || "development-only-change-me");
const publicRoot = path.resolve(new URL("../public/", import.meta.url).pathname);

function origin(request) {
  return requestOrigin(request);
}
function send(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  response.end(body === undefined ? "" : JSON.stringify(body));
}
function errorResponse(response, error) {
  const status = error instanceof FsError ? error.status : error.status || 500;
  send(response, status, {
    error: error.code || "INTERNAL_ERROR",
    message: status === 500 ? "An internal error occurred" : error.message,
  });
}
function body(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 3_000_000) {
        reject(Object.assign(new Error("Request too large"), { status: 413 }));
      }
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}
async function userFor(request, response) {
  const session = sessions.read(parseCookies(request).navi_session);
  if (!session?.accessToken) {
    send(response, 401, { error: "UNAUTHENTICATED", message: "Authentication required" });
    return null;
  }
  try {
    const user = await oidc.fetchUserInfo(oidcConfig, session.accessToken, oidc.skipSubjectCheck);
    return { user, session };
  } catch {
    sessions.remove(session.id);
    send(response, 401, { error: "UNAUTHENTICATED", message: "Session expired" });
    return null;
  }
}
function routePath(url) {
  return decodeURIComponent(new URL(url, "http://navi").pathname);
}

async function api(request, response, pathname) {
  const authState = await userFor(request, response);
  if (!authState) {
    return;
  }
  const { user } = authState;
  try {
    if (request.method === "GET" && pathname === "/api/profile") {
      return send(response, 200, { ...user, authProvider: issuer });
    }
    if (request.method === "GET" && pathname === "/api/tree") {
      return send(response, 200, {
        path: new URL(request.url, "http://navi").searchParams.get("path") || ".",
        entries: await filesystem.list(new URL(request.url, "http://navi").searchParams.get("path") || "."),
      });
    }
    if (request.method === "GET" && pathname === "/api/file") {
      return send(
        response,
        200,
        await filesystem.read(new URL(request.url, "http://navi").searchParams.get("path"), {
          preview: new URL(request.url, "http://navi").searchParams.get("preview") === "true",
        }),
      );
    }
    if (request.method === "PUT" && pathname === "/api/file") {
      const input = await body(request);
      const result = await filesystem.write(input.path, input.content, input.version);
      database.audit(user, "write", input.path, "success");
      return send(response, 200, result);
    }
    if (request.method === "POST" && pathname === "/api/file") {
      const input = await body(request);
      const result = await filesystem.create(input.path, input.kind);
      database.audit(user, "create", input.path, "success");
      return send(response, 201, result);
    }
    if (request.method === "POST" && pathname === "/api/rename") {
      const input = await body(request);
      const result = await filesystem.rename(input.path, input.destination);
      database.audit(user, "rename", input.path, "success");
      return send(response, 200, result);
    }
    if (request.method === "GET" && pathname === "/api/ai/config") {
      return send(response, 200, { enabled: Boolean(ai), model: ai?.model || null });
    }
    if (request.method === "GET" && pathname === "/api/ai/prompt") {
      if (!ai) {
        return send(response, 404, { error: "AI_DISABLED" });
      }
      return send(response, 200, { prompt: ai.prompt() });
    }
    if (request.method === "PUT" && pathname === "/api/ai/prompt") {
      if (!ai) {
        return send(response, 404, { error: "AI_DISABLED" });
      }
      const input = await body(request);
      if (typeof input.prompt !== "string" || !input.prompt.trim()) {
        return send(response, 422, { error: "INVALID_PROMPT", message: "Prompt cannot be empty" });
      }
      ai.setPrompt(input.prompt);
      database.audit(user, "ai_prompt", null, "updated");
      return send(response, 200, { prompt: ai.prompt() });
    }
    if (request.method === "POST" && pathname === "/api/ai/chat") {
      if (!ai) {
        return send(response, 404, { error: "AI_DISABLED" });
      }
      const input = await body(request);
      if (!input.question || !input.file?.path || typeof input.file.content !== "string") {
        return send(response, 422, { error: "INVALID_REQUEST", message: "Question and selected file are required" });
      }
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      });
      try {
        const stream = await ai.complete(input);
        await streamWords(stream, (word) =>
          response.write(`event: text\ndata: ${word.replaceAll("\n", "\ndata: ")}\n\n`),
        );
        response.write("event: done\ndata: {}\n\n");
        database.audit(user, "ai_chat", input.file.path, "success");
      } catch {
        response.write(`event: error\ndata: ${JSON.stringify("AI request failed")}\n\n`);
        database.audit(user, "ai_chat", input.file.path, "failure");
      } finally {
        response.end();
      }
      return;
    }
    send(response, 404, { error: "NOT_FOUND", message: "API route not found" });
  } catch (error) {
    errorResponse(response, error);
  }
}

async function server(request, response) {
  const pathname = routePath(request.url);
  if (pathname === "/auth/login") {
    try {
      const requestOrigin = origin(request);
      const redirectUri = `${requestOrigin}/auth/callback`;
      const codeVerifier = oidc.randomPKCECodeVerifier();
      const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
      const stateValue = oidc.randomState();
      const state = sessions.issue({ codeVerifier, origin: requestOrigin, state: stateValue }, 600);
      const authorizationUrl = oidc.buildAuthorizationUrl(oidcConfig, {
        redirect_uri: redirectUri,
        scope: "openid profile email",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state: stateValue,
      });
      response.writeHead(302, {
        location: authorizationUrl.href,
        "set-cookie": `navi_login=${state.value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
      });
      response.end();
    } catch (error) {
      errorResponse(response, error);
    }
    return;
  }
  if (pathname === "/auth/callback") {
    const login = sessions.read(parseCookies(request).navi_login);
    if (!login) {
      return send(response, 400, { error: "INVALID_STATE", message: "Invalid login state" });
    }
    try {
      const callbackUrl = new URL(request.url, origin(request));
      const tokens = await oidc.authorizationCodeGrant(oidcConfig, callbackUrl, {
        pkceCodeVerifier: login.codeVerifier,
        expectedState: login.state,
      });
      if (!tokens.access_token) {
        throw new Error("Token response did not contain an access token");
      }
      const session = sessions.issue(
        { accessToken: tokens.access_token, idToken: tokens.id_token, refreshToken: tokens.refresh_token },
        86400,
      );
      sessions.remove(login.id);
      response.writeHead(302, {
        location: "/",
        "set-cookie": [
          `navi_session=${session.value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`,
          "navi_login=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/",
        ],
      });
      response.end();
    } catch (error) {
      errorResponse(response, error);
    }
    return;
  }
  if (pathname === "/auth/logout") {
    const session = sessions.read(parseCookies(request).navi_session);
    if (session) {
      sessions.remove(session.id);
    }
    const logoutUrl = oidc.buildEndSessionUrl(oidcConfig, {
      id_token_hint: session?.idToken,
      post_logout_redirect_uri: `${origin(request)}/`,
    });
    response.writeHead(302, {
      location: logoutUrl.href,
      "set-cookie": "navi_session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/",
    });
    response.end();
    return;
  }
  if (pathname.startsWith("/api/")) {
    return api(request, response, pathname);
  }
  if (pathname === "/" || pathname === "/index.html") {
    const session = sessions.read(parseCookies(request).navi_session);
    if (!session?.accessToken) {
      response.writeHead(302, { location: "/auth/login" });
      response.end();
      return;
    }
    try {
      await oidc.fetchUserInfo(oidcConfig, session.accessToken, oidc.skipSubjectCheck);
    } catch {
      response.writeHead(302, {
        location: "/auth/login",
        "set-cookie": "navi_session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/",
      });
      response.end();
      return;
    }
  }
  const file = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  if (file.includes("..")) {
    return send(response, 403, { error: "FORBIDDEN" });
  }
  try {
    const content = await readFile(path.join(publicRoot, file));
    response.writeHead(200, {
      "content-type": file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html",
    });
    response.end(content);
  } catch {
    send(response, 404, { error: "NOT_FOUND" });
  }
}

http
  .createServer((request, response) => server(request, response).catch((error) => errorResponse(response, error)))
  .listen(port, () => console.log(`Navi listening on ${port}`));
