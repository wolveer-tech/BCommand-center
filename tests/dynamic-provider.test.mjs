import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

async function dynamicHelpers(){
  const source=await readFile(new URL('../worker.js',import.meta.url),'utf8');
  const start=source.indexOf('function valueAtPath');
  const end=source.indexOf('async function fetchDynamicProvider',start);
  assert.ok(start>=0&&end>start,'dynamic provider helper block exists');
  const block=source.slice(start,end);
  return Function(`${block}; return {dynamicRootItems,annotateDynamicItems,dynamicExpandItems,normaliseDynamicStream};`)();
}

const payload={
  events:[
    {
      url:'alpha-vs-beta',name:'Alpha vs Beta',genre:1,sub_genre:7,
      time:'2026-09-09T15:00:00Z',isevent:true,
      streams:[{name:'Main',url:'https://player.example/embed/alpha'}]
    },
    {
      url:'hoops-live',name:'Hoops Live',genre:7,time:'2026-09-09T18:00:00Z',isevent:true,
      streams:[{name:'Court',url:'https://player.example/embed/hoops'}]
    },
    {
      url:'centre-court',name:'Centre Court',genre:10,time:'2026-09-09T20:00:00Z',isevent:true,
      streams:[{name:'Court 1',url:'https://player.example/embed/tennis'}]
    }
  ],
  genres:[
    {id:1,name:'Soccer',sub_categories:[{id:7,name:'Champions League'}]},
    {id:7,name:'Basketball',sub_categories:[]},
    {id:10,name:'Tennis',sub_categories:[]}
  ]
};

test('dynamic event feeds use genre metadata without flattening source arrays',async()=>{
  const h=await dynamicHelpers();
  const cfg={dynamicRoot:'events',dynamicCategoryField:'',dynamicItemsField:''};
  const roots=h.annotateDynamicItems(payload,h.dynamicRootItems(payload,cfg));
  const soccer=h.dynamicExpandItems(roots,cfg,'soccer');
  assert.equal(soccer.length,1);
  assert.equal(soccer[0].name,'Alpha vs Beta');
  assert.equal(soccer[0].streams.length,1);

  const normal=h.normaliseDynamicStream(soccer[0],0,'soccer');
  assert.equal(normal.id,'alpha-vs-beta');
  assert.equal(normal.league,'Champions League');
  assert.equal(normal.sources[0].url,'https://player.example/embed/alpha');
  assert.equal(normal.match_timestamp,1788966000);
});

test('dynamic event metadata filters basketball and tennis independently',async()=>{
  const h=await dynamicHelpers();
  const cfg={dynamicRoot:'events',dynamicCategoryField:'',dynamicItemsField:''};
  const roots=h.annotateDynamicItems(payload,h.dynamicRootItems(payload,cfg));
  assert.deepEqual(h.dynamicExpandItems(roots,cfg,'basketball').map(x=>x.name),['Hoops Live']);
  assert.deepEqual(h.dynamicExpandItems(roots,cfg,'tennis').map(x=>x.name),['Centre Court']);
});
