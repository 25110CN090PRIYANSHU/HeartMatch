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
      // Styling is handled entirely by notification-badge.css so the count
      // remains centered inside the red circle.
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
      const response = await fetch("/api/notifications/unread-count", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });

      if (!response.ok) return;

      const data = await response.json();
      render(data.unreadCount || 0);
    } catch (error) {
      if (lastCount === null) render(0);
    }
  }

  function init() {
    render(0);
    refresh();

    // Refresh every 30 seconds
    window.setInterval(refresh, 30000);

    // If an existing socket is on the page, listen for push notifications
    if (window.socket && typeof window.socket.on === "function") {
      window.socket.on("newNotification", refresh);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
