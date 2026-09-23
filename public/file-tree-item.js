import { defineProp, defineEvent } from '@li3/web';
export default function () {
  const item = defineProp('item', { default: () => ({}) });
  const onTreeSelect = defineEvent('tree-select');
  function select() {
    const value = item.value;
    if (!value?.path) return;
    onTreeSelect(value, { bubbles: true, composed: true });
  }
  return { item, select };
}
