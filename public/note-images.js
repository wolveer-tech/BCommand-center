/* One image editor for Notes and Schoolbooks. Saved HTML contains only layout. */
(() => {
  const tools=`<div class="note-photo-tools" data-photo-tools contenteditable="false" role="group" aria-label="Photo controls"><button type="button" data-photo-action="move" aria-label="Drag to move photo">✥ Move</button><button type="button" data-photo-action="up" aria-label="Move photo earlier">↑</button><button type="button" data-photo-action="down" aria-label="Move photo later">↓</button><button type="button" data-photo-action="left" aria-label="Align photo left">Left</button><button type="button" data-photo-action="center" aria-label="Centre photo">Centre</button><button type="button" data-photo-action="right" aria-label="Align photo right">Right</button><label>Size <input type="range" min="15" max="100" step="1" value="100" aria-label="Photo width"></label><button type="button" data-photo-action="remove" aria-label="Remove photo">Remove</button></div><button type="button" class="note-photo-resize" data-photo-tools data-photo-action="resize" aria-label="Drag to resize photo" contenteditable="false">↘</button>`;
  const clamp=value=>Math.max(15,Math.min(100,Math.round(value)));
  function serialize(editor){
    const copy=editor.cloneNode(true);
    copy.querySelectorAll('[data-photo-tools],.note-photo-remove').forEach(node=>node.remove());
    copy.querySelectorAll('[data-photo-selected]').forEach(node=>node.removeAttribute('data-photo-selected'));
    return copy.innerHTML;
  }
  function bind(editor){
    let selected=null,gesture=null;
    const writable=()=>editor.contentEditable!=='false';
    const changed=()=>editor.dispatchEvent(new Event('input',{bubbles:true}));
    function select(photo){
      editor.querySelectorAll('[data-photo-selected]').forEach(node=>node.removeAttribute('data-photo-selected'));
      selected=photo;if(photo&&writable()){
        photo.dataset.photoSelected='true';
        const slider=photo.querySelector('input[type="range"]');
        // A new data-URL image can finish decoding after controls are attached.
        if(slider)slider.value=String(clamp(photo.style.width.endsWith('%')?parseFloat(photo.style.width):photo.getBoundingClientRect().width/contentWidth()*100));
      }
    }
    function contentWidth(){const style=getComputedStyle(editor);return Math.max(1,editor.clientWidth-parseFloat(style.paddingLeft||0)-parseFloat(style.paddingRight||0));}
    function width(photo,value){photo.style.width=clamp(value)+'%';const slider=photo.querySelector('input[type="range"]');if(slider)slider.value=String(clamp(value));}
    function decorate(){
      // Old pasted images and existing notes get the same controls as new photos.
      editor.querySelectorAll('img').forEach(img=>{
        let photo=img.closest('.note-photo');
        if(!photo){photo=document.createElement('figure');photo.className='note-photo';img.before(photo);photo.append(img);}
        if(photo.contentEditable!=='false')photo.contentEditable='false';img.draggable=false;
        photo.querySelectorAll('.note-photo-remove').forEach(node=>node.remove());
        if(writable()&&!photo.querySelector('[data-photo-tools]')){photo.insertAdjacentHTML('beforeend',tools);photo.querySelector('input').value=String(clamp(parseFloat(photo.style.width)||Math.min(100,photo.getBoundingClientRect().width/contentWidth()*100)));}
        if(!writable())photo.querySelectorAll('[data-photo-tools]').forEach(node=>node.remove());
      });
      if(selected&&!editor.contains(selected))selected=null;
    }
    function block(node){while(node?.parentNode&&node.parentNode!==editor)node=node.parentNode;return node?.parentNode===editor?node:null;}
    function move(photo,direction){
      const own=block(photo),neighbor=direction<0?own?.previousSibling:own?.nextSibling;if(!neighbor)return;
      if(direction<0)editor.insertBefore(photo,neighbor);else editor.insertBefore(photo,neighbor.nextSibling);
      photo.scrollIntoView({block:'nearest'});changed();
    }
    editor.addEventListener('click',event=>{
      const photo=event.target.closest('.note-photo');if(!photo||!writable())return;
      select(photo);const action=event.target.closest('[data-photo-action]')?.dataset.photoAction;
      if(action){event.preventDefault();if(action==='remove'){photo.remove();select(null);changed();}
        else if(action==='up'||action==='down')move(photo,action==='up'?-1:1);
        else if(['left','center','right'].includes(action)){photo.style.marginLeft=action==='left'?'0':'auto';photo.style.marginRight=action==='right'?'0':'auto';changed();}}
    });
    editor.addEventListener('input',event=>{if(event.target.matches('.note-photo-tools input')){width(event.target.closest('.note-photo'),Number(event.target.value));}});
    editor.addEventListener('pointerdown',event=>{
      if(!writable())return;
      const handle=event.target.closest('[data-photo-action="resize"],[data-photo-action="move"]');
      if(!handle){if(!event.target.closest('.note-photo'))select(null);return;}
      if(event.button!==0)return;event.preventDefault();
      const photo=handle.closest('.note-photo');select(photo);
      gesture={photo,kind:handle.dataset.photoAction,x:event.clientX,width:photo.getBoundingClientRect().width,editorWidth:contentWidth(),moved:false};
      editor.setPointerCapture(event.pointerId);
    });
    editor.addEventListener('pointermove',event=>{
      if(!gesture)return;event.preventDefault();
      if(gesture.kind==='resize')width(gesture.photo,(gesture.width+event.clientX-gesture.x)/gesture.editorWidth*100);
      else{gesture.moved=true;const scroller=editor.closest('.modal-body')||editor;if(event.clientY<60)scroller.scrollBy(0,-16);else if(event.clientY>innerHeight-80)scroller.scrollBy(0,16);}
    });
    function finish(event,cancelled=false){
      if(!gesture)return;const {photo,kind,moved}=gesture;gesture=null;
      if(editor.hasPointerCapture(event.pointerId))editor.releasePointerCapture(event.pointerId);
      if(!writable()||!editor.contains(photo))return;
      if(!cancelled&&kind==='move'&&moved){
        const target=document.elementFromPoint(event.clientX,event.clientY),destination=target&&editor.contains(target)?block(target):null;
        if(destination&&destination!==block(photo)){const rect=destination.getBoundingClientRect();editor.insertBefore(photo,event.clientY<rect.top+rect.height/2?destination:destination.nextSibling);}
        else if(target===editor){const rect=editor.getBoundingClientRect();if(event.clientY<rect.top+rect.height/2)editor.prepend(photo);else editor.append(photo);}
      }
      changed();
    }
    editor.addEventListener('pointerup',event=>finish(event));editor.addEventListener('pointercancel',event=>finish(event,true));
    editor.addEventListener('keydown',event=>{if(event.key==='Escape')select(null);});
    new MutationObserver(decorate).observe(editor,{childList:true,subtree:true,attributes:true,attributeFilter:['contenteditable']});
    decorate();
    return {refresh:decorate,serialize:()=>serialize(editor)};
  }
  window.CommandCentreNoteImages={bind,serialize};
})();
