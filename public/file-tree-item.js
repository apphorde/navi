import { defineProp, getElement } from '@li3/web';
export default function () {
  const item = defineProp('item', { default: () => ({}) });
  function select() {
    const host = getElement();
    const value = item.value?.path ? item.value : { path: host.dataset.path, type: host.dataset.type, name: host.dataset.name, depth: Number(host.dataset.depth || 0), open: host.dataset.open === 'true', children: [] };
    if (!value?.path) return;
    getElement().dispatchEvent(new CustomEvent('tree-select', { bubbles: true, composed: true, detail: value }));
  }
  return { item, select };
}
