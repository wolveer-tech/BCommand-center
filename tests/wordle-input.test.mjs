import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('public/index.html','utf8');
const code=source.slice(source.indexOf('let wordleCursor=0;'),source.indexOf('function resetWordleToday(){'));
function fixture(){
 const g={wordleCurrent:'',wordleFinished:false},document={activeElement:null},inputs=[];let saves=0,submitted=0;
 for(let i=0;i<5;i++)inputs.push({dataset:{wordleCell:String(i)},value:'',focus(){document.activeElement=this},select(){},closest(){return {classList:{toggle(){}}}}});
 const context=vm.createContext({document,qs:selector=>inputs[Number(selector.match(/"(\d+)"/)[1])],qsa:()=>inputs,ensureWordleState:()=>g,saveState:()=>saves++,submitWordleGuess(){if(/^[A-Z]{5}$/.test(g.wordleCurrent)){submitted++;g.wordleCurrent='';}}});
 vm.runInContext(code,context);
 const press=(key,extra={})=>context.wordleKeydown({key,preventDefault(){},...extra});
 return {g,inputs,document,context,press,saves:()=>saves,submitted:()=>submitted};
}
test('Wordle typing advances through the row and ignores a sixth letter until Enter',()=>{
 const f=fixture();for(const key of 'cranez')f.press(key);assert.equal(f.g.wordleCurrent,'CRANE');assert.equal(f.document.activeElement,f.inputs[4]);assert.equal(f.submitted(),0);f.press('Enter');assert.equal(f.submitted(),1);assert.equal(f.document.activeElement,f.inputs[0]);
});
test('Wordle Backspace from the next empty square clears and returns to the previous letter',()=>{
 const f=fixture();f.press('c');f.press('a');f.press('Backspace');assert.equal(f.g.wordleCurrent,'C');assert.equal(f.document.activeElement,f.inputs[1]);f.press('t');assert.equal(f.g.wordleCurrent,'CT');
});
test('Wordle supports arrow editing, Delete, and does not submit a row with holes',()=>{
 const f=fixture();for(const key of 'crane')f.press(key);f.press('Home');f.press('ArrowRight');f.press('Delete');assert.equal(f.g.wordleCurrent,'C ANE');f.press('Enter');assert.equal(f.submitted(),0);f.press('l');assert.equal(f.g.wordleCurrent,'CLANE');
});
test('Wordle paste strips punctuation, fits the row, and preserves finished games and keyboard shortcuts',()=>{
 const f=fixture();f.context.pasteWordle({preventDefault(){},clipboardData:{getData:()=> 'c-r-a-n-e!more'}});assert.equal(f.g.wordleCurrent,'CRANE');assert.equal(f.submitted(),0);f.press('q',{ctrlKey:true});assert.equal(f.g.wordleCurrent,'CRANE');f.g.wordleFinished=true;f.press('Backspace');assert.equal(f.g.wordleCurrent,'CRANE');
});
