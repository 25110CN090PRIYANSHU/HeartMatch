/* HeartMatch Motion UI — visual only */
(()=>{
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if(!reduce){
    const layer=document.createElement('div');
    layer.className='hm-motion-layer'; layer.setAttribute('aria-hidden','true');
    const glyphs=['♥','♡','✦','•'];
    for(let i=0;i<24;i++){
      const s=document.createElement('span'); s.className='hm-particle'; s.textContent=glyphs[i%glyphs.length];
      s.style.left=(Math.random()*100)+'%'; s.style.setProperty('--s',(9+Math.random()*18)+'px');
      s.style.setProperty('--d',(12+Math.random()*16)+'s'); s.style.setProperty('--delay',(-Math.random()*22)+'s');
      s.style.setProperty('--x',(-90+Math.random()*180)+'px'); layer.appendChild(s);
    }
    document.body.appendChild(layer);
  }
  document.addEventListener('click',e=>{
    if(reduce) return;
    const b=e.target.closest('button,.btn,.chat-btn,.nav-btn,.profile-action-btn,.send-btn');
    if(!b||b.disabled) return;
    const r=b.getBoundingClientRect(),z=Math.max(r.width,r.height)*.55;
    const q=document.createElement('span');
    q.style.cssText=`position:absolute;width:${z}px;height:${z}px;left:${e.clientX-r.left-z/2}px;top:${e.clientY-r.top-z/2}px;border-radius:50%;background:rgba(255,255,255,.22);pointer-events:none;transform:scale(0);animation:ripple .58s ease-out;z-index:20`;
    if(getComputedStyle(b).position==='static') b.style.position='relative'; b.appendChild(q); setTimeout(()=>q.remove(),650);
  },{passive:true});
})();
