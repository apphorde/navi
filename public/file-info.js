import { defineProp, ref } from "@li3/web";
import { createShareUrl } from "./share-url.js";

export default function () {
  const file = defineProp("file");
  const clipboardStatus = ref("");

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      clipboardStatus.value = `${label} copied`;
    } catch {
      clipboardStatus.value = "Clipboard unavailable";
    }
  }

  function copy() {
    return copyText(file.value.path, "Path");
  }

  function share() {
    try {
      return copyText(createShareUrl(window.location.href, file.value.path), "Share URL");
    } catch {
      clipboardStatus.value = "Unable to create share URL";
    }
  }

  return { file, clipboardStatus, copy, share };
}
