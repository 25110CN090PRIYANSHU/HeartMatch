/* HeartMatch rich romantic UI effects. Functional app logic is untouched. */
(()=>{
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if(reduce)return;

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
