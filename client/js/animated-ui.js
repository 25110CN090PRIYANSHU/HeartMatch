/* HeartMatch Romance UI — decorative only. Does not touch API, auth, storage or app logic. */
(()=>{
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const layer=document.createElement('div');
  layer.className='hm-motion-layer';
  layer.setAttribute('aria-hidden','true');
  layer.innerHTML='<div class="hm-romance-glow g1"></div><div class="hm-romance-glow g2"></div><div class="hm-romance-glow g3"></div><div class="hm-romantic-vignette"></div>';
  document.body.prepend(layer);
  if(!reduce){
    const hearts=['♥','❤','♡','💗','💖','💕','💘','💞'];
    const romance=['🌹','🌸','✨','💌','💫','🎀','🏹'];
    const dolls=['🧸','🧚‍♀️','🧚','💑'];
    const add=(cls,text,i)=>{
      const el=document.createElement('span');
      el.className=cls; el.textContent=text;
      el.style.left=(Math.random()*100)+'%';
      el.style.setProperty('--s',(10+Math.random()*23)+'px');
      el.style.setProperty('--d',(11+Math.random()*18)+'s');
      el.style.setProperty('--delay',(-Math.random()*25)+'s');
      el.style.setProperty('--x',(-130+Math.random()*260)+'px');
      if(cls==='hm-heart') el.style.setProperty('--c',i%3===0?'#ffb0d1':i%3===1?'#ff5b9f':'#ffd0e3');
      layer.appendChild(el);
    };
    for(let i=0;i<12;i++) add('hm-romance-icon',romance[i%romance.length],i);
    for(let i=0;i<7;i++) add('hm-sparkle','✦',i);
    for(let i=0;i<8;i++) add('hm-doll',dolls[i%dolls.length],i);
    for(let i=0;i<10;i++) add('hm-petal','',i);

    // Tiny romantic twinkle burst on clickable controls.
    document.addEventListener('click',e=>{
      const target=e.target.closest('button,.btn,.chat-btn,.nav-btn,.profile-action-btn,.send-btn,a');
      if(!target||target.getAttribute('aria-disabled')==='true'||target.disabled) return;
      const r=target.getBoundingClientRect();
      for(let i=0;i<4;i++){
        const s=document.createElement('span');
        s.textContent=i%2?'✦':'♥';
        s.style.cssText=`position:fixed;left:${r.left+r.width*(.25+Math.random()*.5)}px;top:${r.top+r.height*.5}px;z-index:99999;pointer-events:none;color:${i%2?'#ffd5e7':'#ff6ca9'};font-size:${10+Math.random()*8}px;transform:translate(-50%,-50%);animation:hmBurst .65s ease-out forwards`;
        document.body.appendChild(s); setTimeout(()=>s.remove(),700);
      }
    },{passive:true});

    // Add a subtle romantic micro-label to the landing page only; no controls are changed.
    if(location.pathname.endsWith('/')||location.pathname.endsWith('/index.html')||location.pathname===''){
      const hero=document.querySelector('.hero');
      if(hero&&!hero.querySelector('.hm-love-note')){
        const note=document.createElement('div'); note.className='hm-love-note'; note.innerHTML='♥  Where connections feel a little more magical  ♥';
        hero.prepend(note);
      }
    }
  }

  // Ripple without changing click behaviour.
  document.addEventListener('pointerdown',e=>{
    if(reduce) return;
    const b=e.target.closest('button,.btn,.chat-btn,.nav-btn,.profile-action-btn,.send-btn');
    if(!b||b.disabled) return;
    const r=b.getBoundingClientRect();
    const size=Math.max(r.width,r.height)*.6;
    const q=document.createElement('span');
    q.style.cssText=`position:absolute;width:${size}px;height:${size}px;left:${e.clientX-r.left-size/2}px;top:${e.clientY-r.top-size/2}px;border-radius:50%;background:rgba(255,255,255,.2);pointer-events:none;transform:scale(0);animation:hmRipple .6s ease-out;z-index:50`;
    if(getComputedStyle(b).position==='static') b.style.position='relative';
    b.appendChild(q); setTimeout(()=>q.remove(),650);
  },{passive:true});
})();
