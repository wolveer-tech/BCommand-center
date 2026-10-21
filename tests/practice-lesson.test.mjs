import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';

const context=vm.createContext({window:{crypto:webcrypto}});
for(const file of ['schoolbook-practice-core.js','practice-lesson.js'])vm.runInContext(readFileSync('public/'+file,'utf8'),context);
const core=context.window.CommandCentrePracticeCore,lesson=context.window.CommandCentrePracticeLesson;
const transcript='00:10 Water moves from a dilute solution to a concentrated solution through a partially permeable membrane. This is osmosis. 00:40 Animal cells may swell and burst in a dilute solution.';
const picture=(id,selected=true)=>({id,url:'data:image/png;base64,AA==',caption:'00:40 · Animal cell diagram',selected});
const draft=(extra={})=>({id:'my-lesson',title:'Osmosis lesson',transcript,pictures:[],...extra});

test('lesson practice accepts transcripts without a schoolbook and preserves timestamped evidence',()=>{
  const raw=draft(),source=lesson.source(raw),request=core.generation(source);
  assert.equal(source.kind,'lesson');assert.equal(source.bookId,'lesson:my-lesson');assert.equal(source.title,raw.title);assert.equal(source.pages[0].text,transcript);
  assert.equal(JSON.parse(request.parts[0].text).sourceKind,'lesson');assert.equal(JSON.parse(request.parts[1].text).notes,transcript);
  assert.match(request.system,/untrusted/);assert.match(request.system,/transcript/);assert.match(request.system,/pictures/);
  assert.deepEqual(raw,draft(),'building a lesson request does not modify the draft');
});
test('only selected pictures enter a lesson request; the photo switch excludes their captions too',()=>{
  const raw=draft({pictures:[picture('included'),{...picture('excluded',false),caption:'PRIVATE_EXCLUDED_IMAGE_CAPTION',url:'data:image/png;base64,QkJC'}]}),source=lesson.source(raw),request=core.generation(source);
  assert.equal(source.imageCount,1);assert.equal(source.pages[1].id,'included');assert.equal(source.pages[1].number,2);assert.equal(source.pages[1].text,raw.pictures[0].caption);
  assert.equal(request.parts.at(-1).type,'image_url');assert.ok(!JSON.stringify(request).includes('PRIVATE_EXCLUDED_IMAGE_CAPTION'));assert.ok(!JSON.stringify(request).includes('QkJC'));
  const textOnly=lesson.source(raw,false);assert.equal(textOnly.imageCount,0);assert.equal(textOnly.pages.length,1);assert.ok(!JSON.stringify(core.generation(textOnly)).includes('Animal cell diagram'));
});
test('picture-only lessons are supported, while empty and excluded-only sources fail before an AI request',()=>{
  const raw=draft({transcript:'',pictures:[picture('diagram')]});assert.equal(lesson.source(raw).imageCount,1);assert.equal(lesson.source(raw).pages[0].number,1);
  assert.throws(()=>lesson.source(raw,false),/60 characters/);assert.throws(()=>lesson.source(draft({transcript:'',pictures:[picture('unselected',false)]})),/60 characters/);
  assert.throws(()=>lesson.source(draft({transcript:'Too brief'})),/60 characters/);
});
test('long transcripts split without silently losing content, and oversized drafts stay intact for editing',()=>{
  const raw=draft({transcript:(transcript+'\n').repeat(180)}),source=lesson.source(raw);
  assert.ok(source.pages.length>1);assert.ok(source.pages.every(p=>p.text.length<=6000));
  assert.equal(source.pages.map(p=>p.text).join(' ').replace(/\s+/g,' ').trim(),raw.transcript.replace(/\s+/g,' ').trim());
  const huge=draft({transcript:'x'.repeat(48001)});assert.equal(lesson.normalise(huge).transcript.length,48001);assert.throws(()=>lesson.source(huge),/draft has not been cut/);assert.equal(huge.transcript.length,48001);
});
test('remote pictures, SVG and oversized image collections cannot enter a lesson draft',()=>{
  for(const url of ['https://private.example/image.png','javascript:alert(1)','data:image/svg+xml;base64,AA=='])assert.throws(()=>lesson.normalise(draft({pictures:[{...picture('bad'),url}]})),/could not be opened/);
  assert.throws(()=>lesson.normalise(draft({pictures:Array.from({length:13},(_,i)=>picture('p'+i))})),/could not be opened/);
  assert.throws(()=>lesson.normalise(draft({pictures:[{...picture('large'),url:'data:image/png;base64,'+'A'.repeat(12*1024*1024)}]})),/12 MB/);
});
test('unsupported and oversized uploads are rejected before image decoding',async()=>{
  await assert.rejects(lesson.readImage({type:'image/svg+xml',size:20}),/PNG, JPEG/);
  await assert.rejects(lesson.readImage({type:'image/png',size:21*1024*1024}),/20 MB/);
});
test('transcript citations must match actual selected text, while picture evidence stays tied to the selected picture',()=>{
  const selected=lesson.source(draft({pictures:[picture('diagram')]})),q={type:'written',question:'Explain the movement of water through the cell membrane.',difficulty:3,points:['Direction','Membrane'],modelAnswer:'Water moves from dilute to concentrated through a partially permeable membrane.',hint:'Compare the concentrations.',sources:[{page:1,quote:'Water moves from a dilute solution'}]};
  assert.equal(core.questions({questions:[q]},selected,1).length,1);
  assert.throws(()=>core.questions({questions:[{...q,sources:[{page:1,quote:'A completely fabricated transcript quotation.'}]}]},selected,1),/supported/);
  assert.equal(core.questions({questions:[{...q,sources:[{page:2,quote:'Readable label from the selected diagram.'}]}]},selected,1)[0].sources[0].page,2);
});
test('picture bytes are stored once, separately from repeatedly saved answers and history',async()=>{
  const raw=draft({pictures:[picture('diagram')]}),selected=lesson.source(raw),session={id:'set-1',sourceKind:'lesson',lessonPages:selected.pages,answer:'My answer.'};
  const packed=lesson.pack({version:1,active:session,history:[session],lessonDraft:raw,sourceMode:'lesson'},'account-a');
  assert.equal(packed.images.size,1);assert.equal(packed.refs.size,1);assert.ok(!JSON.stringify(packed.value).includes('data:image/'));
  assert.equal(packed.value.active.lessonPages[1].imageRefs[0],packed.value.lessonDraft.pictures[0].ref);
  const restored=await lesson.unpackDraft(packed.value.lessonDraft,'account-a',ref=>packed.images.get(ref));assert.equal(restored.pictures[0].url,raw.pictures[0].url);assert.equal(restored.transcript,transcript);
  const second=lesson.pack({...packed.value,lessonDraft:restored},'account-a');assert.equal(second.refs.size,1);assert.equal(second.value.active.answer,'My answer.');
});
test('saved lesson media cannot be loaded or referenced through a different account',async()=>{
  const raw=draft({pictures:[picture('diagram')]}),packed=lesson.pack({active:null,history:[],lessonDraft:raw},'account-a');let reads=0;
  await assert.rejects(lesson.unpackDraft(packed.value.lessonDraft,'account-b',()=>{reads++;return picture('diagram').url}),/different account/);assert.equal(reads,0);
  await assert.rejects(lesson.unpackDraft(packed.value.lessonDraft,'account-a',()=>null),/could not be loaded/);
  assert.throws(()=>lesson.pack({active:{sourceKind:'lesson',lessonPages:[{id:'x',imageRefs:[packed.value.lessonDraft.pictures[0].ref]}]},history:[],lessonDraft:draft()},'account-b'),/different account/);
});
