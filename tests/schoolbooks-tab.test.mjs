import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('public/index.html','utf8');
const source=html.slice(html.indexOf('function renderSchoolbooks(){'),html.indexOf('function saveNote(close=true)'));
function render(filter='all',query=''){
 const records=[{id:'existing-book',kind:'schoolbook',title:'Biology',subject:'Cells',folder:'School',pages:[{id:'p1',title:'Membranes',body:'Original saved page'}],updatedAt:'2026-10-01'},{id:'note',title:'Regular note',body:'Keep this too'},{id:'deleted-book',kind:'schoolbook',title:'Old Maths',deletedAt:'2026-10-02',updatedAt:'2026-10-02',pages:[{id:'p2',body:'Recoverable writing'}]}];
 const before=JSON.stringify(records),elements={'#schoolbooksList':{},'#schoolbooksNavigation':{},'#schoolbooksFolder':{value:''},'#schoolbooksSearch':{value:query}};
 const context=vm.createContext({state:{notes:records},schoolbooksFilter:filter,qs:key=>elements[key],qsa:()=>[],esc:String,notePreview:String,CommandCentreNotebooks:{shelf:books=>JSON.stringify(books)}});
 vm.runInContext(source,context);context.renderSchoolbooks();assert.equal(JSON.stringify(records),before,'Rendering must not migrate or rewrite stored books');return elements['#schoolbooksList'].innerHTML;
}
test('existing schoolbooks appear on their own shelf with their original ID and pages',()=>{const books=JSON.parse(render());assert.equal(books.length,1);assert.equal(books[0].id,'existing-book');assert.equal(books[0].pages[0].body,'Original saved page')});
test('deleted schoolbooks remain recoverable in the Schoolbooks tab',()=>{const books=JSON.parse(render('deleted'));assert.equal(books[0].id,'deleted-book');assert.equal(books[0].pages[0].body,'Recoverable writing')});
test('schoolbook search includes lesson page titles and writing',()=>{assert.equal(JSON.parse(render('all','Membranes'))[0].id,'existing-book');assert.equal(JSON.parse(render('all','Original saved page'))[0].id,'existing-book')});
test('Schoolbooks has independent main navigation, home launcher and search entries',()=>{assert.match(html,/sidebar-item" data-page="schoolbooks"/);assert.match(html,/data-launch-page="schoolbooks"/);assert.match(html,/id="schoolbooksPage"/);assert.match(html,/\['schoolbooks','Schoolbooks','📚'\]/);const notesSection=html.slice(html.indexOf('<section class="page" id="notesPage">'),html.indexOf('<section class="page" id="schoolbooksPage">'));assert.doesNotMatch(notesSection,/addSchoolbookBtn/)});
