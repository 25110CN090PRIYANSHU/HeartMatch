/* ==========================================================================
   HEARTMATCH MAX // CLIENT ENGINE
   Handles chat double-tap heart reactions and UI interactions.
   ========================================================================== */

(function () {
  'use strict';

  // 1. Chat Double-Tap to Heart Reaction
  function initChatDoubleTap() {
    const messagesContainer = document.querySelector('.messages') || document.getElementById('messages');
    if (!messagesContainer) return;

    let lastTap = 0;
    messagesContainer.addEventListener('touchend', function (e) {
      const msgBubble = e.target.closest('.message');
      if (!msgBubble) return;

      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;
      if (tapLength < 320 && tapLength > 0) {
        e.preventDefault();
        triggerHeartBurst(msgBubble, e.changedTouches ? e.changedTouches[0] : e);
      }
      lastTap = currentTime;
    });

    messagesContainer.addEventListener('dblclick', function (e) {
      const msgBubble = e.target.closest('.message');
      if (!msgBubble) return;
      triggerHeartBurst(msgBubble, e);
    });
  }

  function triggerHeartBurst(targetElement, eventCoords) {
    const burst = document.createElement('div');
    burst.className = 'hm-heart-burst';
    burst.textContent = '💖';

    const rect = targetElement.getBoundingClientRect();
    burst.style.left = (rect.width / 2 - 20) + 'px';
    burst.style.top = (rect.height / 2 - 20) + 'px';
    targetElement.style.position = 'relative';
    targetElement.appendChild(burst);

    setTimeout(() => {
      if (burst.parentNode) burst.parentNode.removeChild(burst);
    }, 800);

    // If chat has reactToMessage function, send heart emoji reaction
    const row = targetElement.closest('.message-row');
    const msgId = row?.dataset?.id;
    if (msgId && typeof window.reactToMessage === 'function') {
      window.reactToMessage(msgId, '❤️');
    }
  }

  // 2. Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initChatDoubleTap();
    });
  } else {
    initChatDoubleTap();
  }

  // Expose global HeartMatchMax utility
  window.HMM = {
    triggerHeartBurst: triggerHeartBurst
  };
})();
