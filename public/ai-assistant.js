import { defineProp, ref, templateRef } from "@li3/web";
import { parseSseEvent } from "./ai-stream.js";

export default function () {
  const file = defineProp("file");
  const input = templateRef("input");
  const answer = ref("");
  let activeController;

  async function ask() {
    const question = input.value.value.trim();
    if (!file.value || !question) {
      return;
    }
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const filePath = file.value.path;
    const isCurrent = () => activeController === controller && file.value?.path === filePath;
    answer.value = "";
    input.value.value = "";
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, file: file.value }),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (isCurrent()) {
          answer.value = "The assistant request failed.";
        }
        return;
      }
      if (!response.body) {
        throw new Error("The assistant response had no body");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const part = await reader.read();
        if (part.done) {
          break;
        }
        if (!isCurrent()) {
          controller.abort();
          return;
        }
        buffer += decoder.decode(part.value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop();
        for (const event of events) {
          const parsed = parseSseEvent(event);
          if (parsed.type === "text") {
            answer.value += parsed.data;
          } else if (parsed.type === "error") {
            answer.value += "\nThe assistant encountered an error.";
          }
        }
      }
      buffer += decoder.decode();
      if (buffer && isCurrent()) {
        const parsed = parseSseEvent(buffer);
        if (parsed.type === "text") {
          answer.value += parsed.data;
        } else if (parsed.type === "error") {
          answer.value += "\nThe assistant encountered an error.";
        }
      }
    } catch (error) {
      if (error.name !== "AbortError" && isCurrent()) {
        answer.value = "The assistant request failed.";
      }
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
    }
  }

  function key(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      ask();
    }
  }

  return { file, input, answer, ask, key };
}
