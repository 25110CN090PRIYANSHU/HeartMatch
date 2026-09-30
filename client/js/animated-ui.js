/* HeartMatch rich romantic UI effects. Functional app logic is untouched. */
(()=>{
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if(reduce)return;

  /* Create the decorative motion layer once. */
  const layer=document.createElement('div');
  layer.className='hm-motion-layer';
  layer.innerHTML='<div class="hm-romance-glow g1"></div><div class="hm-romance-glow g2"></div><div class="hm-romance-glow g3"></div><div class="hm-romantic-vignette"></div>';

  const icons=['❤️','💗','💖','💕','✨','🌸','💜','💞','🩷','🌹','🦋'];
  const types=['hm-heart','hm-romance-icon','hm-sparkle','hm-petal','hm-doll'];
  for(let i=0;i<34;i++){
    const el=document.createElement('span');
    const type=types[i%types.length];
    el.className=type;
    el.textContent=type==='hm-petal'?'':icons[i%icons.length];
    el.style.left=(Math.random()*100)+'vw';
    el.style.setProperty('--s',(10+Math.random()*22)+'px');
    el.style.setProperty('--x',(-80+Math.random()*160)+'px');
    el.style.setProperty('--d',(8+Math.random()*13)+'s');
    el.style.setProperty('--delay',(-Math.random()*16)+'s');
    el.style.setProperty('--c',['#ff3f8e','#ff78b5','#ffd1e3','#c9a7ff'][i%4]);
    layer.appendChild(el);
  }
  document.body.prepend(layer);

  /* Lightweight click feedback plus occasional heart burst. */
  document.addEventListener('click',e=>{
    const target=e.target.closest('button,.btn,.chat-btn,.nav-btn,.profile-action-btn,.send-btn');
    if(!target||target.disabled)return;
    target.animate([{transform:'scale(.985)'},{transform:'scale(1)'}],{duration:180,easing:'ease-out'});
    if(target.classList.contains('like') || /like/i.test(target.textContent||'')){
      const r=target.getBoundingClientRect();
      for(let i=0;i<5;i++){
        const h=document.createElement('span'); h.textContent='❤'; h.className='hm-love-note';
        h.style.position='fixed'; h.style.left=r.left+r.width/2+'px'; h.style.top=r.top+r.height/2+'px';
        h.style.zIndex='99999'; h.style.pointerEvents='none'; h.style.setProperty('--bx',(i-2)*22+'px');
        h.style.animation='hmBurst .8s ease-out forwards'; document.body.appendChild(h);
        setTimeout(()=>h.remove(),900);
      }
    }
  });
})();
