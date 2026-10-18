/* Shared with recovery snapshots and JSON backups. Keep sources distinct. */
(function(root){
  const text=(value,max=300)=>String(value??'').slice(0,max);
  const number=(value,fallback,max)=>Number.isFinite(Number(value))&&Number(value)>0?Math.min(max,Math.floor(Number(value))):fallback;
  const web=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}};
  const seriesKey=item=>`${item.source}:${item.id}`;
  const historyKey=item=>`${seriesKey(item)}:${item.chapter.id}`;
  function series(item){
    if(!item||!['asura','mangadex','comix'].includes(item.source)||!item.id||!item.title)return null;
    return {id:text(item.id,600),source:item.source,title:text(item.title),cover:web(item.cover),url:web(item.url),status:text(item.status,60),...(item.source==='comix'?{readingMode:'source'}:{})};
  }
  function favourite(item){const clean=series(item);return clean?{...clean,savedAt:number(item.savedAt,Date.now(),8640000000000000)}:null;}
  function history(item){
    const clean=series(item),c=item?.chapter;
    if(!clean||!c?.id)return null;
    const pageCount=number(item.pageCount,1,100000);
    return {...clean,chapter:{id:text(c.id,600),chapter:text(c.chapter,40),volume:text(c.volume,40),title:text(c.title),group:text(c.group),url:web(c.url)},
      language:['en','ja','ko','zh','es','fr','de','pt-br','it'].includes(item.language)?item.language:'en',
      page:Math.min(pageCount,number(item.page,1,100000)),pageCount,readAt:number(item.readAt,Date.now(),8640000000000000)};
  }
  function mergeRows(left,right,clean,key,time,limit){
    const rows=new Map();
    for(const item of [...(Array.isArray(left)?left:[]),...(Array.isArray(right)?right:[])]){
      const row=clean(item);if(row&&(!rows.has(key(row))||row[time]>=rows.get(key(row))[time]))rows.set(key(row),row);
    }
    return [...rows.values()].sort((a,b)=>b[time]-a[time]).slice(0,limit);
  }
  function merge(left={},right={}){
    const result={};
    for(const [kind,clean,key,time,limit] of [['favourites',favourite,seriesKey,'savedAt',1000],['history',history,historyKey,'readAt',200]]){
      const removed=kind+'Removed';
      result[removed]=mergeRows(left?.[removed],right?.[removed],row=>row&&typeof row.key==='string'&&row.key.length<=1300?{key:row.key,removedAt:number(row.removedAt,Date.now(),8640000000000000)}:null,row=>row.key,'removedAt',4000);
      const deleted=new Map(result[removed].map(row=>[row.key,row.removedAt]));
      result[kind]=mergeRows(left?.[kind],right?.[kind],clean,key,time,limit+result[removed].length).filter(row=>row[time]>(deleted.get(key(row))||0)).slice(0,limit);
    }
    return result;
  }
  function timestamp(library,kind,key){const removedAt=(library?.[kind+'Removed']||[]).find(row=>row.key===key)?.removedAt||0;return Math.max(Date.now(),removedAt+1);}
  function remove(library,kind,item){
    if(!['favourites','history'].includes(kind))return merge(library);
    const key=kind==='history'?historyKey(item):seriesKey(item),time=kind==='history'?'readAt':'savedAt';
    return merge(library,{[kind+'Removed']:[{key,removedAt:Math.max(timestamp(library,kind,key),Number(item[time]||0)+1)}]});
  }
  root.CommandCentreMangaLibrary={seriesKey,historyKey,series,history,merge,remove,timestamp};
})(globalThis);
