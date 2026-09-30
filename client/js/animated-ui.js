/* HeartMatch UI motion. No floating hearts, petals, sparkles or decorative particles. */
(()=>{
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if(reduce)return;
  document.addEventListener('click',e=>{
    const target=e.target.closest('button,.btn,.chat-btn,.nav-btn,.profile-action-btn,.send-btn');
    if(!target||target.disabled)return;
    target.animate([{transform:'scale(.985)'},{transform:'scale(1)'}],{duration:180,easing:'ease-out'});
  });
})();
