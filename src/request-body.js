export const MAX_REQUEST_BODY_BYTES = 3_000_000;

export function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const contentLength = Number(request.headers?.["content-length"]);
    let receivedBytes = 0;
    let settled = false;

    function fail(error) {
      if (!settled) {
        settled = true;
        reject(error);
      }
    }

    request.on("error", fail);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
      fail(Object.assign(new Error("Request too large"), { status: 413 }));
      request.resume();
      return;
    }

    function onData(chunk) {
      if (settled) {
        return;
      }
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      receivedBytes += buffer.byteLength;
      if (receivedBytes > MAX_REQUEST_BODY_BYTES) {
        chunks.length = 0;
        fail(Object.assign(new Error("Request too large"), { status: 413 }));
        request.removeListener("data", onData);
        request.resume();
        return;
      }
      chunks.push(buffer);
    }

    request.on("data", onData);
    request.on("end", () => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        const data = Buffer.concat(chunks).toString("utf8");
        const value = data ? JSON.parse(data) : {};
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("Invalid JSON body");
        }
        resolve(value);
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
  });
}
