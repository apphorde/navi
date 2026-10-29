export function editorContent(event) {
  const change = event?.detail?.detail ?? event?.detail ?? event;
  return typeof change === "string" ? change : change?.content;
}
