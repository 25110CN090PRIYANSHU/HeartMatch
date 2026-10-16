/* ==========================================================================
   HEARTMATCH MAX // CLIENT ENGINE
   Handles mobile sticky bottom navigation, chat double-tap heart reactions,
   and dynamic badges.
   ========================================================================== */

(function () {
  'use strict';

  // 1. Instagram-Style Sticky Bottom Navigation Bar (Mobile Only)
  function initBottomDock() {
    const path = window.location.pathname.toLowerCase();
    
    // Do not show on auth pages or chat
    const excludedPages = ['chat.html', 'login.html', 'signup.html', 'forgot-password.html', 'reset-password.html', 'admin.html', 'verify.html'];
    const isExcluded = excludedPages.some(page => path.endsWith('/' + page) || path.includes(page));
    if (isExcluded) {
      if (path.includes('chat.html')) document.body.classList.add('in-chat-page');
      return;
    }

    // Prevent duplicate injection
    if (document.querySelector('.hm-bottom-dock')) return;

    const isDiscover = path.endsWith('/discover.html') || path.endsWith('/') || path.endsWith('/index.html');
    const isMatches = path.endsWith('/matches.html');
    const isNotifs = path.endsWith('/notifications.html');
    const isProfile = path.endsWith('/profile.html') || path.endsWith('/person.html') || path.endsWith('/settings.html');

    const dock = document.createElement('div');
    dock.className = 'hm-bottom-dock';
    dock.id = 'hmBottomDock';
    dock.setAttribute('role', 'navigation');
    dock.setAttribute('aria-label', 'Mobile Navigation');
    dock.style.cssText = 'position: fixed !important; top: auto !important; bottom: 0 !important; left: 0 !important; right: 0 !important; width: 100% !important; z-index: 999999 !important;';
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

      const [notifsRes, chatRes] = await Promise.all([
        fetch('/api/notifications/unread-count', {
          headers: { Authorization: 'Bearer ' + token }
        }).catch(() => null),
        fetch('/api/chat/unread-count', {
          headers: { Authorization: 'Bearer ' + token }
        }).catch(() => null)
      ]);

      if (notifsRes && notifsRes.ok) {
        const data = await notifsRes.json();
        const badge = document.getElementById('hmNotifsBadge');
        if (badge) {
          const count = Number(data.unreadCount) || 0;
          if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
          } else {
            badge.style.display = 'none';
          }
        }
      }

      if (chatRes && chatRes.ok) {
        const data = await chatRes.json();
        const badge = document.getElementById('hmMatchesBadge');
        if (badge) {
          const count = Number(data.unreadCount) || 0;
          if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
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
    const msgId = row?.dataset?.messageId || row?.dataset?.id;
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

  setInterval(syncDockBadges, 15000);

  // Expose global HeartMatchMax utility
  window.HMM = {
    syncBadges: syncDockBadges,
    triggerHeartBurst: triggerHeartBurst
  };
})();
