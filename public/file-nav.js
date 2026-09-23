import { defineProp, defineEvent } from '@li3/web';
export default function () {
  const items = defineProp('items', { default: () => [] }); const open = defineProp('open', { default: false }); const pinned = defineProp('pinned', { default: true }); const user = defineProp('user', { default: null }); const onSelect = defineEvent('select');
  function forward(event) { if (event.detail?.path) onSelect(event.detail); }
  return { items, open, pinned, user, forward };
}
