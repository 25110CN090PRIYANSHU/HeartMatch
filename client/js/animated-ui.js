/* HeartMatch lightweight UI effects. Functional app logic is untouched. */
(()=>{
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if(reduce)return;
  // Keep only a lightweight click feedback effect; no permanent animated DOM.
  document.addEventListener('click',e=>{
    const target=e.target.closest('button,.btn,.chat-btn,.nav-btn,.profile-action-btn,.send-btn');
    if(!target||target.disabled)return;
    target.animate([{transform:'scale(.985)'},{transform:'scale(1)'}],{duration:120,easing:'ease-out'});
  },{passive:true});
})();
