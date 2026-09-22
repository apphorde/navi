import { defineProp, defineEvent } from '@li3/web';
export default function () { const file = defineProp('file'); const onChange = defineEvent('change'); function change(event) { const detail = event.detail ?? event.target?.value ?? event; onChange(typeof detail === 'string' ? detail : { content: detail.value ?? detail.content }); } return { file, change }; }
