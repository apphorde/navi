import { defineProp } from '@li3/web';
export default function () { const file = defineProp('file'); function copy() { navigator.clipboard?.writeText(file.value.path); } return { file, copy }; }
