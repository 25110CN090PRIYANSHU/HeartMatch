/* ==========================================================================
   HEARTMATCH MAX // CLIENT ENGINE
   Handles mobile floating bottom dock, double-tap reactions,
   and swipe stamp feedback.
   ========================================================================== */

(function () {
  'use strict';

  // 1. Inject Universal Mobile Bottom Dock
  function initBottomDock() {
    // Skip dock on chat screen to maximize chat area and native feel
    const path = window.location.pathname.toLowerCase();
    const isChat = path.endsWith('/chat.html') || path.includes('chat.html');
    if (isChat) {
      document.body.classList.add('in-chat-page');
      return;
    }

    if (document.querySelector('.hm-bottom-dock')) return;

    const isDiscover = path.endsWith('/discover.html') || path.endsWith('/') || path.endsWith('/index.html');
    const isMatches = path.endsWith('/matches.html');
    const isNotifs = path.endsWith('/notifications.html');
    const isProfile = path.endsWith('/profile.html') || path.endsWith('/person.html');

    const dock = document.createElement('nav');
    dock.className = 'hm-bottom-dock';
    dock.setAttribute('aria-label', 'Mobile Navigation');
    dock.innerHTML = `
      <a href="discover.html" class="hm-dock-item ${isDiscover ? 'active' : ''}">
        <span class="hm-dock-icon">🔥</span>
        <span class="hm-dock-label">Discover</span>
      </a>
      <a href="matches.html" class="hm-dock-item ${isMatches ? 'active' : ''}">
        <span class="hm-dock-icon">💬</span>
        <span class="hm-dock-label">Matches</span>
        <span class="hm-dock-badge" id="hmMatchesBadge" style="display: none;">0</span>
      </a>
      <a href="notifications.html" class="hm-dock-item ${isNotifs ? 'active' : ''}">
        <span class="hm-dock-icon">🔔</span>
        <span class="hm-dock-label">Alerts</span>
        <span class="hm-dock-badge" id="hmNotifsBadge" style="display: none;">0</span>
      </a>
      <a href="profile.html" class="hm-dock-item ${isProfile ? 'active' : ''}">
        <span class="hm-dock-icon">👤</span>
        <span class="hm-dock-label">Profile</span>
      </a>
    `;

    document.body.appendChild(dock);

    // Sync notification badge count from server
    syncDockBadges();
  }

  async function syncDockBadges() {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const res = await fetch('/api/notifications/unread-count', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (res.ok) {
        const data = await res.json();
        const badge = document.getElementById('hmNotifsBadge');
        if (badge) {
          if (data.unreadCount > 0) {
            badge.textContent = data.unreadCount > 99 ? '99+' : data.unreadCount;
            badge.style.display = 'flex';
          } else {
            badge.style.display = 'none';
          }
        }
      }
    } catch (_) {}
  }

  // 2. Chat Double-Tap to Heart Reaction
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

  // 3. Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initBottomDock();
      initChatDoubleTap();
    });
  } else {
    initBottomDock();
    initChatDoubleTap();
  }

  // Expose global HeartMatchMax utility
  window.HMM = {
    syncBadges: syncDockBadges,
    triggerHeartBurst: triggerHeartBurst
  };
})();
