/* No video download, dependencies, audio, or network requests. */
(() => {
  'use strict';
  const root = document.documentElement;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let preference = 'cinematic';
  try { preference = localStorage.getItem('cc_motion_mode') || preference; } catch {}
  const mode = () => preference === 'off' ? 'off' : media.matches || preference === 'gentle' ? 'gentle' : 'cinematic';
  root.dataset.ccMotion = mode();
  if (mode() !== 'off') root.dataset.ccLaunch = 'pending';

  let overlay, canvas, context, progress, raf = 0, elapsed = 0, previousTime = 0;
  let running = false, finishing = false, nativeLocked = !!window.CommandCentreNative?.privacyLock;
  let nativeKnown = !nativeLocked, startRequested = mode() !== 'off';
  let width = 0, height = 0, stars = [], safetyTimer, exitTimer, restoreFocus;
  let lastTrigger = null, pageAnimation = null;
  const inerted = [];
  const animations = new Set();
  const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
  const ease = n => n * n * (3 - 2 * n);

  function animate(element, frames, options) {
    if (!element?.animate || mode() === 'off') return null;
    const animation = element.animate(frames, options);
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    return animation;
  }
  function cancelMotion() {
    animations.forEach(a => a.cancel());
    animations.clear();
  }
  function restoreApp() {
    clearTimeout(safetyTimer);
    cancelAnimationFrame(raf);
    root.removeAttribute('data-cc-launch');
    overlay?.classList.remove('cc-space-exit', 'cc-space-warp');
    overlay?.setAttribute('aria-hidden', 'true');
    for (const element of inerted.splice(0)) element.inert = false;
    const shouldRestore = document.activeElement === document.getElementById('ccSkipIntro') || document.activeElement === document.body;
    if (shouldRestore && restoreFocus?.isConnected) restoreFocus.focus({preventScroll:true});
    running = false;
    finishing = false;
    startRequested = false;
    window.dispatchEvent(new CustomEvent('cc-intro-complete'));
  }
  function finish(immediate = false) {
    if (finishing || (!running && !root.hasAttribute('data-cc-launch'))) return;
    finishing = true;
    startRequested = false;
    cancelAnimationFrame(raf);
    clearTimeout(safetyTimer);
    if (immediate || mode() === 'off') { restoreApp(); return; }
    overlay?.classList.add('cc-space-exit');
    const page = document.querySelector('.page.active');
    if (page) {
      animate(page, mode() === 'gentle' ? [{opacity:0},{opacity:1}] :
        [{opacity:0,transform:'scale(.95) translateY(14px)'},{opacity:1,transform:'none'}],
        {duration:mode()==='gentle'?160:650,easing:'cubic-bezier(.16,1,.3,1)'});
      if (mode() === 'cinematic') {
        page.querySelectorAll('.iphone-app,.launcher-dock-item').forEach((item, i) => {
          animate(item,[{opacity:0,transform:'translateY(18px) scale(.92)'},{opacity:1,transform:'none'}],
            {duration:500,delay:100+Math.min(i,16)*23,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'});
        });
      }
    }
    exitTimer = setTimeout(restoreApp,mode()==='gentle'?180:570);
  }
  function resize() {
    if (!canvas || !context) return;
    width = innerWidth; height = innerHeight;
    const pixelRatio = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * pixelRatio); canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio,0,0,pixelRatio,0,0);
  }
  function seedStar(star, distant = false) {
    const angle = Math.random() * Math.PI * 2;
    const radius = .04 + Math.sqrt(Math.random()) * 1.7;
    star.x = Math.cos(angle) * radius;
    star.y = Math.sin(angle) * radius;
    star.z = distant ? 1.8 + Math.random()*.7 : .12 + Math.random()*2.5;
    star.size = .3 + Math.random() * 1.1;
    star.tint = Math.random();
    star.phase = Math.random()*6.28;
    return star;
  }
  function draw(delta, t) {
    const ctx = context;
    const focal = Math.max(width,height)*.63;
    const cx = width/2, cy = height*.47;
    const warp = ease(clamp((t-850)/1450));
    const speed = .085 + warp*3.5;
    ctx.fillStyle = '#02040c'; ctx.fillRect(0,0,width,height);
    const halo = ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(width,height)*.65);
    halo.addColorStop(0,`rgba(43,69,122,${.13+warp*.15})`);
    halo.addColorStop(.35,'rgba(19,28,64,.16)');halo.addColorStop(1,'rgba(2,4,12,0)');
    ctx.fillStyle = halo;ctx.fillRect(0,0,width,height);
    for (const star of stars) {
      const oldZ = star.z;
      star.z -= delta*speed;
      if (star.z < .07) { seedStar(star,true); continue; }
      const x = cx + star.x / star.z * focal, y = cy + star.y / star.z * focal;
      if (x < -100 || x > width+100 || y < -100 || y > height+100) { seedStar(star,true); continue; }
      const alpha = clamp((1-star.z/3)*.85+.15)*(.82+.18*Math.sin(t*.001+star.phase));
      const radius = clamp(star.size / star.z,.35,2.4);
      const color = star.tint > .9 ? '241,213,192' : star.tint > .55 ? '158,197,255' : '227,239,255';
      // Project the tail farther away: streak length follows velocity, independent of refresh rate.
      const tailZ = Math.max(oldZ,star.z+speed*.065*warp);
      const tx = cx+star.x/tailZ*focal, ty = cy+star.y/tailZ*focal;
      if (warp > .05) {
        ctx.strokeStyle = `rgba(${color},${alpha*.72})`;ctx.lineWidth=radius*.75;
        ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(x,y);ctx.stroke();
      }
      ctx.fillStyle = `rgba(${color},${alpha})`;
      ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
      if (star.size>1.2 && warp<.4) {
        ctx.fillStyle = `rgba(${color},${alpha*.1})`;
        ctx.beginPath();ctx.arc(x,y,radius*3,0,Math.PI*2);ctx.fill();
      }
    }
  }
  function frame(time) {
    if (!running || finishing) return;
    if (document.hidden || nativeLocked) { previousTime=0; return; }
    const dt = previousTime ? Math.min(time-previousTime,45) : 0;
    previousTime=time;elapsed+=dt;
    try {
      draw(mode()==='gentle'?0:dt/1000, mode()==='gentle'?0:elapsed);
      progress.style.transform=`scaleX(${clamp(elapsed/3100)})`;
      if (elapsed > 1350) overlay.classList.add('cc-space-warp');
      if (elapsed > (mode()==='gentle'?320:3100)) {finish();return;}
      raf=requestAnimationFrame(frame);
    } catch { finish(true); }
  }
  function start() {
    if (!overlay || !startRequested || running || !nativeKnown || nativeLocked || document.hidden) return;
    if (mode()==='off') {finish(true);return;}
    clearTimeout(exitTimer);clearTimeout(safetyTimer);
    cancelMotion();
    running=true;finishing=false;elapsed=0;previousTime=0;
    restoreFocus=document.activeElement;
    root.dataset.ccLaunch='playing';
    overlay.setAttribute('aria-hidden','false');
    overlay.classList.remove('cc-space-exit','cc-space-warp');
    // Only disable elements this controller owns; preserve any existing inert state.
    for (const child of document.body.children) {
      if(child!==overlay && !['SCRIPT','STYLE','LINK'].includes(child.tagName) && !child.inert) {
        child.inert=true;inerted.push(child);
      }
    }
    try {
      context=canvas.getContext('2d',{alpha:false});
      if(!context){finish(true);return;}
      resize();
      stars=Array.from({length:width<600?700:1200},()=>seedStar({}));
      draw(0,0);
      raf=requestAnimationFrame(frame);
      safetyTimer=setTimeout(()=>finish(true),8000);
    } catch {finish(true);}
  }
  function replay() {
    clearTimeout(exitTimer);restoreApp();
    if (mode()==='off') return;
    startRequested=true;start();
  }
  function captureTrigger(event) {
    const button=event.target.closest?.('[data-launch-page],[data-launch-watch],[data-launch-action],[data-page],[data-page-jump],.mobile-dock-item,#navBackBtn');
    if (!button) return;
    const icon=button.querySelector('.iphone-app-icon,.launcher-dock-icon') || button;
    const rect=icon.getBoundingClientRect();
    lastTrigger={x:rect.left+rect.width/2,y:rect.top+rect.height/2,time:performance.now()};
  }
  function enterPage(target, {from, to, direction} = {}) {
    if (!target || from===to || root.hasAttribute('data-cc-launch') || mode()==='off') return;
    cancelMotion();
    pageAnimation?.cancel();
    const rect=target.getBoundingClientRect();
    const origin=lastTrigger && performance.now()-lastTrigger.time<900 ? lastTrigger : null;
    lastTrigger=null;
    const home=to==='home', back=direction==='back';
    if (mode()==='gentle') {
      pageAnimation=animate(target,[{opacity:0},{opacity:1}],{duration:150});return;
    }
    target.style.transformOrigin=origin ? `${origin.x-rect.left}px ${origin.y-rect.top}px` : '50% 100px';
    const first=home?'scale(1.045)':back?'translateX(-22px) scale(.985)':origin?'scale(.88) translateY(16px)':'translateY(22px) scale(.97)';
    pageAnimation=animate(target,[{opacity:0,transform:first},{opacity:1,transform:'none'}],
      {duration:home?430:480,easing:'cubic-bezier(.16,1,.3,1)'});
    if (origin && from==='home' && !home) {
      const maxRadius=Math.hypot(innerWidth,innerHeight);
      animate(target,[{clipPath:`circle(28px at ${origin.x-rect.left}px ${origin.y-rect.top}px)`},
        {clipPath:`circle(${maxRadius}px at ${origin.x-rect.left}px ${origin.y-rect.top}px)`}],
        {duration:430,easing:'cubic-bezier(.2,.8,.2,1)'});
    }
  }
  window.CCSpaceMotion={enterPage,replay,skip:()=>finish(true)};
  addEventListener('cc-native-privacy-status',event=>{
    nativeKnown=true;nativeLocked=!!event.detail?.locked;
    if (!nativeLocked) {
      start();
      if(running&&!finishing){cancelAnimationFrame(raf);previousTime=0;raf=requestAnimationFrame(frame);}
    } else cancelAnimationFrame(raf);
  });
  addEventListener('resize',resize,{passive:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){cancelAnimationFrame(raf);previousTime=0;}
    else {start();if(running&&!finishing){cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);}}
  });
  addEventListener('pagehide',()=>{clearTimeout(exitTimer);restoreApp();cancelMotion();});
  document.addEventListener('click',captureTrigger,true);
  document.addEventListener('keydown',event=>{
    if(root.hasAttribute('data-cc-launch') && (event.key==='Escape'||event.key==='Enter'||event.key===' ')) {
      event.preventDefault();finish(true);
    } else if(root.hasAttribute('data-cc-launch') && event.key==='Tab') {
      event.preventDefault();document.getElementById('ccSkipIntro')?.focus();
    }
  },true);
  media.addEventListener('change',()=>{root.dataset.ccMotion=mode();cancelMotion();if(running)finish(true);});
  // If initialization or the native status bridge fails, never leave a blocking splash.
  safetyTimer=setTimeout(()=>{
    if(root.hasAttribute('data-cc-launch')) {
      const waitingForUnlock = nativeLocked && startRequested;
      finish(true);
      // A slow Face ID/passcode unlock should still get its first visible intro.
      startRequested = waitingForUnlock;
    }
  },10000);
  document.addEventListener('DOMContentLoaded',()=>{
    overlay=document.getElementById('ccSpaceIntro');canvas=document.getElementById('ccSpaceCanvas');
    progress=document.getElementById('ccSpaceProgress');
    document.getElementById('ccSkipIntro')?.addEventListener('click',()=>finish(true));
    const select=document.getElementById('ccMotionMode');
    if(select){
      select.value=preference;
      select.addEventListener('change',()=>{
        preference=select.value;
        try{localStorage.setItem('cc_motion_mode',preference);}catch{}
        root.dataset.ccMotion=mode();cancelMotion();
        document.getElementById('ccReplayIntro').disabled=mode()==='off';
      });
    }
    const replayButton=document.getElementById('ccReplayIntro');
    if(replayButton){replayButton.disabled=mode()==='off';replayButton.addEventListener('click',replay);}
    // Modal entrances also cover dynamically generated app sheets.
    const observer=new MutationObserver(records=>{
      for(const record of records){
        const modal=record.target;
        if(modal.classList.contains('open') && !String(record.oldValue).split(/\s+/).includes('open') && !root.hasAttribute('data-cc-launch')) {
          const card=modal.querySelector('.modal-card');
          animate(card,mode()==='gentle'?[{opacity:0},{opacity:1}]:[{opacity:0,transform:'translateY(22px) scale(.97)'},{opacity:1,transform:'none'}],
            {duration:mode()==='gentle'?150:340,easing:'cubic-bezier(.16,1,.3,1)'});
        }
      }
    });
    document.querySelectorAll('.modal').forEach(modal=>observer.observe(modal,{attributes:true,attributeFilter:['class'],attributeOldValue:true}));
    start();
  },{once:true});
})();
