import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const sharp=createRequire(import.meta.url)(process.argv[2]||'sharp');
const sprite=readFileSync('public/workspace-art.svg','utf8');
const defs=sprite.match(/<defs>([\s\S]*?)<\/defs>/)[1];
const symbols=new Map([...sprite.matchAll(/<symbol id="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g)].map(match=>[match[1],match[2]]));
const tiles=[['manga','Manga library'],['today','Today'],['entertainment','Entertainment'],['mirror','Mirror'],['football','Sport'],['weather','Weather'],['calendar','Calendar'],['notes','Notes'],['schoolbooks','Schoolbooks'],['news','News'],['bible','Bible'],['briefing','Briefing'],['music','Music'],['transfers','Transfers']];
const cells=tiles.map(([key,label],i)=>{
 const x=44+(i%4)*230,y=110+Math.floor(i/4)*230;
 return `<rect x="${x}" y="${y}" width="212" height="212" rx="22" fill="#202637" stroke="#ffffff16"/><g transform="translate(${x+5} ${y+11}) scale(.84)">${symbols.get(key)}</g><text x="${x+17}" y="${y+190}" fill="#dce3ed" font-family="sans-serif" font-size="14">${label}</text>`;
}).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1050"><defs>${defs}</defs><rect width="1000" height="1050" fill="#151923"/><text x="44" y="51" fill="#e5eaf2" font-family="sans-serif" font-size="22" letter-spacing="2">COMMAND CENTRE</text><text x="44" y="78" fill="#939fb2" font-family="sans-serif" font-size="13">Material icon set · original vector artwork</text>${cells}</svg>`;
writeFileSync('artifacts/v10.33.3-icons.svg',svg);
await sharp(Buffer.from(svg)).png().toFile('artifacts/v10.33.3-icons.png');
console.log('Rendered artwork preview: artifacts/v10.33.3-icons.png');
