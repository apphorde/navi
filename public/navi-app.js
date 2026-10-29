import { ref, onInit } from "@li3/web";
import { editorContent } from "./editor-content.js";
import { sanitizeWorkspacePath } from "./workspace-path.js";

export default function () {
  const items = ref([]);
  const selected = ref(null);
  const mode = ref("editor");
  const navOpen = ref(false);
  const navPinned = ref(true);
  const infoPinned = ref(true);
  const user = ref(null);
  const saveStatus = ref("Ready");
  const aiEnabled = ref(false);
  const promptOpen = ref(false);
  const prompt = ref("");
  const saveTimers = new Map();
  const saveChains = new Map();
  const saveSequences = new Map();
  const latestContent = new Map();
  const expectedVersions = new Map();
  const dirtyPaths = new Set();
  let selectedRequest = 0;
  let navCloseTimer;
  let infoCloseTimer;
  const treeRequests = new Map();
  const request = async (url, options) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(data.message || data.error || "Request failed"), {
        code: data.error,
        status: response.status,
      });
    }
    return data;
  };
  async function loadTree() {
    try {
      const data = await request("/api/tree?path=.");
      for (const path of treeRequests.keys()) {
        treeRequests.set(path, treeRequests.get(path) + 1);
      }
      items.value = data.entries.map((item) => ({ ...item, depth: 0, open: false, loaded: false, children: [] }));
    } catch (error) {
      saveStatus.value = error.message;
    }
  }
  function updateTree(list, targetPath, update) {
    return list.map((entry) =>
      entry.path === targetPath
        ? update(entry)
        : { ...entry, children: entry.children ? updateTree(entry.children, targetPath, update) : entry.children },
    );
  }
  async function select(event) {
    const item = event?.detail || event;
    if (!item?.path || !item.type) {
      saveStatus.value = "Invalid tree item";
      return;
    }
    const requestId = ++selectedRequest;
    if (item.type === "directory") {
      const current = findTree(items.value, item.path);
      if (!current) {
        return;
      }
      if (current.open) {
        treeRequests.set(item.path, (treeRequests.get(item.path) || 0) + 1);
        items.value = updateTree(items.value, item.path, (entry) => ({ ...entry, open: false }));
      } else if (current.loaded) {
        items.value = updateTree(items.value, item.path, (entry) => ({ ...entry, open: true }));
      } else {
        const requestId = (treeRequests.get(item.path) || 0) + 1;
        treeRequests.set(item.path, requestId);
        items.value = updateTree(items.value, item.path, (entry) => ({ ...entry, open: true }));
        try {
          const data = await request(`/api/tree?path=${encodeURIComponent(item.path)}`);
          if (treeRequests.get(item.path) !== requestId || !findTree(items.value, item.path)?.open) {
            return;
          }
          const depth = current.depth || 0;
          const children = data.entries.map((child) => ({
            ...child,
            depth: depth + 1,
            open: false,
            loaded: false,
            children: [],
          }));
          items.value = updateTree(items.value, item.path, (entry) => ({ ...entry, children, loaded: true }));
        } catch (error) {
          if (treeRequests.get(item.path) === requestId) {
            items.value = updateTree(items.value, item.path, (entry) => ({ ...entry, open: false }));
            saveStatus.value = error.message;
          }
        }
      }
      return;
    }
    treeRequests.set(item.path, (treeRequests.get(item.path) || 0) + 1);
    try {
      const file = await request(`/api/file?path=${encodeURIComponent(item.path)}`);
      if (requestId !== selectedRequest) {
        return;
      }
      if (dirtyPaths.has(item.path)) {
        file.content = latestContent.get(item.path) ?? file.content;
        file.version = expectedVersions.get(item.path) ?? file.version;
      } else {
        latestContent.set(item.path, file.content);
      }
      selected.value = file;
      clearTimeout(navCloseTimer);
      navOpen.value = false;
      saveStatus.value = dirtyPaths.has(item.path) ? "Unsaved" : "Saved";
    } catch (error) {
      if (requestId === selectedRequest) {
        saveStatus.value = error.message;
      }
    }
  }
  function findTree(list, targetPath) {
    for (const entry of list || []) {
      if (entry.path === targetPath) {
        return entry;
      }
      const nested = findTree(entry.children, targetPath);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
  async function save(event) {
    if (!selected.value) {
      return;
    }
    const content = editorContent(event);
    if (content === undefined) {
      return;
    }
    const path = selected.value.path;
    const file = selected.value;
    if (!dirtyPaths.has(path)) {
      expectedVersions.set(path, file.version);
    }
    const sequence = (saveSequences.get(path) || 0) + 1;
    saveSequences.set(path, sequence);
    latestContent.set(path, content);
    dirtyPaths.add(path);
    saveStatus.value = "Unsaved";
    clearTimeout(saveTimers.get(path));
    const timer = setTimeout(() => {
      if (saveTimers.get(path) === timer) {
        saveTimers.delete(path);
      }
      const previousSave = saveChains.get(path) || Promise.resolve();
      const saving = previousSave
        .catch(() => {})
        .then(async () => {
          if (!dirtyPaths.has(path) || latestContent.get(path) !== content) {
            if (!dirtyPaths.has(path) && selected.value?.path === path && saveSequences.get(path) === sequence) {
              saveStatus.value = "Saved";
            }
            return;
          }
          if (selected.value?.path === path && saveSequences.get(path) === sequence) {
            saveStatus.value = "Saving…";
          }
          try {
            const current = selected.value?.path === path ? selected.value : null;
            const result = await request("/api/file", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                path,
                content,
                version: expectedVersions.get(path) ?? current?.version ?? file.version,
              }),
            });
            const currentContent = latestContent.get(path);
            if (currentContent === content) {
              dirtyPaths.delete(path);
              expectedVersions.delete(path);
              latestContent.set(path, result.content);
              if (selected.value?.path === path) {
                selected.value = result;
              }
            } else {
              expectedVersions.set(path, result.version);
              if (selected.value?.path === path) {
                selected.value = { ...selected.value, ...result, content: currentContent };
              }
            }
            if (selected.value?.path === path && saveSequences.get(path) === sequence) {
              saveStatus.value = dirtyPaths.has(path) ? "Unsaved" : "Saved";
            }
          } catch (error) {
            if (selected.value?.path === path && saveSequences.get(path) === sequence) {
              saveStatus.value = error.message;
            }
          }
        });
      saveChains.set(path, saving);
      const clearChain = () => {
        if (saveChains.get(path) === saving) {
          saveChains.delete(path);
        }
      };
      saving.then(clearChain, clearChain);
    }, 500);
    saveTimers.set(path, timer);
  }
  async function showPrompt() {
    try {
      prompt.value = (await request("/api/ai/prompt")).prompt;
      promptOpen.value = true;
    } catch (error) {
      saveStatus.value = error.message;
    }
  }
  async function savePrompt(event) {
    try {
      prompt.value = (
        await request("/api/ai/prompt", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: event.detail || event }),
        })
      ).prompt;
      promptOpen.value = false;
    } catch (error) {
      saveStatus.value = error.message;
    }
  }
  onInit(async () => {
    try {
      user.value = await request("/api/profile");
      aiEnabled.value = (await request("/api/ai/config")).enabled;
      await loadTree();
      const requestedPath = new URL(window.location.href).searchParams.get("p");
      const path = sanitizeWorkspacePath(requestedPath);
      if (requestedPath && !path) {
        saveStatus.value = "Invalid file path in URL";
      } else if (path) {
        mode.value = "editor";
        await select({ path, type: "file" });
      }
    } catch (error) {
      saveStatus.value = error.message;
    }
  });
  function openNav() {
    navOpen.value = true;
    clearTimeout(navCloseTimer);
    if (!navPinned.value) {
      navCloseTimer = setTimeout(() => (navOpen.value = false), 2000);
    }
  }
  function closeNav() {
    clearTimeout(navCloseTimer);
    navOpen.value = false;
  }
  function openInfo() {
    infoPinned.value = false;
    clearTimeout(infoCloseTimer);
    infoCloseTimer = setTimeout(() => (infoPinned.value = true), 2000);
  }
  function toggleNavPin() {
    navPinned.value = !navPinned.value;
    if (!navPinned.value) {
      openNav();
    } else {
      closeNav();
    }
  }
  function toggleInfoPin() {
    infoPinned.value = !infoPinned.value;
    if (infoPinned.value) {
      clearTimeout(infoCloseTimer);
    }
  }
  return {
    items,
    selected,
    mode,
    navOpen,
    navPinned,
    infoPinned,
    user,
    saveStatus,
    aiEnabled,
    promptOpen,
    prompt,
    loadTree,
    select,
    save,
    showPrompt,
    savePrompt,
    setMode: (value) => (mode.value = value),
    openNav,
    closeNav,
    openInfo,
    toggleNavPin,
    toggleInfoPin,
    closePrompt: () => (promptOpen.value = false),
    newFile: async () => {
      const name = window.prompt("New file name");
      if (!name) {
        return;
      }
      try {
        await request("/api/file", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: name, kind: "file" }),
        });
        await loadTree();
      } catch (error) {
        saveStatus.value = error.message;
      }
    },
  };
}
