import {transform} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
const files=['schoolbook-practice-core.js','practice-lesson.js','schoolbook-practice.js'];
const result=await transform(files.map(file=>readFileSync('public/'+file,'utf8')).join('\n'),{format:'iife',target:['safari16','chrome110','edge110'],minify:true});
writeFileSync('public/schoolbook-practice.bundle.js',result.code);
writeFileSync('public/schoolbook-practice.bundle.css',readFileSync('public/schoolbook-practice.css','utf8'));
console.log('Practice browser bundle and styles built.');
