import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('public/games-suite.js','utf8');
const code=source.slice(source.indexOf('  function crosswordEntryKeys('),source.indexOf('  function checkCrossword('));
function fixture(){
 const puzzle={size:4,entries:[{number:1,direction:'Across',answer:'CAT',row:1,col:0,dr:0,dc:1,clue:'Pet'},{number:1,direction:'Down',answer:'CUP',row:1,col:0,dr:1,dc:0,clue:'Vessel'}]};
 const inputs=new Map(),saved={values:{},checked:false,revealed:false},runtime={crosswordSelection:{mini:{key:'1,0',direction:'Across'}},crosswordWrong:{}};
 const document={activeElement:null,querySelector(selector){const match=selector.match(/data-cross-key="([^"]+)"/);return match?inputs.get(match[1]):null},querySelectorAll(selector){return selector.includes('data-cross-kind')?[...inputs.values()]:[]}};
 for(const key of ['1,0','1,1','1,2','2,0','3,0'])inputs.set(key,{dataset:{crossKind:'mini',crossKey:key},value:'',readOnly:false,focus(){document.activeElement=this},select(){},matches(){return true},closest(){return {classList:{toggle(){},remove(){}}}}});
 const cells=new Map([['1,0',{letter:'C'}],['1,1',{letter:'A'}],['1,2',{letter:'T'}],['2,0',{letter:'U'}],['3,0',{letter:'P'}]]);
 let saves=0;const context=vm.createContext({document,runtime,Set,crosswordPuzzle:()=>puzzle,crosswordState:()=>saved,saveSuite:()=>saves++,crosswordCells:()=>cells});
 vm.runInContext(code,context);
 function focus(key,direction='Across'){runtime.crosswordSelection.mini={key,direction};document.activeElement=inputs.get(key);}
 function press(key){const event={target:document.activeElement,key,preventDefault(){}};context.crosswordKeydown(event);}
 focus('1,0');return {context,document,runtime,inputs,saved,focus,press,saves:()=>saves};
}
test('typing a whole answer advances square by square and then to an unfinished clue',()=>{const f=fixture();for(const letter of 'cat')f.press(letter);assert.deepEqual({...f.saved.values},{'1,0':'C','1,1':'A','1,2':'T'});assert.equal(f.document.activeElement.dataset.crossKey,'2,0');assert.equal(f.runtime.crosswordSelection.mini.direction,'Down');assert.equal(f.saves(),3)});
test('automatic typing skips given squares without changing their letters',()=>{const f=fixture();f.inputs.get('1,1').readOnly=true;f.inputs.get('1,1').value='A';f.press('c');assert.equal(f.document.activeElement.dataset.crossKey,'1,2');assert.equal(f.inputs.get('1,1').value,'A')});
test('Backspace from an empty square moves back and removes the previous typed letter',()=>{const f=fixture();f.press('c');f.press('Backspace');assert.equal(f.document.activeElement.dataset.crossKey,'1,0');assert.equal(f.saved.values['1,0'],'')});
test('typing in Down follows the column, preserving the Across crossing',()=>{const f=fixture();f.focus('1,0','Down');for(const letter of 'cup')f.press(letter);assert.equal(f.saved.values['2,0'],'U');assert.equal(f.saved.values['3,0'],'P');assert.equal(f.saved.values['1,1'],undefined)});
test('Space changes direction at a crossing',()=>{const f=fixture();f.press(' ');assert.equal(f.runtime.crosswordSelection.mini.direction,'Down');f.press('c');assert.equal(f.document.activeElement.dataset.crossKey,'2,0')});
test('arrow navigation follows the requested direction',()=>{const f=fixture();f.press('ArrowDown');assert.equal(f.document.activeElement.dataset.crossKey,'2,0');assert.equal(f.runtime.crosswordSelection.mini.direction,'Down');f.press('ArrowUp');assert.equal(f.document.activeElement.dataset.crossKey,'1,0')});
test('pasting fills the selected word and discards punctuation',()=>{const f=fixture();f.context.pasteCrossword({target:f.document.activeElement,preventDefault(){},clipboardData:{getData:()=> 'c-a-t!'}});assert.deepEqual({...f.saved.values},{'1,0':'C','1,1':'A','1,2':'T'})});
test('revealed or given squares remain read-only',()=>{const f=fixture();f.document.activeElement.readOnly=true;f.press('q');f.press('Backspace');assert.deepEqual({...f.saved.values},{})});

test('pasting a complete answer preserves and consumes matching given letters',()=>{const f=fixture();f.inputs.get('1,1').readOnly=true;f.inputs.get('1,1').value='A';f.context.pasteCrossword({target:f.document.activeElement,preventDefault(){},clipboardData:{getData:()=> 'CAT'}});assert.equal(f.inputs.get('1,0').value,'C');assert.equal(f.inputs.get('1,1').value,'A');assert.equal(f.inputs.get('1,2').value,'T')});
