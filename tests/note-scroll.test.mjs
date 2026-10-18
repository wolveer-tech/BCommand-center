import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function keepNoteCaretVisible()'),html.indexOf("let notesFilter="));
function run({book=true,overflow='auto',caret={top:560,bottom:580,height:20,width:1},scrollTop=0}={}){
 const body={scrollTop,getBoundingClientRect:()=>({top:0,bottom:1500})};
 const page={scrollTop,style:{overflowY:overflow}};
 const actions={style:{display:'flex'},getBoundingClientRect:()=>({top:500})};
 const modal={classList:{contains:name=>name==='open'||(book&&name==='book-mode')},querySelector:selector=>selector==='.note-editor-card'?page:selector==='.modal-actions'?actions:null};
 const range={cloneRange(){return this},collapse(){},getClientRects:()=>[caret]};
 const context=vm.createContext({qs:selector=>selector==='#noteBody'?body:selector==='#noteModal'?modal:null,noteCaretFrame:0,cancelAnimationFrame(){},requestAnimationFrame:fn=>{fn();return 1},document:{activeElement:body},window:{innerHeight:600,getSelection:()=>({rangeCount:1,getRangeAt:()=>range})},getComputedStyle:el=>el.style});
 vm.runInContext(source,context);context.keepNoteCaretVisible();return {body,page};
}
test('growing schoolbooks scroll the page to keep typing above the save controls',()=>{const {body,page}=run();assert.equal(page.scrollTop,132);assert.equal(body.scrollTop,0)});
test('regular notes retain their editor scrolling',()=>{const {body,page}=run({book:false});assert.equal(body.scrollTop,132);assert.equal(page.scrollTop,0)});
test('schoolbooks use the full-height editor when the phone keyboard is open',()=>{const {body,page}=run({overflow:'hidden'});assert.equal(body.scrollTop,132);assert.equal(page.scrollTop,0)});
test('moving the caret above the visible page scrolls back to the earlier writing',()=>{const {body,page}=run({caret:{top:-40,bottom:-20,height:20,width:1},scrollTop:100});assert.equal(page.scrollTop,24);assert.equal(body.scrollTop,100)});
