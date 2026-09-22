import { defineProp } from '@li3/web';
export default function () { const items = defineProp('items', { default: () => [] }); const open = defineProp('open', { default: false }); const pinned = defineProp('pinned', { default: true }); const user = defineProp('user', { default: null }); return { items, open, pinned, user }; }
