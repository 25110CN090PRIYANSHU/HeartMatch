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
    return u?.profileImage || "";
  },
  apiBase: (window.HEARTMATCH_API_URL || "").replace(/\/$/, ""),
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
    const target = this.apiBase ? `${this.apiBase}${url}` : url;
    const r = await fetch(target, { ...opt, headers });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) {
      localStorage.clear();
      location.href = "login.html";
    }
    return { r, d };
  },
};
