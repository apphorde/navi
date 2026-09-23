import { ref, onInit } from '@li3/web';

export default function () {
  const items = ref([]); const selected = ref(null); const mode = ref('editor'); const navOpen = ref(false); const navPinned = ref(true); const infoPinned = ref(true); const user = ref(null); const saveStatus = ref('Ready'); const aiEnabled = ref(false); const promptOpen = ref(false); const prompt = ref(''); let saveTimer; let navCloseTimer; let infoCloseTimer; let lastTreeSelection = ''; let lastTreeSelectionAt = 0;
  const request = async (url, options) => { const response = await fetch(url, options); const data = await response.json().catch(() => ({})); if (!response.ok) throw Object.assign(new Error(data.message || data.error || 'Request failed'), { code: data.error, status: response.status }); return data; };
  async function loadTree() { try { const data = await request('/api/tree?path=.'); items.value = data.entries.map((item) => ({ ...item, depth: 0, open: false, children: [] })); } catch (error) { saveStatus.value = error.message; } }
  function updateTree(list, targetPath, update) { return list.map((entry) => entry.path === targetPath ? update(entry) : { ...entry, children: entry.children?.length ? updateTree(entry.children, targetPath, update) : entry.children }); }
  async function select(event) {
    const item = event?.detail || event;
    if (!item?.path || !item.type) { saveStatus.value = 'Invalid tree item'; return; }
    const now = Date.now();
    if (item.path === lastTreeSelection && now - lastTreeSelectionAt < 100) return;
    lastTreeSelection = item.path; lastTreeSelectionAt = now;
    if (item.type === 'directory') {
      const current = item.open ? item : findTree(items.value, item.path);
      if (!current?.open) {
        try {
          const data = await request(`/api/tree?path=${encodeURIComponent(item.path)}`);
          const children = data.entries.map((child) => ({ ...child, depth: (item.depth || 0) + 1, open: false, children: [] }));
          items.value = updateTree(items.value, item.path, (entry) => ({ ...entry, children, open: true }));
        } catch (error) { saveStatus.value = error.message; }
      } else items.value = updateTree(items.value, item.path, (entry) => ({ ...entry, open: false }));
      return;
    }
    try { selected.value = await request(`/api/file?path=${encodeURIComponent(item.path)}`); clearTimeout(navCloseTimer); navOpen.value = false; saveStatus.value = 'Saved'; } catch (error) { saveStatus.value = error.message; }
  }
  function findTree(list, targetPath) { for (const entry of list || []) { if (entry.path === targetPath) return entry; const nested = findTree(entry.children, targetPath); if (nested) return nested; } return null; }
  async function save(event) { const change = event.detail || event; if (!selected.value) return; const content = typeof change === 'string' ? change : change.content; if (content === undefined) return; saveStatus.value = 'Unsaved'; clearTimeout(saveTimer); saveTimer = setTimeout(async () => { saveStatus.value = 'Saving…'; try { selected.value = await request('/api/file', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: selected.value.path, content, version: selected.value.version }) }); saveStatus.value = 'Saved'; } catch (error) { saveStatus.value = error.message; } }, 500); }
  async function showPrompt() { try { prompt.value = (await request('/api/ai/prompt')).prompt; promptOpen.value = true; } catch (error) { saveStatus.value = error.message; } }
  async function savePrompt(event) { try { prompt.value = (await request('/api/ai/prompt', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: event.detail || event }) })).prompt; promptOpen.value = false; } catch (error) { saveStatus.value = error.message; } }
  onInit(async () => { try { user.value = await request('/api/profile'); aiEnabled.value = (await request('/api/ai/config')).enabled; await loadTree(); } catch (error) { saveStatus.value = error.message; } });
  function openNav() { navOpen.value = true; clearTimeout(navCloseTimer); if (!navPinned.value) navCloseTimer = setTimeout(() => (navOpen.value = false), 2000); }
  function closeNav() { clearTimeout(navCloseTimer); navOpen.value = false; }
  function openInfo() { infoPinned.value = false; clearTimeout(infoCloseTimer); infoCloseTimer = setTimeout(() => (infoPinned.value = true), 2000); }
  function toggleNavPin() { navPinned.value = !navPinned.value; if (!navPinned.value) openNav(); else closeNav(); }
  function toggleInfoPin() { infoPinned.value = !infoPinned.value; if (infoPinned.value) clearTimeout(infoCloseTimer); }
  return { items, selected, mode, navOpen, navPinned, infoPinned, user, saveStatus, aiEnabled, promptOpen, prompt, loadTree, select, save, showPrompt, savePrompt, setMode: (value) => (mode.value = value), openNav, closeNav, openInfo, toggleNavPin, toggleInfoPin, closePrompt: () => (promptOpen.value = false), newFile: async () => { const name = window.prompt('New file name'); if (!name) return; try { await request('/api/file', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: name, kind: 'file' }) }); await loadTree(); } catch (error) { saveStatus.value = error.message; } } };
}
