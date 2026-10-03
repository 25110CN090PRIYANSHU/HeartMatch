/* HeartMatch notification badge
 * Shows the number of unread notifications on every notification link.
 * The count comes from /api/notifications so it stays synced with MongoDB.
 */
(function () {
  "use strict";

  const token = localStorage.getItem("token");
  if (!token) return;

  const MAX_DISPLAY = 99;
  let lastCount = null;

  function getLinks() {
    return Array.from(document.querySelectorAll('a[href$="notifications.html"], a[href*="/notifications.html"]'));
  }

  function ensureBadge(link) {
    link.classList.add("hm-notification-link");
    let badge = link.querySelector(".hm-notification-badge");

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "hm-notification-badge";
      badge.setAttribute("aria-hidden", "true");
      link.appendChild(badge);
    }

    return badge;
  }

  function render(count) {
    const unread = Math.max(0, Number(count) || 0);
    const display = unread > MAX_DISPLAY ? `${MAX_DISPLAY}+` : String(unread);

    getLinks().forEach((link) => {
      const badge = ensureBadge(link);
      badge.textContent = display;
      badge.classList.toggle("hm-badge-visible", unread > 0);
      // Keep the number visible even if another stylesheet affects span text.
      badge.style.setProperty("color", "#ffffff", "important");
      badge.style.setProperty("font-size", "11px", "important");
      badge.style.setProperty("line-height", "16px", "important");
      badge.style.setProperty("text-align", "center", "important");
      badge.style.setProperty("visibility", "visible", "important");
      link.setAttribute(
        "aria-label",
        unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
      );
      link.title = unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "Notifications";
    });

    lastCount = unread;
  }

  async function refresh() {
    if (!localStorage.getItem("token")) return;

    try {
      const response = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        cache: "no-store"
      });

      if (!response.ok) return;

      const data = await response.json();
      render(data.unreadCount || 0);
    } catch (error) {
      // Do not interrupt the current page if the notification request fails.
      if (lastCount === null) render(0);
    }
  }

  function init() {
    render(0);
    refresh();

    // Keep the red count current while the user is using another page.
    window.setInterval(refresh, 10000);

    // Useful for pages that already have Socket.IO loaded.
    if (typeof window.io === "function") {
      try {
        const socket = window.io({ auth: { token } });
        socket.on("newNotification", function () {
          refresh();
        });
      } catch (_) {
        // Polling above is the fallback.
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
