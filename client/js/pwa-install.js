// HeartMatch PWA Installation & Service Worker Registration
(function () {
  'use strict';

  // 1. Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // Check for service worker updates
          reg.onupdatefound = () => {
            const installing = reg.installing;
            if (installing) {
              installing.onstatechange = () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('New HeartMatch version available. Auto-updating on next visit.');
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn('Service Worker registration failed:', err);
        });
    });
  }

  // Check if app is already running in standalone PWA mode
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isStandalone) {
    return; // Already running as installed PWA app
  }

  // Check dismissal cooldown (dismissed within last 5 days)
  const DISMISS_KEY = 'hm_pwa_install_dismissed';
  const lastDismissed = localStorage.getItem(DISMISS_KEY);
  if (lastDismissed && Date.now() - parseInt(lastDismissed, 10) < 5 * 24 * 60 * 60 * 1000) {
    return;
  }

  let deferredPrompt = null;

  // 2. Android / Chrome / Edge Installation Prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner('native');
  });

  // 3. iOS Safari Check
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !window.MSStream &&
    !window.chrome;

  if (isIOS && !lastDismissed) {
    // Show iOS install instructions after 4 seconds of browsing
    setTimeout(() => {
      showInstallBanner('ios');
    }, 4000);
  }

  function showInstallBanner(type) {
    if (document.getElementById('hmPwaBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'hmPwaBanner';
    banner.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      width: min(440px, calc(100% - 28px));
      background: linear-gradient(135deg, rgba(32, 23, 48, 0.96), rgba(18, 12, 28, 0.96));
      border: 1px solid rgba(255, 63, 142, 0.35);
      border-radius: 20px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      z-index: 99999;
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.6), 0 0 25px rgba(255, 63, 142, 0.2);
      backdrop-filter: blur(16px);
      color: #fff;
      font-family: inherit;
      transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    if (type === 'native') {
      banner.innerHTML = `
        <img src="/images/icons/icon-192.png" alt="HeartMatch" style="width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; box-shadow: 0 4px 12px rgba(255,63,142,0.3);" />
        <div style="flex: 1; min-width: 0;">
          <strong style="display: block; font-size: 14px; font-weight: 700; color: #fff;">Install HeartMatch</strong>
          <span style="display: block; font-size: 12px; color: #b7b0c5; line-height: 1.3;">Add to Home Screen for fast, full-screen dating!</span>
        </div>
        <button id="hmPwaInstallBtn" style="padding: 8px 16px; border-radius: 999px; border: none; background: linear-gradient(135deg, #ff3f8e, #a855f7); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; flex-shrink: 0; transition: transform 0.15s;">Install</button>
        <button id="hmPwaCloseBtn" title="Dismiss" style="background: none; border: none; color: #8e879b; font-size: 18px; cursor: pointer; padding: 4px; line-height: 1;">✕</button>
      `;
    } else {
      // iOS Safari
      banner.innerHTML = `
        <img src="/images/icons/icon-192.png" alt="HeartMatch" style="width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;" />
        <div style="flex: 1; min-width: 0;">
          <strong style="display: block; font-size: 13px; font-weight: 700; color: #fff;">Install on iPhone</strong>
          <span style="display: block; font-size: 12px; color: #b7b0c5; line-height: 1.3;">Tap Share <b style="color: #ff91ba;">⎋</b> then tap <b style="color: #ff91ba;">"Add to Home Screen ➕"</b></span>
        </div>
        <button id="hmPwaCloseBtn" style="padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.08); color: #ddd; font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0;">Got it</button>
      `;
    }

    document.body.appendChild(banner);

    // Slide up with animation
    requestAnimationFrame(() => {
      banner.style.transform = 'translateX(-50%) translateY(0)';
    });

    const installBtn = banner.querySelector('#hmPwaInstallBtn');
    const closeBtn = banner.querySelector('#hmPwaCloseBtn');

    if (installBtn) {
      installBtn.onclick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          console.log('User installed HeartMatch PWA ❤️');
        }
        deferredPrompt = null;
        dismissBanner(banner);
      };
    }

    if (closeBtn) {
      closeBtn.onclick = () => {
        localStorage.setItem(DISMISS_KEY, Date.now().toString());
        dismissBanner(banner);
      };
    }
  }

  function dismissBanner(banner) {
    banner.style.transform = 'translateX(-50%) translateY(120px)';
    setTimeout(() => {
      banner.remove();
    }, 400);
  }

  window.addEventListener('appinstalled', () => {
    console.log('HeartMatch PWA installed successfully!');
    const banner = document.getElementById('hmPwaBanner');
    if (banner) banner.remove();
  });

  // ==========================================
  // 4. WEB PUSH NOTIFICATIONS (LOCK SCREEN)
  // ==========================================
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  window.HM_Push = {
    async subscribe() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
      const token = localStorage.getItem('token');
      if (!token) return false;

      try {
        const reg = await navigator.serviceWorker.ready;
        const keyRes = await fetch('/api/notifications/vapid-key');
        const { publicKey } = await keyRes.json();
        if (!publicKey) return false;

        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return false;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        await fetch('/api/notifications/push-subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ subscription: sub })
        });
        console.log('✅ Lock screen Web Push notifications enabled!');
        return true;
      } catch (e) {
        console.warn('Push subscription failed:', e);
        return false;
      }
    }
  };

  // Auto-subscribe if notification permission is already granted
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && localStorage.getItem('token')) {
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.HM_Push.subscribe().catch(() => {});
      }, 3000);
    });
  }
})();
