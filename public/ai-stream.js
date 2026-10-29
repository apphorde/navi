export function parseSseEvent(event) {
  const lines = event.split(/\r?\n/);
  const type = lines
    .find((line) => line.startsWith("event:"))
    ?.slice(6)
    .trim();
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  return { type, data };
}
