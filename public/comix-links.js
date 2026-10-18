/* Comix links can be kept in the library even when its browser check blocks embeds. */
(function(root){
 function parse(value,title=''){
  let url;try{url=new URL(String(value).trim());}catch{throw Error('Paste a Comix title or chapter link.');}
  const match=url.pathname.match(/^\/title\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?\/?$/i);
  if(url.protocol!=='https:'||url.port||url.username||url.password||!['comix.to','comix.ws','www.comix.to','www.comix.ws'].includes(url.hostname)||!match||url.pathname.length>600)throw Error('Use an HTTPS comix.to or comix.ws title/chapter link.');
  const slug=match[1],name=String(title||slug.split('-').slice(1).join(' ')||'Comix title').trim().slice(0,300);
  const series={id:'/title/'+slug,title:name,source:'comix',readingMode:'source',cover:'',status:'Comix',url:url.origin+'/title/'+slug};
  const chapter=match[2]?{id:'/title/'+slug+'/'+match[2],chapter:match[2].match(/-chapter-(\d+(?:\.\d+)?)/i)?.[1]||'',title:'Saved Comix chapter',url:url.origin+'/title/'+slug+'/'+match[2]}:null;
  return {series,chapter};
 }
 root.CommandCentreComixLinks={parse};
})(globalThis);
