import { defineProp, defineEvent } from '@li3/web';
export default function () {
  const items = defineProp('items', { default: () => [] }); const open = defineProp('open', { default: false }); const pinned = defineProp('pinned', { default: true }); const user = defineProp('user', { default: null }); const onSelect = defineEvent('select');
  function find(list, path) { for (const item of list || []) { if (item.path === path) return item; const match = find(item.children, path); if (match) return match; } return null; }
  function selectItem(event) { const host = event.target.closest('file-tree-item'); const path = host?.dataset.path; const item = path ? find(items.value, path) : null; if (item) onSelect(item); }
  return { items, open, pinned, user, selectItem };
}
