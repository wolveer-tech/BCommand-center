/* Keyboard editing shared by regular notes and schoolbook pages. */
(() => {
  const blocks=new Set(['P','DIV','LI','H1','H2','H3','H4','H5','H6','BLOCKQUOTE']);
  function textLines(editor) {
    const lines=[];
    let line={start:[editor,0],text:'',parts:[]};
    const finish=(end,next)=>{lines.push({...line,end});line={start:next,text:'',parts:[]};};
    function visit(node) {
      if(node.nodeType===Node.TEXT_NODE){
        let offset=0;
        for(const part of node.data.split('\n')){
          if(part){line.parts.push({node,offset,length:part.length});line.text+=part;}
          offset+=part.length;
          if(offset<node.data.length){finish([node,offset],[node,offset+1]);offset++;}
        }
        return;
      }
      if(node.nodeType!==Node.ELEMENT_NODE)return;
      const parent=node.parentNode,index=Array.prototype.indexOf.call(parent.childNodes,node);
      if(node.tagName==='BR'){finish([parent,index],[parent,index+1]);return;}
      if(node.contentEditable==='false'){
        if(line.text)finish([parent,index],[parent,index+1]);
        else line.start=[parent,index+1];
        return;
      }
      const block=blocks.has(node.tagName),before=lines.length;
      if(block){if(line.text)finish([parent,index],[node,0]);else line.start=[node,0];}
      [...node.childNodes].forEach(visit);
      if(block){
        if(line.text||lines.length===before)finish([node,node.childNodes.length],[parent,index+1]);
        else line.start=[parent,index+1];
      }
    }
    [...editor.childNodes].forEach(visit);
    if(line.text||!lines.length)finish([editor,editor.childNodes.length],[editor,editor.childNodes.length]);
    return lines;
  }
  function compare(a,b) {
    const left=document.createRange(),right=document.createRange();
    left.setStart(...a);left.collapse(true);right.setStart(...b);right.collapse(true);
    return left.compareBoundaryPoints(Range.START_TO_START,right);
  }
  function atOffset(line,offset) {
    for(const part of line.parts){if(offset<=part.length)return [part.node,part.offset+offset];offset-=part.length;}
    return line.end;
  }
  function bind(editor) {
    editor.addEventListener('keydown',event=>{
      if(event.target.closest?.('[data-photo-tools]'))return;
      if(event.key==='Escape'){editor.blur();return;}
      if(event.key!=='Tab'||event.ctrlKey||event.metaKey||event.altKey||editor.contentEditable==='false')return;
      const selection=getSelection();if(!selection?.rangeCount)return;
      const selected=selection.getRangeAt(0);
      if(!editor.contains(selected.startContainer)||!editor.contains(selected.endContainer))return;
      event.preventDefault();
      if(selected.collapsed&&!event.shiftKey){document.execCommand('insertText',false,'\t');return;}
      const bookmark=selected.cloneRange(),start=[selected.startContainer,selected.startOffset],end=[selected.endContainer,selected.endOffset];
      const lines=textLines(editor);
      const affected=selected.collapsed
        ?[lines.find(line=>compare(start,line.end)<=0)||lines.at(-1)]
        :lines.filter(line=>compare(line.end,start)>=0&&compare(line.start,end)<0);
      // Work backwards so edits do not invalidate the remaining text-node offsets.
      for(const line of affected.reverse()){
        const indent=event.shiftKey?line.text.match(/^(?: {0,3}\t| {1,4})/)?.[0]:'';
        if(event.shiftKey&&!indent)continue;
        const range=document.createRange();range.setStart(...line.start);
        range.setEnd(...(event.shiftKey?atOffset(line,indent.length):line.start));
        selection.removeAllRanges();selection.addRange(range);
        document.execCommand('insertText',false,event.shiftKey?'':'\t');
      }
      selection.removeAllRanges();selection.addRange(bookmark);
    });
  }
  window.CommandCentreNoteEditor={bind};
})();
