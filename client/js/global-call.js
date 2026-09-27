(() => {
  "use strict";
  if (!localStorage.getItem("token") || window.__hmGlobalCall) return;
  window.__hmGlobalCall = true;

  const state = {
    socket: null,
    incoming: null,
    peer: null,
    localStream: null,
    remoteStream: null,
    target: null,
    mode: "audio",
    ice: [],
    active: false,
    caller: null
  };

  const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"
  }[c]));

  function injectStyles() {
    if (document.getElementById("hm-global-call-styles")) return;
    const style = document.createElement("style");
    style.id = "hm-global-call-styles";
    style.textContent = `
      #hm-global-call { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; }
      #hm-global-call .hm-incoming-backdrop,
      #hm-global-call .hm-call-screen {
        position: fixed; inset: 0; z-index: 2147483001;
        opacity: 0; visibility: hidden; pointer-events: none;
        transition: opacity .22s ease, visibility .22s ease;
      }
      #hm-global-call .hm-incoming-backdrop.open,
      #hm-global-call .hm-call-screen.open {
        opacity: 1; visibility: visible; pointer-events: auto;
      }
      #hm-global-call .hm-incoming-backdrop {
        display: flex; align-items: center; justify-content: center;
        padding: 20px; background: rgba(4,3,10,.72);
        backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
      }
      #hm-global-call .hm-incoming-card {
        width: min(390px, calc(100vw - 32px));
        padding: 34px 25px 25px; position: relative; overflow: hidden;
        text-align: center; color: #fff;
        border: 1px solid rgba(255,255,255,.13); border-radius: 30px;
        background: linear-gradient(145deg, rgba(36,28,52,.98), rgba(17,15,27,.99));
        box-shadow: 0 35px 100px rgba(0,0,0,.62);
        transform: translateY(8px) scale(.97); transition: transform .22s ease;
      }
      #hm-global-call .hm-incoming-backdrop.open .hm-incoming-card { transform: translateY(0) scale(1); }
      #hm-global-call .hm-call-glow {
        position:absolute; width:210px; height:210px; border-radius:50%;
        left:50%; top:-130px; transform:translateX(-50%);
        background:rgba(255,77,141,.25); filter:blur(28px);
      }
      #hm-global-call .hm-call-avatar {
        width:92px; height:92px; margin:0 auto 15px; display:block;
        border-radius:50%; object-fit:cover; border:3px solid rgba(255,255,255,.16);
        box-shadow:0 0 0 10px rgba(255,77,141,.07), 0 18px 45px rgba(0,0,0,.35);
        background:#2b2039; color:#fff;
      }
      #hm-global-call .hm-call-label { color:#a9a1b8; font-size:12px; text-transform:uppercase; letter-spacing:.12em; font-weight:800; }
      #hm-global-call .hm-incoming-card h2 { margin:7px 0 2px; color:#fff; font-size:22px; }
      #hm-global-call .hm-incoming-card p { margin:0; color:#91899e; font-size:12px; }
      #hm-global-call .hm-incoming-actions { display:flex; justify-content:center; gap:60px; margin-top:27px; }
      #hm-global-call .hm-call-action {
        width:58px; height:58px; border:0; border-radius:50%; color:#fff; font-size:22px;
        box-shadow:0 12px 28px rgba(0,0,0,.25); cursor:pointer;
      }
      #hm-global-call .hm-call-action.decline { background:#e53d62; }
      #hm-global-call .hm-call-action.accept { background:#35c987; }
      #hm-global-call .hm-call-action:hover { transform:translateY(-3px) scale(1.05); }
      #hm-global-call .hm-call-action-labels { display:flex; justify-content:center; gap:70px; color:#777083; font-size:10px; margin-top:8px; }
      #hm-global-call .hm-call-screen {
        display:flex; flex-direction:column; background:rgba(5,4,10,.98); color:#fff;
        transform:scale(1.01);
      }
      #hm-global-call .hm-call-screen.open { transform:scale(1); }
      #hm-global-call .hm-call-head { display:flex; justify-content:space-between; align-items:center; padding:18px 22px; background:rgba(255,255,255,.035); border-bottom:1px solid rgba(255,255,255,.08); }
      #hm-global-call .hm-call-head small { color:#8e8999; }
      #hm-global-call .hm-mini { border:0; background:rgba(255,255,255,.07); color:#fff; width:38px; height:38px; border-radius:50%; cursor:pointer; }
      #hm-global-call .hm-call-stage { flex:1; min-height:0; position:relative; display:flex; align-items:center; justify-content:center; padding:18px; }
      #hm-global-call #hmRemoteVideo { width:100%; height:100%; max-width:1100px; object-fit:cover; border-radius:22px; background:#101016; }
      #hm-global-call #hmLocalVideo { position:absolute; right:34px; bottom:34px; width:190px; aspect-ratio:4/3; object-fit:cover; border-radius:16px; border:2px solid rgba(255,255,255,.2); box-shadow:0 15px 40px rgba(0,0,0,.45); }
      #hm-global-call .hm-audio-avatar { width:125px; height:125px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:52px; background:linear-gradient(135deg,#ff4d8d,#8b5cf6); box-shadow:0 0 0 16px rgba(139,92,246,.08),0 30px 80px rgba(0,0,0,.4); }
      #hm-global-call .hm-call-controls { display:flex; justify-content:center; gap:13px; padding:18px; }
      #hm-global-call .hm-call-control { width:54px; height:54px; border:0; border-radius:50%; background:#302b3c; color:#fff; font-size:20px; cursor:pointer; }
      #hm-global-call .hm-call-control:hover { transform:translateY(-2px); background:#40394d; }
      #hm-global-call .hm-call-control.end { background:#e53d62; }
      @media (max-width:700px) {
        #hm-global-call .hm-incoming-card { border-radius:25px; }
        #hm-global-call #hmLocalVideo { width:120px; right:20px; bottom:20px; }
        #hm-global-call .hm-call-stage { padding:10px; }
      }
    `;
    document.head.appendChild(style);
  }

  function injectUI() {
    injectStyles();
    if (document.getElementById("hm-global-call")) return;
    const el = document.createElement("div");
    el.id = "hm-global-call";
    el.innerHTML = `
      <div class="hm-incoming-backdrop" id="hmIncoming">
        <div class="hm-incoming-card">
          <div class="hm-call-glow"></div>
          <img id="hmIncomingAvatar" class="hm-call-avatar" alt="">
          <div class="hm-call-label">Incoming <span id="hmIncomingMode">audio</span> call</div>
          <h2 id="hmIncomingName">Someone</h2>
          <p id="hmIncomingId"></p>
          <div class="hm-incoming-actions">
            <button id="hmDecline" class="hm-call-action decline">✕</button>
            <button id="hmAccept" class="hm-call-action accept">✓</button>
          </div>
          <div class="hm-call-action-labels"><span>Decline</span><span>Accept</span></div>
        </div>
      </div>
      <div class="hm-call-screen" id="hmCallScreen">
        <div class="hm-call-head">
          <div><div id="hmCallName">HeartMatch call</div><small id="hmCallStatus">Connecting…</small></div>
          <button id="hmCallMin" class="hm-mini">—</button>
        </div>
        <div class="hm-call-stage">
          <div id="hmAudioAvatar" class="hm-audio-avatar">❤️</div>
          <video id="hmRemoteVideo" autoplay playsinline></video>
          <video id="hmLocalVideo" autoplay muted playsinline></video>
          <audio id="hmRemoteAudio" autoplay></audio>
        </div>
        <div class="hm-call-controls">
          <button id="hmMute" class="hm-call-control">🎙️</button>
          <button id="hmCamera" class="hm-call-control">📷</button>
          <button id="hmEnd" class="hm-call-control end">☎</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    bindUI();
  }

  function bindUI() {
    document.getElementById("hmAccept").onclick = accept;
    document.getElementById("hmDecline").onclick = decline;
    document.getElementById("hmEnd").onclick = () => cleanup(true);
    document.getElementById("hmMute").onclick = () => {
      const t = state.localStream?.getAudioTracks()[0]; if (!t) return;
      t.enabled = !t.enabled;
      document.getElementById("hmMute").textContent = t.enabled ? "🎙️" : "🔇";
    };
    document.getElementById("hmCamera").onclick = () => {
      const t = state.localStream?.getVideoTracks()[0]; if (!t) return;
      t.enabled = !t.enabled;
      document.getElementById("hmCamera").textContent = t.enabled ? "📷" : "🚫";
    };
  }

  async function loadSocketIO() {
    if (window.io) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/socket.io/socket.io.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function callerInfo(id) {
    try {
      const r = await fetch("/api/person/" + encodeURIComponent(id), {
        headers: { Authorization: "Bearer " + localStorage.getItem("token") }
      });
      const d = await r.json();
      return d.user || {};
    } catch { return {}; }
  }

  async function showIncoming(data) {
    if (state.active || state.incoming) return;
    state.incoming = data;
    state.caller = await callerInfo(data.from);
    document.getElementById("hmIncomingName").textContent = state.caller.name || "HeartMatch user";
    document.getElementById("hmIncomingId").textContent = state.caller.uniqueId ? "@" + state.caller.uniqueId : "";
    document.getElementById("hmIncomingMode").textContent = data.mode === "video" ? "video" : "audio";
    const av = document.getElementById("hmIncomingAvatar");
    av.src = state.caller.profileImage || "";
    av.style.display = state.caller.profileImage ? "block" : "flex";
    document.getElementById("hmIncoming").classList.add("open");
  }

  async function rtcConfig() {
    const r = await fetch("/api/turn-config", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
    const d = await r.json();
    return d.iceServers || [{urls:"stun:stun.l.google.com:19302"}];
  }

  function hideIncoming() {
    document.getElementById("hmIncoming")?.classList.remove("open");
  }

  function showCall(status) {
    document.getElementById("hmCallName").textContent = state.caller?.name || "HeartMatch call";
    document.getElementById("hmCallStatus").textContent = status || "Connecting…";
    document.getElementById("hmCallScreen").classList.add("open");
    document.body.classList.add("hm-call-active");
  }

  async function setupPeer() {
    state.peer = new RTCPeerConnection({ iceServers: await rtcConfig() });
    state.remoteStream = new MediaStream();
    const remoteVideo = document.getElementById("hmRemoteVideo");
    const remoteAudio = document.getElementById("hmRemoteAudio");
    state.peer.ontrack = async e => {
      if (!e.track) return;
      state.remoteStream.addTrack(e.track);
      if (e.track.kind === "video") {
        remoteVideo.srcObject = state.remoteStream;
        document.getElementById("hmAudioAvatar").style.display = "none";
        try { await remoteVideo.play(); } catch {}
      } else {
        remoteAudio.srcObject = state.remoteStream;
        try { await remoteAudio.play(); } catch {}
      }
    };
    state.peer.onicecandidate = e => {
      if (e.candidate && state.socket?.connected && state.target) {
        state.socket.emit("callIce", { to: state.target, candidate: e.candidate });
      }
    };
    state.peer.onconnectionstatechange = () => {
      const s = state.peer?.connectionState;
      if (s === "connected") document.getElementById("hmCallStatus").textContent = "Connected";
      if (s === "failed") document.getElementById("hmCallStatus").textContent = "Connection failed";
      if (s === "disconnected") document.getElementById("hmCallStatus").textContent = "Reconnecting…";
    };
    return state.peer;
  }

  async function accept() {
    const data = state.incoming;
    if (!data) return;
    try {
      hideIncoming();
      state.target = String(data.from);
      state.mode = data.mode === "video" ? "video" : "audio";
      state.localStream = await navigator.mediaDevices.getUserMedia({ audio:true, video:state.mode === "video" });
      showCall("Connecting…");
      const peer = await setupPeer();
      state.localStream.getTracks().forEach(t => peer.addTrack(t, state.localStream));
      const local = document.getElementById("hmLocalVideo");
      local.srcObject = state.localStream;
      local.style.display = state.mode === "video" ? "block" : "none";
      document.getElementById("hmCamera").style.display = state.mode === "video" ? "block" : "none";
      await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
      for (const c of state.ice.splice(0)) {
        try { await peer.addIceCandidate(c); } catch {}
      }
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      state.socket.emit("callAnswer", { to: state.target, answer: peer.localDescription });
      state.active = true;
      state.incoming = null;
    } catch (e) {
      console.error("Incoming call accept error:", e);
      await cleanup(false);
      alert(e?.message || "Could not answer the call.");
    }
  }

  function decline() {
    const from = state.incoming?.from;
    hideIncoming();
    if (from && state.socket?.connected) state.socket.emit("callReject", {to: from});
    state.incoming = null;
    state.ice = [];
  }

  async function cleanup(notify) {
    const target = state.target;
    if (notify && target && state.socket?.connected) state.socket.emit("callEnd", {to:target});
    try { state.peer?.close(); } catch {}
    state.peer = null;
    state.localStream?.getTracks().forEach(t => t.stop());
    state.localStream = null;
    state.remoteStream = null;
    state.target = null;
    state.active = false;
    state.incoming = null;
    state.ice = [];
    hideIncoming();
    const rv = document.getElementById("hmRemoteVideo");
    const lv = document.getElementById("hmLocalVideo");
    const ra = document.getElementById("hmRemoteAudio");
    if (rv) rv.srcObject = null;
    if (lv) lv.srcObject = null;
    if (ra) ra.srcObject = null;
    document.getElementById("hmCallScreen")?.classList.remove("open");
    document.body.classList.remove("hm-call-active");
  }

  function wireSocket() {
    state.socket = io({
      auth: { token: localStorage.getItem("token") },
      transports: ["websocket", "polling"]
    });
    state.socket.on("callOffer", data => {
      if (!data?.from || !data?.offer || state.active || state.incoming) return;
      showIncoming(data);
    });
    state.socket.on("callIce", async data => {
      if (!data?.from || !data?.candidate) return;
      if (!state.target || String(data.from) !== String(state.target)) return;
      const candidate = new RTCIceCandidate(data.candidate);
      if (!state.peer?.remoteDescription) state.ice.push(candidate);
      else {
        try { await state.peer.addIceCandidate(candidate); } catch {}
      }
    });
    state.socket.on("callAnswer", () => {});
    state.socket.on("callReject", () => {});
    state.socket.on("callEnd", data => {
      if (data?.from && String(data.from) === String(state.target)) cleanup(false);
    });
    state.socket.on("connect_error", e => console.warn("HeartMatch call socket:", e.message));
  }

  async function boot() {
    injectUI();
    try {
      await loadSocketIO();
      wireSocket();
    } catch (e) { console.warn("HeartMatch call UI could not start:", e); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();