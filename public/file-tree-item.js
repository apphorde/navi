import { defineProp, defineEvent } from '@li3/web';
export default function () { const item = defineProp('item', { default: () => ({}) }); const onSelect = defineEvent('select'); function select() { onSelect(item.value); } return { item, select }; }
