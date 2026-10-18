// A reachability hint, not a playback guarantee. Never follow provider redirects
// on the server or fetch arbitrary client-supplied URLs.
export async function probeMediaProvider(url,fetcher=fetch,timeoutMs=4500){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetcher(url,{method:'HEAD',redirect:'manual',signal:controller.signal});
    const status=response.status;
    return {state:status>=500?'unavailable':status>=200&&status<400?'available':'unknown',status};
  }catch{return {state:'unknown',status:null};}
  finally{clearTimeout(timer);}
}
