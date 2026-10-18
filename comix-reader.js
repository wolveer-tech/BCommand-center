import './public/comix-links.js';
const DOMAINS=['https://comix.to','https://comix.ws'];
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const text=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/\s+/g,' ').trim();
async function page(path,fetcher){
 let last;
 for(const domain of DOMAINS){
  try{
   const url=new URL(path,domain),response=await fetcher(url.href,{headers:{accept:'text/html'},redirect:'manual',signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw fail(response.status===403?'Comix requires its own browser check. Open Comix below, then save the title or chapter link to track it here.':`Comix returned HTTP ${response.status}.`,response.status===429?429:503);
   const html=await response.text();
   if(html.length>6*1024*1024)throw fail('Comix returned an oversized page.',502);
   if(/cf-chl-|\/\@waf\/|<title>Just a moment|verify you(?:&#039;|')re human/i.test(html))throw fail('Comix requires its own browser check. Open Comix and save a reading link below.',503);
   return {html,url};
  }catch(error){last=error;}
 }
 throw Object.assign(last||fail('Comix is unavailable.',503),{externalUrls:DOMAINS});
}
export function parseComixSearch(html,base='https://comix.to'){
 const results=new Map();
 for(const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  try{
   const link=new URL(match[1],base),title=text(match[2].match(/(?:alt|title)=["']([^"']+)["']/i)?.[1]||match[2]);
   const {series,chapter}=CommandCentreComixLinks.parse(link.href,title);if(chapter||!title)continue;
   results.set(series.id,series);
  }catch{}
 }
 return [...results.values()].slice(0,40);
}
export async function comixRequest(url,fetcher=fetch){
 if(url.pathname==='/api/manga/search'){
  const query=String(url.searchParams.get('q')||'').trim().slice(0,600);if(!query)throw fail('Enter a manga title or Comix link.');
  if(/^https:\/\//i.test(query)){const {series}=CommandCentreComixLinks.parse(query);return {source:'Comix',results:[series]};}
  const {html,url:base}=await page('/browse?q='+encodeURIComponent(query)+'&order=relevance:desc',fetcher);
  const results=parseComixSearch(html,base);if(!results.length)throw Object.assign(fail('Comix search is rendered in its browser. Open Comix search and save a title link below.',503),{externalUrls:DOMAINS});
  return {source:'Comix',results};
 }
 // Comix serves signed/encrypted chapter data to its own reader. Do not claim
 // that protected page images can be read by this Worker.
 if(['/api/manga/chapters','/api/manga/pages'].includes(url.pathname)){
  const path=url.searchParams.get('id')||'';
  CommandCentreComixLinks.parse('https://comix.to'+path);
  throw Object.assign(fail('Read Comix in its own browser. Save a chapter link to keep it in your synced reading history.',503),{externalUrls:DOMAINS});
 }
 throw fail('Unknown Comix request.',404);
}
