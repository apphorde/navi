import { defineProp, defineEvent } from '@li3/web';
export default function () { const value = defineProp('value', { default: '' }); const onSave = defineEvent('save'); function update(event) { value.value = event.target.value; } function save() { onSave(value.value); } return { value, update, save }; }
