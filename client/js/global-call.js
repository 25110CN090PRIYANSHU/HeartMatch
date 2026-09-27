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

  function injectUI() {
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