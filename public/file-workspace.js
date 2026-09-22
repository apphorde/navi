import { defineProp } from '@li3/web';
export default function () { return { file: defineProp('file'), mode: defineProp('mode', { default: 'editor' }) }; }
