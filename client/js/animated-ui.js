/* HeartMatch lightweight romantic effects — about 20% of the original decorative load. */
(()=>{
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if(reduce)return;
  const layer=document.createElement('div');
  layer.className='hm-motion-layer';
  layer.setAttribute('aria-hidden','true');
  document.body.appendChild(layer);
  const hearts=['❤️','💕','💗','💖','💜','💞','💓'];
  for(let i=0;i<7;i++){
    const h=document.createElement('span');
    h.className='hm-heart';
    h.textContent=hearts[i];
    h.style.left=(8+i*13+Math.random()*7)+'vw';
    h.style.setProperty('--s',(14+Math.random()*12)+'px');
    h.style.setProperty('--x',(Math.random()*90-45)+'px');
    h.style.setProperty('--d',(12+Math.random()*7)+'s');
    h.style.setProperty('--delay',(-Math.random()*12)+'s');
    h.style.setProperty('--c',i%2?'#ff78b5':'#ff4d91');
    layer.appendChild(h);
  }
  // One very subtle glow layer instead of multiple continuously moving effects.
  const glow=document.createElement('div');
  glow.className='hm-romance-glow g2';
  glow.style.opacity='.12';
  glow.style.filter='blur(32px)';
  layer.appendChild(glow);
  document.addEventListener('click',e=>{
    const target=e.target.closest('button,.btn,.chat-btn,.nav-btn,.profile-action-btn,.send-btn');
    if(!target||target.disabled)return;
    target.animate([{transform:'scale(.985)'},{transform:'scale(1)'}],{duration:120,easing:'ease-out'});
  },{passive:true});
})();
