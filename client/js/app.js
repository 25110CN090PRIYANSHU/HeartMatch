const HM = {
  token: () => localStorage.getItem("token"),
  user: () => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  },
  auth: () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` }),
  requireAuth() {
    if (!this.token()) location.href = "login.html";
  },
  logout() {
    localStorage.clear();
    location.href = "login.html";
  },
  esc(v) {
    return String(v ?? "").replace(
      /[&<>'"]/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[c],
    );
  },
  img(u) {
    if (!u) return "";
    // Always use the persistent GridFS photo endpoint when a photo file exists.
    // This avoids stale /uploads URLs after Render restarts or redeploys.
    if (u.profileImageFileId && (u.userId || u._id)) {
      return `/api/profile/photo/${encodeURIComponent(u.userId || u._id)}`;
    }
    return u.profileImage || "";
  },
  async api(url, opt = {}) {
    const headers = {
      ...(opt.headers || {}),
      ...(this.token() ? this.auth() : {}),
    };
    if (
      opt.body &&
      typeof opt.body !== "string" &&
      !(opt.body instanceof FormData)
    ) {
      headers["Content-Type"] = "application/json";
      opt.body = JSON.stringify(opt.body);
    }
    const r = await fetch(url, { ...opt, headers });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) {
      localStorage.clear();
      location.href = "login.html";
    }
    return { r, d };
  },
};
