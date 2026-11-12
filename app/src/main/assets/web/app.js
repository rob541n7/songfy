/* Songfy — antarmuka web untuk musicdl (turunan Alunan, berjalan di dalam aplikasi Android) */
(() => {
  "use strict";

  // ------------------------------------------------------------------ helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const enc = encodeURIComponent;
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem("alunan." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("alunan." + k, JSON.stringify(v)); } catch { /* storage tidak tersedia */ } },
  };
  const hue = (str) => { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const norm = (s) => String(s || "").toLowerCase().replace(/[\W_]+/g, " ").trim();
  const uid = () => Math.random().toString(36).slice(2, 10);
  const postJSON = (url, body, method = "POST") => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const I = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    note: '<svg viewBox="0 0 24 24"><path d="M10 3h10v4h-8v10a4 4 0 1 1-2-3.46z"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 3v6.6l2.3-2.3 1.4 1.4L12 17.4l-4.7-4.7 1.4-1.4 2.3 2.3V7z"/></svg>',
    done: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.3 13.6 6.7-6.7L16 7.5l-5.3 5.3L8 10.1l-1.4 1.4z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 3v4.6l3.2 3.2-1.4 1.4-3.8-3.8V7z"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M17 3l4 4-4 4V8h-2.1l-3 4 3 4H17v-3l4 4-4 4v-3h-3.1l-3.4-4.6L7.1 18H3v-2h3.1l3.9-5.2L6.1 6H3V4h4.1l3.4 4.6L13.9 4H17z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><path d="M10.5 3a7.5 7.5 0 0 1 5.96 12.06l4.74 4.74-1.4 1.4-4.74-4.74A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 21 10.6 19.7C5.4 15 2 11.9 2 8.1 2 5 4.4 2.6 7.5 2.6c1.7 0 3.4.8 4.5 2.1a6 6 0 0 1 4.5-2.1C19.6 2.6 22 5 22 8.1c0 3.8-3.4 6.9-8.6 11.6zm0-2.7c4.8-4.3 8-7.2 8-10.2 0-2-1.5-3.5-3.5-3.5-1.5 0-3 1-3.6 2.4h-1.8C10.5 5.6 9 4.6 7.5 4.6 5.5 4.6 4 6.1 4 8.1c0 3 3.2 5.9 8 10.2z"/></svg>',
    heartOn: '<svg viewBox="0 0 24 24"><path d="M12 21 10.6 19.7C5.4 15 2 11.9 2 8.1 2 5 4.4 2.6 7.5 2.6c1.7 0 3.4.8 4.5 2.1a6 6 0 0 1 4.5-2.1C19.6 2.6 22 5 22 8.1c0 3.8-3.4 6.9-8.6 11.6z"/></svg>',
    more: '<svg viewBox="0 0 24 24"><path d="M5 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M3 5h14v2H3zm0 4h14v2H3zm0 4h8v2H3zm11 0 7 4-7 4z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M4 6h12v2H4zm0 5h12v2H4zm0 5h7v2H4zm10-1 6 3-6 3z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 1h4v2H4V4h4zM5 8h14l-1 13H6zm4 2v9h2v-9zm4 0v9h2v-9z"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="m14.1 5.1 4.8 4.8L8.8 20H4v-4.8zm1.4-1.4 1.6-1.6a1.5 1.5 0 0 1 2.1 0l2.7 2.7a1.5 1.5 0 0 1 0 2.1l-1.6 1.6z"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10.6 13.4a1 1 0 0 0 1.4 1.4l4.3-4.3a3 3 0 0 0-4.2-4.2L10.4 8l1.4 1.4 1.7-1.7a1 1 0 0 1 1.4 1.4zm2.8-2.8a1 1 0 0 0-1.4-1.4l-4.3 4.3a3 3 0 0 0 4.2 4.2l1.7-1.7-1.4-1.4-1.7 1.7a1 1 0 0 1-1.4-1.4z"/></svg>',
    upload: '<svg viewBox="0 0 24 24"><path d="M11 16V7.8L7.4 11.4 6 10l6-6 6 6-1.4 1.4L13 7.8V16zm-6 3h14v2H5z"/></svg>',
    user: '<svg viewBox="0 0 24 24"><path d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 12c5 0 9 2.5 9 6v2H3v-2c0-3.5 4-6 9-6z"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7-1.4-1.4 5.6-5.6-5.6-5.6z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7 1.4-1.4-5.6-5.6 5.6-5.6z"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><path d="m13.6 2 .5 2.6a8 8 0 0 1 1.8 1l2.5-.9 1.6 2.8-2 1.7a8 8 0 0 1 0 2l2 1.7-1.6 2.8-2.5-.9a8 8 0 0 1-1.8 1l-.5 2.6h-3.2l-.5-2.6a8 8 0 0 1-1.8-1l-2.5.9-1.6-2.8 2-1.7a8 8 0 0 1 0-2l-2-1.7 1.6-2.8 2.5.9a8 8 0 0 1 1.8-1l.5-2.6zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3z"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg>',
    lyrics: '<svg viewBox="0 0 24 24"><path d="M4 4h16v12H7.2L4 19.2zm2 2v8.4l.4-.4H18V6zm2 2h8v2H8zm0 3h5v2H8z"/></svg>',
    volHigh: '<path d="M3 9h4l5-5v16l-5-5H3zm11.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>',
    volLow: '<path d="M5 9h4l5-5v16l-5-5H5zm11.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/>',
    volMute: '<path d="M3 9h4l5-5v16l-5-5H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/>',
    dlSmall: '<svg viewBox="0 0 24 24"><path d="M12 16 6 10l1.4-1.4 3.6 3.6V3h2v9.2l3.6-3.6L18 10zM5 19h14v2H5z"/></svg>',
  };
  const eq = '<span class="eq"><i></i><i></i><i></i><i></i></span>';

  function art(url, extra = "") {
    const img = url ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
    return `<div class="art ${extra}">${I.note}${img}</div>`;
  }

  function toast(msg, isErr = false) {
    const el = document.createElement("div");
    el.className = "toast" + (isErr ? " err" : "");
    el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  // ------------------------------------------------------------------ state
  const S = {
    sources: [],
    enabled: new Set(store.get("sources", null) || []),
    search: null,
    library: [],
    folder: "",
    jobs: new Map(),
    dlPending: [],
    lists: {},
    listMeta: {},
    queue: [],
    original: [],
    index: -1,
    shuffle: store.get("shuffle", false),
    repeat: store.get("repeat", "off"),
    lyric: { key: null, lines: [], synced: false, loading: false, active: -1 },
    tab: "now",
    recent: store.get("recent", []),
    view: "home",
    data: { likes: [], playlists: [], history: [] },
    live: new Set(), // id hasil pencarian yang masih ada di server sesi ini
    settings: Object.assign({ theme: "purple", eqOn: false, eqPreset: "flat", eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], vis: true, visStyle: "bars" }, store.get("settings", {})),
  };
  // Di aplikasi Android, lagu diputar mesin audio native (bit-perfect ke DAC USB, gapless).
  // Objek pengganti di bawah meniru elemen <audio> sehingga sisa kode tidak perlu tahu bedanya.
  const NATIVE = window.AlunanNative || null;
  const audio = NATIVE ? createNativeAudio(NATIVE) : $("#audio");

  function createNativeAudio(bridge) {
    const ev = new EventTarget();
    const st = { paused: true, time: 0, dur: NaN, vol: 1, src: "", error: null };
    const fire = (type) => ev.dispatchEvent(new Event(type));
    const setPaused = (p) => { if (st.paused !== p) { st.paused = p; fire(p ? "pause" : "play"); } };
    window.alunanNativeEvent = (type, data = {}) => {
      switch (type) {
        case "timeupdate": st.time = data.time; break;
        case "loadedmetadata": st.dur = data.duration > 0 ? data.duration : NaN; break;
        case "playing": setPaused(false); break;
        case "pause": setPaused(true); return;
        case "ended": st.paused = true; break;
        case "gapless": st.time = 0; break;
        case "error": st.error = data.message; setPaused(true); break;
        case "output": case "devices": onNativeInfo(type, data); return;
      }
      fire(type);
    };
    return {
      get paused() { return st.paused; },
      get currentTime() { return st.time; },
      set currentTime(v) { st.time = v; bridge.seek(v * 1000); fire("timeupdate"); },
      get duration() { return st.dur; },
      get volume() { return st.vol; },
      set volume(v) { st.vol = v; bridge.setVolume(v); },
      get src() { return st.src; },
      set src(u) { st.src = new URL(u, location.href).href; st.time = 0; st.dur = NaN; st.error = null; bridge.load(st.src, JSON.stringify(nativeMeta(current()))); },
      get error() { return st.error; },
      play() { setPaused(false); bridge.play(); return Promise.resolve(); },
      pause() { bridge.pause(); setPaused(true); },
      preload(u, t) { bridge.preload(u ? new URL(u, location.href).href : "", JSON.stringify(nativeMeta(t))); },
      addEventListener: ev.addEventListener.bind(ev),
    };
  }
  // bit depth & sample rate dari server, agar mesin native bisa langsung memilih mode DAC yang tepat
  const nativeMeta = (t) => ({ title: t?.title || "", bits: t?.q?.bits || 0, rate: t?.q?.rate || 0 });
  const current = () => S.queue[S.index] || null;

  const fromSearch = (s) => {
    S.live.add(s.id);
    return {
      key: "s:" + s.id, kind: "search", id: s.id, source: s.source, title: s.title, artist: s.artist, album: s.album,
      duration: s.duration, cover: s.cover, lyricUrl: s.hasLyric ? `/api/lyric/${s.id}` : null,
      sourceLabel: s.sourceLabel, ext: s.ext, size: s.size, streamable: s.streamable, downloaded: s.downloaded, file: s.file, q: s.q || null,
    };
  };
  const fromLib = (f) => ({
    key: "f:" + f.file, kind: "library", source: "library", file: f.file, title: f.title, artist: f.artist || "Tidak diketahui", album: f.album,
    duration: f.duration, cover: `/api/library/cover/${enc(f.file)}`, lyricUrl: f.hasLyric ? `/api/library/lyric/${enc(f.file)}` : null,
    sourceLabel: "Pustaka", ext: f.ext, size: f.size, streamable: true, downloaded: true, q: f.q || null,
  });
  // bentuk yang disimpan di userdata.json (suka, playlist, riwayat)
  const toRef = (t) => ({
    key: t.key, id: t.id || null, source: t.source || null, sourceLabel: t.sourceLabel, title: t.title, artist: t.artist,
    album: t.album || "", duration: t.duration || 0, cover: t.kind === "library" ? null : t.cover || null, ext: t.ext || "", file: t.file || null, q: t.q || null,
  });
  const fromRef = (r) => {
    const lib = r.file && S.library.find((l) => l.file === r.file);
    if (lib) return { ...lib, key: r.key, refKey: r.key };
    return { ...r, kind: r.source === "library" ? "library" : "saved", refKey: r.key, downloaded: false, streamable: true, lyricUrl: r.id && S.live.has(r.id) ? `/api/lyric/${r.id}` : null };
  };
  const sameSong = (a, b) => a.key === b.key || (!!a.file && a.file === b.file) || (norm(a.title) === norm(b.title) && norm(a.artist) === norm(b.artist));

  // ------------------------------------------------------------------ data pengguna
  let saveTimer = null;
  function saveData() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => postJSON("/api/userdata", S.data, "PUT").catch(() => toast("Gagal menyimpan data", true)), 400);
  }
  const isLiked = (t) => !!t && S.data.likes.some((l) => sameSong(l, t));
  function toggleLike(t) {
    if (!t) return;
    if (isLiked(t)) { S.data.likes = S.data.likes.filter((l) => !sameSong(l, t)); toast("Dihapus dari Lagu Disukai"); }
    else { S.data.likes.unshift(toRef(t)); toast("Ditambahkan ke Lagu Disukai"); }
    saveData();
    refreshHearts();
    renderSidebar();
    if (S.view === "liked") renderLiked();
  }
  function refreshHearts() {
    $$("[data-like]").forEach((b) => {
      const row = b.closest("[data-list]");
      const t = row ? S.lists[row.dataset.list]?.[+row.dataset.i] : null;
      if (!t) return;
      const on = isLiked(t);
      b.classList.toggle("on", on);
      b.innerHTML = on ? I.heartOn : I.heart;
      b.title = on ? "Hapus dari Lagu Disukai" : "Simpan ke Lagu Disukai";
    });
    updatePlayerButtons();
  }
  function pushHistory(t) {
    S.data.history = [toRef(t), ...S.data.history.filter((h) => !sameSong(h, t))].slice(0, 60);
    saveData();
    if (S.view === "recent") renderRecent();
  }

  function createPlaylist(name, desc = "", tracks = []) {
    const pl = { id: uid(), name: name || `Playlist Saya #${S.data.playlists.length + 1}`, desc, created: Date.now(), tracks: tracks.map(toRef) };
    S.data.playlists.unshift(pl);
    saveData();
    renderSidebar();
    return pl;
  }
  function addToPlaylist(pl, tracks) {
    let added = 0;
    for (const t of tracks) if (!pl.tracks.some((x) => sameSong(x, t))) { pl.tracks.push(toRef(t)); added++; }
    saveData();
    renderSidebar();
    toast(added ? `Ditambahkan ke “${pl.name}”` : `Sudah ada di “${pl.name}”`);
    if (S.view === "playlist") render();
  }

  // ------------------------------------------------------------------ data loading
  async function loadSources() {
    S.sources = await fetch("/api/sources").then((r) => r.json());
    const valid = new Set(S.sources.map((s) => s.name));
    S.enabled = new Set([...S.enabled].filter((n) => valid.has(n)));
    if (!S.enabled.size) S.sources.filter((s) => s.default).forEach((s) => S.enabled.add(s.name));
  }

  async function loadLibrary() {
    const data = await fetch("/api/library").then((r) => r.json()).catch(() => ({ songs: [], folder: "" }));
    S.library = data.songs.map(fromLib);
    S.folder = data.folder;
    renderSidebar();
    if (["library", "home", "liked", "playlist", "recent"].includes(S.view)) render();
  }

  async function loadUserData() {
    const d = await fetch("/api/userdata").then((r) => r.json()).catch(() => null);
    if (d) S.data = { likes: d.likes || [], playlists: d.playlists || [], history: d.history || [] };
  }

  // ------------------------------------------------------------------ routing
  function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
  window.addEventListener("hashchange", render);
  $("#backBtn").onclick = () => history.back();
  $("#fwdBtn").onclick = () => history.forward();

  function render() {
    const [view, ...rest] = (location.hash.slice(1) || "home").split("/");
    const param = decodeURIComponent(rest.join("/"));
    S.view = view;
    closeMenu();
    $$(".nav-item, #tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.view === view || (view === "search" && a.dataset.view === "search") || (["library", "liked", "recent", "playlist", "downloads"].includes(view) && a.dataset.view === "collection")));
    $$("#sideLibrary [href]").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === location.hash));
    const v = $("#view");
    v.className = "view";
    if (view === "search") {
      if (param && (!S.search || S.search.q !== param)) runSearch(param);
      $("#searchInput").value = param || "";
      if (!param) S.search = null;
      renderSearch();
    } else if (view === "library") renderLibrary();
    else if (view === "liked") renderLiked();
    else if (view === "recent") renderRecent();
    else if (view === "playlist") renderPlaylist(param);
    else if (view === "downloads") renderDownloads();
    else if (view === "settings") renderSettings();
    else if (view === "collection") renderCollectionIndex();
    else renderHome();
    $("#main").scrollTop = 0;
  }

  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#searchInput").value.trim();
    if (!q) return go("#search");
    if (S.search && S.search.q === q) runSearch(q); // tekan Enter lagi = cari ulang
    go("#search/" + enc(q));
  });
  $("#searchInput").addEventListener("focus", () => { if (S.view !== "search") go("#search" + ($("#searchInput").value.trim() ? "/" + enc($("#searchInput").value.trim()) : "")); });
  $(".kbd").addEventListener("mousedown", (e) => { e.preventDefault(); openPalette(); });

  $("#main").addEventListener("scroll", () => $("#topbar").classList.toggle("solid", $("#main").scrollTop > 40));

  // ------------------------------------------------------------------ kualitas audio (Hi-Res, bit depth, sample rate)
  const LOSSLESS = new Set(["flac", "alac", "wav", "ape", "aiff", "wv"]);
  function qualityInfo(t) {
    const q = t?.q || {};
    const ext = String(t?.ext || "").toLowerCase();
    const codec = String(q.codec || ext).toLowerCase();
    const lossless = LOSSLESS.has(codec) || (codec !== "aac" && codec !== "mp3" && LOSSLESS.has(ext));
    const hires = lossless && ((q.bits || 0) >= 24 || (q.rate || 0) > 48000);
    const khz = q.rate ? `${+(q.rate / 1000).toFixed(1)} kHz` : "";
    const spec = q.bits && q.rate ? `${q.bits}-bit / ${khz}` : khz;
    const name = codec === "alac" ? "ALAC" : codec === "aac" ? "AAC" : (ext || codec).toUpperCase();
    const tier = hires ? "Hi-Res Lossless" : lossless ? "Lossless" : q.kbps ? "Lossy" : "";
    return { lossless, hires, spec, name, tier, kbps: q.kbps, channels: q.channels, known: !!q.bits || (!lossless && !!q.kbps), estimated: q.estimated };
  }
  function qualityBadge(t) {
    const qi = qualityInfo(t);
    if (!qi.name && !qi.hires) return "";
    const tip = [qi.tier, qi.name, qi.spec, qi.kbps ? `±${qi.kbps} kbps` : ""].filter(Boolean).join(" · ");
    return qi.hires ? `<span class="badge hires" title="${esc(tip)}">Hi-Res</span>` : `<span class="badge q" title="${esc(tip)}">${esc(qi.name)}</span>`;
  }
  // teks ringkas seperti "FLAC · 24-bit / 96 kHz"
  function qualityLine(t) {
    const qi = qualityInfo(t);
    const parts = [qi.name, qi.spec || (qi.kbps && !qi.lossless ? `${qi.kbps} kbps` : "")].filter(Boolean);
    return parts.length ? `${qi.hires ? '<span class="badge hires">Hi-Res</span>' : qi.lossless ? '<span class="badge q">Lossless</span>' : ""}<span>${esc(parts.join(" · "))}</span>` : "";
  }

  // baca header file di sumbernya untuk mengetahui bit depth & sample rate asli (maks. 3 sekaligus)
  const probeQueue = [];
  let probing = 0;
  function probeQuality(t, urgent = false) {
    if (!t || t.kind === "library" || !t.id || t._probed || qualityInfo(t).known) return;
    t._probed = true;
    urgent ? probeQueue.unshift(t) : probeQueue.push(t);
    pumpProbe();
  }
  function pumpProbe() {
    while (probing < 3 && probeQueue.length) {
      const t = probeQueue.shift();
      probing++;
      fetch(`/api/quality/${t.id}`).then((r) => (r.ok ? r.json() : null)).then((q) => { if (q) { t.q = q; refreshQuality(t); } })
        .catch(() => {}).finally(() => { probing--; pumpProbe(); });
    }
  }
  function refreshQuality(t) {
    $$("[data-qb]").forEach((el) => { const r = rowTrack(el); if (r?.t && r.t.key === t.key) { r.t.q = t.q; el.innerHTML = qualityBadge(r.t); } });
    const cur = current();
    if (cur && cur.key === t.key) { cur.q = t.q; updateQualityChip(); if (S.tab === "now") renderPanel(); }
  }
  function qualityProps(t) {
    const qi = qualityInfo(t);
    const ch = qi.channels === 1 ? "Mono" : qi.channels === 2 ? "Stereo" : qi.channels ? `${qi.channels} saluran` : "";
    return [
      qi.tier && ["Kualitas", qi.hires ? `<span class="badge hires">Hi-Res</span> Lossless` : esc(qi.tier)],
      qi.name && ["Format", esc(qi.name)],
      ["Bit depth", qi.spec.includes("bit") ? esc(qi.spec.split(" / ")[0]) : qi.lossless ? '<span style="color:var(--muted)">memeriksa…</span>' : "–"],
      qi.spec && ["Sample rate", esc(qi.spec.split(" / ").pop())],
      qi.kbps && ["Bitrate", `${qi.estimated ? "±" : ""}${qi.kbps.toLocaleString("id-ID")} kbps`],
      ch && ["Saluran", ch],
      NATIVE && S.nativeOutput && ["Output", `${esc(nativeOutputLine())}${S.nativeOutput.bitPerfect ? ' <span class="badge bp">Bit-perfect</span>' : ""}`],
    ].filter(Boolean).map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join("");
  }
  // ---- status output mesin native (perangkat, format, bit-perfect)
  function onNativeInfo(type, data) {
    if (type === "output") S.nativeOutput = data;
    updateQualityChip();
    if (S.tab === "now") renderPanel();
    if (S.view === "settings") renderNativeOut();
  }
  function nativeOutputLine() {
    const o = S.nativeOutput;
    if (!NATIVE || !o) return "";
    return `${o.device} · ${o.encoding} / ${+(o.rate / 1000).toFixed(1)} kHz`;
  }
  function renderNativeOut() {
    const box = $("#nativeOutBody");
    if (!box || !NATIVE) return;
    let info = {};
    try { info = JSON.parse(NATIVE.info()); } catch { /* mesin belum siap */ }
    const o = S.nativeOutput || info.output || {};
    const sw = (on, dis) => `<button class="switch ${on ? "on" : ""}" ${dis ? "disabled style='opacity:.4'" : ""}></button>`;
    const status = !o.rate ? "Belum ada lagu yang diputar"
      : o.bitPerfect ? `<span class="badge bp">Bit-perfect</span> ${esc(o.encoding)} / ${+(o.rate / 1000).toFixed(1)} kHz langsung ke ${esc(o.device)}`
      : `${esc(o.encoding)} / ${+(o.rate / 1000).toFixed(1)} kHz · diolah mixer Android`;
    const why = !info.bitPerfectSupported ? `HP ini Android API ${info.sdk}. Bit-perfect butuh Android 14 (API 34) ke atas.`
      : !info.usb ? "Colokkan DAC USB untuk memakai mode bit-perfect."
      : o.rate && info.bitPerfectEnabled && !o.bitPerfect ? `DAC tidak menawarkan mode bit-perfect untuk ${+(o.rate / 1000).toFixed(1)} kHz, jadi suara diolah mixer Android.` : "";
    box.innerHTML = `
      <div class="set-row" style="border-top:0"><div class="lbl"><b>Perangkat output</b><span>${esc(info.usb || "Speaker / headset bawaan HP")}</span></div></div>
      <div class="set-row"><div class="lbl"><b>Bit-perfect ke DAC USB</b><span>Kirim sampel asli file tanpa resampling, efek, atau volume aplikasi. Equalizer otomatis nonaktif. Atur volume dari tombol HP.</span></div><span id="bpSwitch">${sw(info.bitPerfectEnabled, !info.bitPerfectSupported)}</span></div>
      <div class="set-row"><div class="lbl"><b>Sedang dikirim</b><span>${status}${why ? `<br><span style="color:var(--dim)">${esc(why)}</span>` : ""}</span></div></div>
      ${info.usb ? `<div class="set-row"><div class="lbl"><b>Kemampuan DAC</b><span>Sample rate: ${esc(info.usbRates || "–")} Hz<br>Format: ${esc(info.usbEncodings || "–")}${info.bitPerfectFormats ? `<br>Bit-perfect: ${esc(info.bitPerfectFormats)}` : ""}</span></div></div>` : ""}`;
    $("#bpSwitch .switch").onclick = () => {
      if (!info.bitPerfectSupported) return;
      NATIVE.setBitPerfect(!info.bitPerfectEnabled);
      toast(info.bitPerfectEnabled ? "Bit-perfect dimatikan (berlaku mulai lagu berikutnya)" : "Bit-perfect dinyalakan (berlaku mulai lagu berikutnya)");
      renderNativeOut();
    };
  }
  function updateQualityChip() {
    const t = current();
    const html = t ? qualityLine(t) + (S.nativeOutput?.bitPerfect ? '<span class="badge bp">Bit-perfect</span>' : "") : "";
    $("#plQuality").innerHTML = html;
    $("#plQuality").hidden = !html;
    if (karaokeOpen()) $("#kQuality").innerHTML = html;
  }

  // ------------------------------------------------------------------ track list rendering
  function dlButton(t) {
    if (t.kind === "library") return "";
    const job = t.id && S.jobs.get(t.id);
    if (t.downloaded || job?.status === "done") return `<button class="dl-btn done" data-dl title="Sudah di pustaka">${I.done}</button>`;
    if ((job && (job.status === "queued" || job.status === "downloading")) || S.dlPending.includes(t)) {
      const pct = job?.total ? Math.min(1, job.received / job.total) : 0;
      const C = 2 * Math.PI * 9;
      return `<button class="dl-btn busy" data-dl title="${job ? "Mengunduh…" : "Menunggu giliran…"}"><svg class="ring ${pct ? "" : "indet"}" viewBox="0 0 22 22"><circle class="bg" cx="11" cy="11" r="9"/><circle class="fg" cx="11" cy="11" r="9" stroke-dasharray="${C}" stroke-dashoffset="${pct ? C * (1 - pct) : C * 0.75}"/></svg></button>`;
    }
    return `<button class="dl-btn" data-dl title="${job?.status === "error" ? "Gagal, coba lagi" : "Unduh ke pustaka"}">${I.down}</button>`;
  }
  const likeBtn = (t) => `<button class="row-like ${isLiked(t) ? "on" : ""}" data-like title="${isLiked(t) ? "Hapus dari Lagu Disukai" : "Simpan ke Lagu Disukai"}">${isLiked(t) ? I.heartOn : I.heart}</button>`;

  function trackTable(listId, tracks, { compact = false, showSource = true, playlistId = null } = {}) {
    S.lists[listId] = tracks;
    S.listMeta[listId] = { playlistId };
    const head = `<div class="tr-head"><div class="col-idx">#</div><div>Judul</div><div class="col-album">Album</div><div class="col-src">${showSource ? "Sumber" : "Format"}</div><div class="col-dur">${I.clock}</div><div class="col-act"></div></div>`;
    const rows = tracks.map((t, i) => `
      <div class="tr" data-list="${listId}" data-i="${i}" data-key="${esc(t.key)}">
        <div class="col-idx"><span class="idx-num">${i + 1}</span><span class="idx-play">${I.play}</span></div>
        <div class="col-main">${art(t.cover)}<div class="t-text"><div class="t-title">${esc(t.title)}</div><div class="t-artist">${esc(t.artist)}</div></div></div>
        <div class="col-album">${esc(t.album)}</div>
        <div class="col-src">${showSource ? `<span class="badge">${esc(t.sourceLabel)}</span>` : ""}<span data-qb>${qualityBadge(t)}</span></div>
        <div class="col-dur">${t.duration ? fmt(t.duration) : "–"}</div>
        <div class="col-act">${likeBtn(t)}${dlButton(t)}<button class="row-more" data-more title="Opsi lainnya">${I.more}</button></div>
      </div>`).join("");
    return `<div class="tracks${compact ? " compact" : ""}">${compact ? "" : head}${rows}</div>`;
  }

  const rowTrack = (el) => {
    const row = el.closest("[data-list]");
    return row ? { row, list: S.lists[row.dataset.list], i: +row.dataset.i, t: S.lists[row.dataset.list]?.[+row.dataset.i], meta: S.listMeta[row.dataset.list] || {} } : null;
  };

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#menu") && !e.target.closest("[data-more]")) closeMenu();
    const like = e.target.closest("[data-like]");
    if (like) { e.stopPropagation(); const r = rowTrack(like); if (r?.t) toggleLike(r.t); return; }
    const dl = e.target.closest("[data-dl]");
    if (dl) { e.stopPropagation(); const r = rowTrack(dl); if (r?.t) startDownload(r.t); return; }
    const more = e.target.closest("[data-more]");
    if (more) { e.stopPropagation(); const r = rowTrack(more); if (r?.t) openTrackMenu(r, more.getBoundingClientRect()); return; }
    const row = e.target.closest(".tr, .quick[data-list], .tile[data-list], .top-result");
    if (row && row.dataset.list) {
      const list = S.lists[row.dataset.list], i = +row.dataset.i;
      const t = list[i], cur = current();
      if (cur && cur.key === t.key && S.original === list) togglePlay();
      else playList(list, i);
    }
  });
  document.addEventListener("contextmenu", (e) => {
    const row = e.target.closest(".tr[data-list]");
    if (!row) return;
    e.preventDefault();
    const r = rowTrack(row);
    if (r?.t) openTrackMenu(r, { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY });
  });

  function markPlaying() {
    const cur = current();
    $$("[data-key]").forEach((el) => {
      const on = !!cur && (el.dataset.key === cur.key || (!!cur.file && el.dataset.key === "f:" + cur.file));
      el.classList.toggle("playing", on);
      const idx = el.querySelector(".idx-num");
      if (idx) idx.innerHTML = on ? eq : String(+el.dataset.i + 1);
      const fab = el.querySelector(".fab");
      if (fab) { fab.innerHTML = on && !audio.paused ? I.pause : I.play; fab.classList.toggle("show", on); }
    });
    $$("[data-plid]").forEach((el) => el.classList.toggle("playing", !!cur && S.playingFrom === el.dataset.plid));
    document.body.classList.toggle("paused", audio.paused);
  }

  // ------------------------------------------------------------------ menu konteks
  const menu = $("#menu");
  function closeMenu() { menu.hidden = true; $$(".tr.menu-open").forEach((r) => r.classList.remove("menu-open")); }
  function showMenu(items, rect) {
    menu.innerHTML = items.map((it, k) => it === "-" ? "<hr>" : it.title ? `<div class="menu-title">${esc(it.title)}</div>` : `<button data-mi="${k}">${it.icon || ""}<span>${esc(it.label)}</span>${it.sub ? I.chev : ""}</button>`).join("");
    menu.hidden = false;
    $$("[data-mi]", menu).forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const it = items[+b.dataset.mi];
      if (it.sub) return showMenu(it.sub(), rect);
      closeMenu();
      it.run();
    }));
    const w = menu.offsetWidth, h = menu.offsetHeight;
    let x = rect.right - w, y = rect.bottom + 4;
    if (x < 8) x = Math.min(rect.left, innerWidth - w - 8);
    if (y + h > innerHeight - 8) y = Math.max(8, rect.top - h - 4);
    menu.style.left = Math.max(8, x) + "px";
    menu.style.top = y + "px";
  }

  function playlistSubmenu(tracks) {
    return () => [
      { label: "Kembali", icon: I.back, sub: null, run: () => {} },
      "-",
      { label: "Playlist baru", icon: I.plus, run: async () => {
        const v = await formModal({ title: "Playlist baru", ok: "Buat", fields: [{ name: "name", label: "Nama", value: tracks.length === 1 ? tracks[0].title : "" }] });
        if (v) { const pl = createPlaylist(v.name.trim()); addToPlaylist(pl, tracks); }
      } },
      ...(S.data.playlists.length ? [{ title: "Playlist kamu" }] : []),
      ...S.data.playlists.map((pl) => ({ label: pl.name, icon: I.list, run: () => addToPlaylist(pl, tracks) })),
    ];
  }

  function openTrackMenu({ row, list, i, t, meta }, rect) {
    row?.classList?.add("menu-open");
    const items = [
      { label: "Putar berikutnya", icon: I.next, run: () => playNext(t) },
      { label: "Tambahkan ke antrean", icon: I.list, run: () => addToQueue([t]) },
      "-",
      { label: isLiked(t) ? "Hapus dari Lagu Disukai" : "Simpan ke Lagu Disukai", icon: isLiked(t) ? I.heartOn : I.heart, run: () => toggleLike(t) },
      { label: "Tambahkan ke playlist", icon: I.plus, sub: playlistSubmenu([t]) },
    ];
    if (meta.playlistId) items.push({ label: "Hapus dari playlist ini", icon: I.trash, run: () => removeFromPlaylist(meta.playlistId, t) });
    if (list === S.lists.recent) items.push({ label: "Hapus dari riwayat", icon: I.trash, run: () => { S.data.history = S.data.history.filter((h) => !sameSong(h, t)); saveData(); renderRecent(); } });
    items.push("-");
    if (t.kind !== "library" && !t.downloaded) items.push({ label: "Unduh ke pustaka", icon: I.dlSmall, run: () => startDownload(t) });
    items.push({ label: `Cari lagu lain dari ${t.artist}`, icon: I.user, run: () => go("#search/" + enc(t.artist)) });
    // tombol "Kembali" di submenu membuka menu utama lagi
    const sub = items.find((x) => typeof x === "object" && x.sub);
    const origSub = sub.sub;
    sub.sub = () => { const s = origSub(); s[0].sub = () => items; return s; };
    showMenu(items, rect);
  }

  function removeFromPlaylist(plId, t) {
    const pl = S.data.playlists.find((p) => p.id === plId);
    if (!pl) return;
    pl.tracks = pl.tracks.filter((x) => !sameSong(x, t));
    saveData();
    renderSidebar();
    renderPlaylist(plId);
    toast(`Dihapus dari “${pl.name}”`);
  }

  // ------------------------------------------------------------------ modal
  const modal = $("#modal");
  function closeModal() { modal.hidden = true; modal.innerHTML = ""; }
  modal.addEventListener("mousedown", (e) => { if (e.target === modal) modal._cancel?.(); });

  function formModal({ title, text = "", fields = [], ok = "Simpan", cancel = "Batal", danger = false }) {
    return new Promise((resolve) => {
      modal.innerHTML = `<form class="modal">
        <h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ""}
        ${fields.map((f) => `<label class="field"><span>${esc(f.label)}</span>${f.type === "textarea"
          ? `<textarea name="${f.name}" placeholder="${esc(f.placeholder || "")}">${esc(f.value || "")}</textarea>`
          : `<input name="${f.name}" value="${esc(f.value || "")}" placeholder="${esc(f.placeholder || "")}" ${f.required ? "required" : ""}>`}</label>${f.hint ? `<div class="hint">${f.hint}</div>` : ""}`).join("")}
        <div class="modal-actions"><button type="button" class="btn ghost" data-cancel>${esc(cancel)}</button><button class="btn primary" ${danger ? 'style="background:var(--danger);color:#fff"' : ""}>${esc(ok)}</button></div>
      </form>`;
      modal.hidden = false;
      const form = $("form", modal);
      const done = (v) => { closeModal(); resolve(v); };
      modal._cancel = () => done(null);
      $("[data-cancel]", modal).onclick = () => done(null);
      form.onsubmit = (e) => { e.preventDefault(); done(Object.fromEntries(new FormData(form))); };
      (form.querySelector("input, textarea") || form.querySelector(".btn.primary")).focus();
    });
  }

  async function newPlaylistFlow() {
    const v = await formModal({ title: "Buat playlist", ok: "Buat", fields: [
      { name: "name", label: "Nama", placeholder: `Playlist Saya #${S.data.playlists.length + 1}` },
      { name: "desc", label: "Deskripsi (opsional)", type: "textarea", placeholder: "Tambahkan deskripsi" },
    ] });
    if (!v) return;
    const pl = createPlaylist(v.name.trim(), v.desc.trim());
    go("#playlist/" + pl.id);
  }

  async function editPlaylistFlow(pl) {
    const v = await formModal({ title: "Edit detail", fields: [
      { name: "name", label: "Nama", value: pl.name, required: true },
      { name: "desc", label: "Deskripsi", type: "textarea", value: pl.desc },
    ] });
    if (!v) return;
    pl.name = v.name.trim() || pl.name;
    pl.desc = v.desc.trim();
    saveData();
    renderSidebar();
    renderPlaylist(pl.id);
  }

  async function deletePlaylistFlow(pl) {
    const v = await formModal({ title: "Hapus playlist?", text: `“${esc(pl.name)}” akan dihapus dari Pustaka Anda. Lagu yang sudah diunduh tidak ikut terhapus.`, ok: "Hapus", danger: true });
    if (!v) return;
    S.data.playlists = S.data.playlists.filter((p) => p.id !== pl.id);
    saveData();
    renderSidebar();
    go("#library");
  }

  function importPlaylistFlow() {
    modal.innerHTML = `<form class="modal">
      <h3>Impor playlist</h3>
      <p>Tempel tautan playlist dari platform lain. Lagu-lagunya akan dijadikan playlist baru di Songfy.</p>
      <label class="field"><span>URL playlist</span><input name="url" required placeholder="https://music.163.com/#/playlist?id=… atau https://y.qq.com/…"></label>
      <div class="hint">Didukung: NetEase, QQ Music, Kuwo, Kugou, Migu, Qianqian, JOOX, YouTube Music, SoundCloud, Spotify, JioSaavn, Deezer, Bilibili, dan lainnya yang didukung musicdl. Prosesnya bisa beberapa menit untuk playlist besar.</div>
      <div id="impStatus"></div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-cancel>Batal</button><button class="btn primary" id="impGo">Impor</button></div>
    </form>`;
    modal.hidden = false;
    const form = $("form", modal);
    let cancelled = false;
    modal._cancel = () => { cancelled = true; closeModal(); };
    $("[data-cancel]", modal).onclick = modal._cancel;
    $("input", form).focus();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const url = form.url.value.trim();
      $("#impGo").disabled = true;
      $("#impStatus").innerHTML = `<p style="margin:0">Membaca playlist…</p><div class="progress-line"><div></div></div>`;
      const res = await postJSON("/api/import", { url });
      let job = await res.json();
      if (!res.ok) { $("#impStatus").innerHTML = `<p style="color:var(--danger)">${esc(job.error)}</p>`; $("#impGo").disabled = false; return; }
      while (job.status === "running" && !cancelled) {
        await new Promise((r) => setTimeout(r, 1500));
        job = await fetch(`/api/import/${job.id}`).then((r) => r.json());
      }
      if (cancelled) return;
      if (job.status !== "done") { $("#impStatus").innerHTML = `<p style="color:var(--danger)">${esc(job.error || "Gagal mengimpor")}</p>`; $("#impGo").disabled = false; return; }
      closeModal();
      const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "URL"; } })();
      const pl = createPlaylist(`Impor ${job.source || host}`, `Diimpor dari ${url}`, job.songs.map(fromSearch));
      toast(`${job.songs.length} lagu diimpor`);
      go("#playlist/" + pl.id);
    };
  }

  // ------------------------------------------------------------------ unggah file lokal
  const fileInput = $("#fileInput");
  fileInput.addEventListener("change", () => { if (fileInput.files.length) uploadFiles(fileInput.files); fileInput.value = ""; });
  async function uploadFiles(files) {
    const fd = new FormData();
    [...files].forEach((f) => fd.append("files", f));
    toast(`Mengunggah ${files.length} file…`);
    const res = await fetch("/api/library/upload", { method: "POST", body: fd }).then((r) => r.json()).catch(() => null);
    if (!res) return toast("Gagal mengunggah", true);
    if (res.saved.length) toast(`${res.saved.length} lagu ditambahkan ke pustaka`);
    if (res.skipped.length) toast(`${res.skipped.length} file dilewati (bukan file audio)`, true);
    loadLibrary();
  }
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  window.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $("#dropzone").hidden = false; });
  window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("dragleave", (e) => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; $("#dropzone").hidden = true; } });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $("#dropzone").hidden = true;
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  });

  $("#libAdd").addEventListener("click", (e) => {
    e.stopPropagation();
    showMenu([
      { label: "Buat playlist baru", icon: I.plus, run: newPlaylistFlow },
      { label: "Impor playlist dari URL", icon: I.link, run: importPlaylistFlow },
      { label: "Unggah file musik", icon: I.upload, run: () => fileInput.click() },
    ], e.currentTarget.getBoundingClientRect());
  });

  // ------------------------------------------------------------------ views: home
  const GENRES = [
    ["Pop Indonesia", "#e13300"], ["Lagu Galau", "#8d67ab"], ["Dangdut", "#e8115b"], ["K-Pop", "#148a08"],
    ["Lo-fi", "#503750"], ["Akustik", "#bc5900"], ["Rock", "#e91429"], ["Jazz", "#1e3264"],
    ["Anime", "#ba5d07"], ["Top Hits", "#477d95"], ["Mandarin Pop", "#d84000"], ["Indie", "#608108"],
  ];
  function greeting() {
    const h = new Date().getHours();
    return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 19 ? "Selamat sore" : "Selamat malam";
  }
  const genreTiles = () => `<div class="browse">${GENRES.map(([g, c]) => `<a class="genre" style="background:${c}" href="#search/${enc(g)}">${esc(g)}</a>`).join("")}</div>`;

  function plCover(pl, cls = "") {
    const covers = pl.tracks.map(fromRef).map((t) => t.cover).filter(Boolean);
    if (covers.length >= 4) return `<div class="pl-cover-art ${cls}"><div class="mosaic">${covers.slice(0, 4).map((c) => art(c)).join("")}</div></div>`;
    if (covers.length) return `<div class="pl-cover-art ${cls}">${art(covers[0])}</div>`;
    return `<div class="pl-cover-art ${cls}" style="background:linear-gradient(135deg,hsl(${hue(pl.id)} 50% 30%),hsl(${hue(pl.id) + 40} 50% 18%))">${I.note}</div>`;
  }

  function renderHome() {
    const lib = S.library;
    const recent = S.data.history.map(fromRef);
    const h = hue(greeting());
    let html = `<div class="hero-bg" style="background:linear-gradient(hsl(${h} 45% 28%), transparent)"></div><h1 class="greeting">${greeting()}</h1>`;
    // kotak cepat: Lagu Disukai, playlist, lalu lagu yang baru diputar
    const quick = [`<a class="quick" href="#liked"><div class="art" style="background:linear-gradient(135deg,#450af5,#8e8ee5);color:#fff">${I.heartOn}</div><div class="q-title">Lagu Disukai</div></a>`];
    S.data.playlists.slice(0, 3).forEach((pl) => quick.push(`<a class="quick" href="#playlist/${pl.id}" data-plid="${pl.id}">${plCover(pl, "art")}<div class="q-title">${esc(pl.name)}</div></a>`));
    S.lists.homeRecent = recent;
    recent.slice(0, 8 - quick.length).forEach((t, i) => quick.push(`<div class="quick" data-list="homeRecent" data-i="${i}" data-key="${esc(t.key)}">${art(t.cover)}<div class="q-title">${esc(t.title)}</div><button class="fab">${I.play}</button></div>`));
    if (quick.length > 1 || lib.length) html += `<div class="quick-grid">${quick.join("")}</div>`;
    if (recent.length) {
      html += `<div class="section-head"><h2 class="section">Baru diputar</h2><a href="#recent">Tampilkan semua</a></div>
        <div class="cards row">${recent.slice(0, 10).map((t, i) => tileHTML("homeRecent", t, i)).join("")}</div>`;
    }
    if (S.data.playlists.length) {
      html += `<div class="section-head"><h2 class="section">Playlist kamu</h2><a href="#library">Tampilkan semua</a></div>
        <div class="cards row">${S.data.playlists.slice(0, 10).map((pl) => `<a class="tile" href="#playlist/${pl.id}" data-plid="${pl.id}"><div class="art-wrap">${plCover(pl, "art")}</div><div class="tile-title">${esc(pl.name)}</div><div class="tile-sub">Playlist · ${pl.tracks.length} lagu</div></a>`).join("")}</div>`;
    }
    if (S.recent.length) {
      html += `<div class="section-head"><h2 class="section">Pencarian terakhir</h2><a href="#" id="clearRecent">Hapus</a></div>
        <div class="chips">${S.recent.map((q) => `<a class="chip" href="#search/${enc(q)}">${I.search.replace("<svg", '<svg style="width:16px;height:16px"')}${esc(q)}</a>`).join("")}</div>`;
    }
    if (lib.length) {
      S.lists.homeLib = lib;
      html += `<div class="section-head"><h2 class="section">Baru diunduh</h2><a href="#library">Tampilkan semua</a></div>
        <div class="cards row">${lib.slice(0, 10).map((t, i) => tileHTML("homeLib", t, i)).join("")}</div>`;
    }
    if (!lib.length && !recent.length) {
      html += `<div class="empty" style="padding:48px 24px 8px">${I.note}<h3>Mulai dengan mencari lagu</h3>
        <p>Cari judul lagu atau nama penyanyi. Putar langsung, simpan ke playlist, atau unduh ke pustakamu.</p>
        <a class="cta" href="#search">Cari lagu</a></div>`;
    }
    html += `<h2 class="section">Jelajahi</h2>${genreTiles()}`;
    $("#view").innerHTML = html;
    $("#clearRecent")?.addEventListener("click", (e) => { e.preventDefault(); S.recent = []; store.set("recent", []); renderHome(); });
    markPlaying();
  }
  const tileHTML = (listId, t, i) => `<div class="tile" data-list="${listId}" data-i="${i}" data-key="${esc(t.key)}"><div class="art-wrap">${art(t.cover)}<button class="fab">${I.play}</button></div>
    <div class="tile-title">${esc(t.title)}</div><div class="tile-sub">${esc(t.artist)}</div></div>`;

  // ------------------------------------------------------------------ views: search
  function runSearch(q) {
    const token = Symbol(q);
    S.search = { q, token, results: new Map(), order: [], filter: "all" };
    S.recent = [q, ...S.recent.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 10);
    store.set("recent", S.recent);
    for (const s of S.sources.filter((x) => S.enabled.has(x.name))) {
      S.search.results.set(s.name, { label: s.label, status: "loading", songs: [] });
      fetch(`/api/search?q=${enc(q)}&source=${enc(s.name)}`)
        .then((r) => r.json())
        .then((d) => ({ status: d.error ? "error" : "done", songs: (d.songs || []).map(fromSearch), error: d.error, seconds: d.seconds }))
        .catch((err) => ({ status: "error", songs: [], error: String(err) }))
        .then((res) => {
          if (!S.search || S.search.token !== token) return;
          Object.assign(S.search.results.get(s.name), res);
          if (res.songs.length) S.search.order.push(s.name);
          if (S.view === "search") renderSearchResults();
          res.songs.forEach((t) => probeQuality(t));
        });
    }
  }

  const sourceToggles = () => `<div class="filter-label">Sumber pencarian</div><div class="chips" data-src-toggles>${S.sources.map((s) =>
    `<button class="chip ${S.enabled.has(s.name) ? "on" : ""}" data-src="${s.name}">${esc(s.label)}</button>`).join("")}</div>`;
  function bindSourceToggles(root = document) {
    $$("[data-src-toggles] [data-src]", root).forEach((b) => b.addEventListener("click", () => {
      const n = b.dataset.src;
      if (S.enabled.has(n)) { if (S.enabled.size === 1) return toast("Minimal satu sumber harus aktif"); S.enabled.delete(n); }
      else S.enabled.add(n);
      store.set("sources", [...S.enabled]);
      b.classList.toggle("on", S.enabled.has(n));
    }));
  }

  function renderSearch() {
    const v = $("#view");
    if (!S.search) {
      v.innerHTML = `${sourceToggles()}<p style="color:var(--dim);font-size:12px;margin-top:8px">Sumber yang aktif dicari bersamaan. Tiap sumber butuh 2–60 detik karena tautan audionya diperiksa satu per satu.</p>
        <h2 class="section">Jelajahi semua</h2>${genreTiles()}`;
      bindSourceToggles(v);
      return;
    }
    v.innerHTML = `<div id="filterBar"></div><div id="srcPanel" hidden>${sourceToggles()}</div><div id="results"></div>`;
    bindSourceToggles(v);
    renderSearchResults();
  }

  function renderSearchResults() {
    const sr = S.search;
    if (!sr || !$("#results")) return;
    const entries = [...sr.results.entries()];
    const loading = entries.filter(([, r]) => r.status === "loading").length;
    const chip = (key, label, r) => {
      const status = !r ? "" : r.status === "loading" ? '<span class="spin"></span>' : r.status === "error" ? '<span class="count">gagal</span>' : `<span class="count">${r.songs.length}</span>`;
      return `<button class="chip ${sr.filter === key ? "on" : ""} ${r?.status === "error" ? "err" : ""}" data-filter="${key}" title="${esc(r?.error || "")}">${esc(label)} ${status}</button>`;
    };
    $("#filterBar").innerHTML = `<div class="chips" style="margin:4px 0 20px">${chip("all", "Semua", null)}${entries.map(([k, r]) => chip(k, r.label, r)).join("")}
      <button class="chip" id="srcSettings" title="Atur sumber">⚙ Sumber</button></div>`;
    $$("#filterBar [data-filter]").forEach((b) => b.addEventListener("click", () => { sr.filter = b.dataset.filter; renderSearchResults(); }));
    $("#srcSettings").addEventListener("click", () => { const p = $("#srcPanel"); p.hidden = !p.hidden; });

    const pool = sr.filter === "all" ? sr.order.flatMap((k) => sr.results.get(k).songs) : sr.results.get(sr.filter)?.songs || [];
    const out = $("#results");
    if (!pool.length) {
      out.innerHTML = loading
        ? `<p style="color:var(--muted);margin-bottom:16px">Mencari “${esc(sr.q)}” di ${loading} sumber…</p>` +
          Array.from({ length: 6 }, () => `<div class="skel-row"><div class="skel" style="width:40px;height:40px"></div><div style="flex:1"><div class="skel" style="height:14px;width:40%"></div><div class="skel" style="height:12px;width:25%;margin-top:8px"></div></div></div>`).join("")
        : `<div class="empty">${I.search}<h3>Tidak ada hasil untuk “${esc(sr.q)}”</h3><p>Coba kata kunci lain, periksa ejaan, atau aktifkan sumber lain lewat ⚙ Sumber.</p></div>`;
      return;
    }
    const top = pool[0];
    S.lists.searchAll = pool;
    out.innerHTML = `
      <div class="search-grid">
        <section><h2 class="section" style="margin-top:0">Hasil teratas</h2>
          <div class="top-result" data-list="searchAll" data-i="0" data-key="${esc(top.key)}">
            ${art(top.cover)}
            <div class="tr-title">${esc(top.title)}</div>
            <div class="tr-sub"><span>${esc(top.artist)}</span><span class="pill">${esc(top.sourceLabel)}</span></div>
            <button class="fab">${I.play}</button>
          </div>
        </section>
        <section><h2 class="section" style="margin-top:0">Lagu</h2>${trackTable("searchTop", pool.slice(0, 4), { compact: true })}</section>
      </div>
      <h2 class="section">Semua hasil <span style="color:var(--muted);font-size:15px;font-weight:500">· ${pool.length} lagu${loading ? ` · ${loading} sumber masih mencari…` : ""}</span></h2>
      ${trackTable("searchAll", pool)}`;
    S.lists.searchTop = pool; // daftar ringkas memakai antrean yang sama dengan daftar lengkap
    markPlaying();
  }

  // ------------------------------------------------------------------ views: koleksi (pustaka, disukai, riwayat, playlist)
  function renderCollection({ listId, tracks, title, kind = "Playlist", desc = "", cover, color, meta = "", empty, showSource = true, playlistId = null, extraActions = "" }) {
    const total = tracks.reduce((a, t) => a + (t.duration || 0), 0);
    const v = $("#view");
    v.className = "view flush";
    const canDownload = tracks.some((t) => t.kind !== "library" && !t.downloaded);
    v.innerHTML = `
      <div class="hero-bg" style="background:linear-gradient(${color}, ${color}88 55%, transparent);height:420px"></div>
      <div class="pl-header">
        <div class="cover">${cover}</div>
        <div style="min-width:0"><div class="kind">${esc(kind)}</div><h1>${esc(title)}</h1>
        ${desc ? `<div class="desc">${esc(desc)}</div>` : ""}
        <div class="meta"><b>Anda</b> · ${tracks.length} lagu${total ? `, sekitar ${Math.round(total / 60)} menit` : ""}${meta}</div></div>
      </div>
      <div class="actionbar">
        <button class="big-play" id="colPlay" title="Putar">${I.play}</button>
        <button class="big-icon ${S.shuffle ? "on" : ""}" id="colShuffle" title="Putar acak">${I.shuffle}</button>
        ${canDownload ? `<button class="big-icon" id="colDownload" title="Unduh semua ke pustaka">${I.down}</button>` : ""}
        ${extraActions}
      </div>
      <div class="list-pad">${tracks.length ? trackTable(listId, tracks, { showSource, playlistId }) : empty}</div>`;
    $("#colPlay").onclick = () => tracks.length && (S.original === S.lists[listId] && current() ? togglePlay() : playList(tracks, 0, playlistId || listId));
    $("#colShuffle").onclick = () => { setShuffle(!S.shuffle); $("#colShuffle").classList.toggle("on", S.shuffle); };
    $("#colDownload")?.addEventListener("click", () => {
      const todo = tracks.filter((t) => t.kind !== "library" && !t.downloaded);
      todo.forEach((t) => queueDownload(t));
      toast(`${todo.length} lagu masuk antrean unduhan`);
    });
    markPlaying();
  }
  const coverIcon = (svg, bg) => `<div class="pl-cover-art" style="width:100%;height:100%;background:${bg};color:#fff">${svg.replace("<svg", '<svg style="width:40%;height:40%"')}</div>`;

  function renderLibrary() {
    renderCollection({
      listId: "library", tracks: S.library, title: "Lagu Unduhan", color: "#1f6b3e", showSource: false,
      cover: coverIcon(I.dlSmall, "linear-gradient(135deg,#0d7a3e,#1ed760)"),
      extraActions: `<span class="spacer"></span><button class="btn outline" id="libUpload">${"Unggah file"}</button>`,
      empty: `<div class="empty">${I.down}<h3>Belum ada lagu unduhan</h3><p>Unduh lagu dari hasil pencarian, atau seret file musik dari komputer ke jendela ini.</p><a class="cta" href="#search">Cari lagu</a></div>`,
    });
    $("#libUpload").onclick = () => fileInput.click();
    $("#view").insertAdjacentHTML("beforeend", `<div class="folder-note">Folder pustaka: ${esc(S.folder)}</div>`);
  }

  function renderLiked() {
    renderCollection({
      listId: "liked", tracks: S.data.likes.map(fromRef), title: "Lagu Disukai", color: "#5038a0",
      cover: coverIcon(I.heartOn, "linear-gradient(135deg,#450af5,#c4efd9)"),
      empty: `<div class="empty">${I.heart}<h3>Lagu yang kamu sukai akan muncul di sini</h3><p>Simpan lagu dengan menekan ikon hati.</p><a class="cta" href="#search">Cari lagu</a></div>`,
    });
  }

  function renderRecent() {
    renderCollection({
      listId: "recent", tracks: S.data.history.map(fromRef), title: "Baru Diputar", kind: "Riwayat", color: "#9a4a12",
      cover: coverIcon(I.clock, "linear-gradient(135deg,#b33b00,#f59b23)"),
      extraActions: S.data.history.length ? `<span class="spacer"></span><button class="btn outline" id="clearHist">Hapus riwayat</button>` : "",
      empty: `<div class="empty">${I.clock.replace(/style="[^"]*"/, "")}<h3>Belum ada riwayat</h3><p>Lagu yang kamu putar akan tercatat di sini.</p></div>`,
    });
    $("#clearHist")?.addEventListener("click", () => { S.data.history = []; saveData(); renderRecent(); });
  }

  function renderPlaylist(id) {
    const pl = S.data.playlists.find((p) => p.id === id);
    if (!pl) { $("#view").innerHTML = `<div class="empty"><h3>Playlist tidak ditemukan</h3><a class="cta" href="#library">Ke pustaka</a></div>`; return; }
    renderCollection({
      listId: "pl:" + pl.id, tracks: pl.tracks.map(fromRef), title: pl.name, desc: pl.desc, color: `hsl(${hue(pl.id)} 45% 32%)`,
      cover: plCover(pl), playlistId: pl.id,
      extraActions: `<button class="big-icon" id="plMore" title="Opsi lainnya">${I.more}</button>`,
      empty: `<div class="empty">${I.note}<h3>Playlist ini masih kosong</h3><p>Tambahkan lagu lewat menu ⋯ atau klik kanan pada lagu di hasil pencarian.</p><a class="cta" href="#search">Cari lagu</a></div>`,
    });
    $("#plMore").onclick = (e) => {
      e.stopPropagation();
      showMenu([
        { label: "Tambahkan ke antrean", icon: I.list, run: () => addToQueue(pl.tracks.map(fromRef)) },
        { label: "Edit detail", icon: I.edit, run: () => editPlaylistFlow(pl) },
        { label: "Hapus playlist", icon: I.trash, run: () => deletePlaylistFlow(pl) },
      ], e.currentTarget.getBoundingClientRect());
    };
  }

  // ------------------------------------------------------------------ views: downloads
  function renderDownloads() {
    const jobs = [...S.jobs.values()].sort((a, b) => b.started - a.started);
    const state = (j) => j.status === "done" ? '<span class="dl-state ok">Selesai</span>' : j.status === "error" ? `<span class="dl-state bad" title="${esc(j.error)}">Gagal</span>` :
      `<span class="dl-state">${j.total ? `${(j.received / 1048576).toFixed(1)} / ${(j.total / 1048576).toFixed(1)} MB` : j.status === "queued" ? "Menunggu…" : `${(j.received / 1048576).toFixed(1)} MB`}</span>`;
    const pending = S.dlPending.map((t) => `<div class="dl-item">${art(t.cover)}<div class="dl-info"><div class="t-title">${esc(t.title)}</div><div class="t-artist" style="color:var(--muted)">${esc(t.artist)}</div><div class="dl-bar"><div style="width:0"></div></div></div><span class="dl-state">Menunggu giliran</span></div>`).join("");
    $("#view").innerHTML = `<h1 class="greeting">Antrean Unduhan</h1>` + (jobs.length || S.dlPending.length ? pending + jobs.map((j) => {
      const pct = j.status === "done" ? 100 : j.total ? Math.min(100, (j.received / j.total) * 100) : 0;
      const active = j.status === "queued" || j.status === "downloading";
      return `<div class="dl-item">${art(j.cover)}<div class="dl-info"><div class="t-title">${esc(j.title)}</div><div class="t-artist" style="color:var(--muted)">${esc(j.artist)}${j.status === "error" ? " · " + esc(j.error) : ""}</div>
        <div class="dl-bar ${active && !pct ? "indet" : ""}"><div style="width:${pct}%;${j.status === "error" ? "background:var(--danger)" : ""}"></div></div></div>${state(j)}</div>`;
    }).join("") : `<div class="empty">${I.down}<h3>Belum ada unduhan</h3><p>Tekan ikon unduh di samping lagu pada hasil pencarian.</p></div>`);
  }

  // ------------------------------------------------------------------ views: settings
  const THEMES = { green: ["Hijau", "#1ed760"], blue: ["Biru", "#3d91f4"], purple: ["Ungu", "#a970ff"], pink: ["Merah muda", "#ff4fa3"], orange: ["Oranye", "#ff8a2b"], red: ["Merah", "#f2464f"], teal: ["Toska", "#1fc8c8"], mono: ["Monokrom", "#e8e8e8"] };
  const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const EQ_PRESETS = {
    flat: ["Datar", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    bass: ["Bass Boost", [6, 5, 4, 2, 0, 0, 0, 0, 0, 0]],
    treble: ["Treble Boost", [0, 0, 0, 0, 0, 1, 2, 4, 5, 6]],
    vocal: ["Vokal", [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1]],
    pop: ["Pop", [-1, 1, 3, 4, 2, 0, -1, -1, 1, 2]],
    rock: ["Rock", [4, 3, 2, 0, -1, -1, 1, 2, 3, 4]],
    jazz: ["Jazz", [3, 2, 1, 2, -1, -1, 0, 1, 2, 3]],
    edm: ["Elektronik", [5, 4, 1, 0, -2, 1, 0, 1, 4, 5]],
    acoustic: ["Akustik", [3, 3, 2, 1, 1, 1, 2, 3, 2, 1]],
    custom: ["Kustom", null],
  };
  const saveSettings = () => store.set("settings", S.settings);

  function applyTheme() {
    const hex = (THEMES[S.settings.theme] || THEMES.green)[1];
    const n = parseInt(hex.slice(1), 16);
    document.documentElement.style.setProperty("--accent", hex);
    document.documentElement.style.setProperty("--accent-rgb", `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`);
  }

  function renderSettings() {
    const st = S.settings;
    const sw = (on) => `<button class="switch ${on ? "on" : ""}"></button>`;
    $("#view").innerHTML = `<div class="settings">
      <h1 class="greeting">Pengaturan</h1>
      <div class="set-group"><h3>Tampilan</h3><p>Warna aksen untuk tombol, slider, dan lagu yang sedang diputar.</p>
        <div class="swatches">${Object.entries(THEMES).map(([k, [name, c]]) => `<button class="swatch ${st.theme === k ? "on" : ""}" data-theme="${k}" title="${name}" style="background:${c}"></button>`).join("")}</div>
      </div>
      ${NATIVE ? `<div class="set-group"><h3>Output audio</h3><p>Mesin audio native Songfy: dekode sendiri, gapless, dan bit-perfect ke DAC USB.</p><div id="nativeOutBody"></div></div>` : ""}
      <div class="set-group" id="eqGroup"><h3>Equalizer</h3><p>Atur karakter suara dengan 10 pita frekuensi.${NATIVE ? " Tidak berlaku saat bit-perfect aktif." : ""}</p>
        <div class="set-row"><div class="lbl"><b>Aktifkan equalizer</b></div><span data-set="eqOn">${sw(st.eqOn)}</span></div>
        <div class="set-row"><div class="lbl"><b>Preset</b></div><select class="select" id="eqPreset">${Object.entries(EQ_PRESETS).map(([k, [n]]) => `<option value="${k}" ${st.eqPreset === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div class="eq-wrap ${st.eqOn ? "" : "off"}" id="eqBands">${BANDS.map((f, i) => `<div class="eq-band"><span class="db" id="db${i}">${st.eqGains[i] > 0 ? "+" : ""}${st.eqGains[i]} dB</span><input type="range" min="-12" max="12" step="1" value="${st.eqGains[i]}" data-band="${i}"><span class="hz">${f >= 1000 ? f / 1000 + "k" : f}</span></div>`).join("")}</div>
      </div>
      <div class="set-group"><h3>Visualizer</h3><p>Animasi spektrum audio di panel Sedang Diputar dan mode layar penuh.</p>
        <div class="set-row"><div class="lbl"><b>Tampilkan visualizer</b></div><span data-set="vis">${sw(st.vis)}</span></div>
        <div class="set-row"><div class="lbl"><b>Gaya</b></div><select class="select" id="visStyle"><option value="bars" ${st.visStyle === "bars" ? "selected" : ""}>Batang</option><option value="wave" ${st.visStyle === "wave" ? "selected" : ""}>Gelombang</option><option value="mirror" ${st.visStyle === "mirror" ? "selected" : ""}>Cermin</option></select></div>
      </div>
      <div class="set-group"><h3>Pencarian</h3><p>Sumber yang dipakai saat mencari lagu.</p>${sourceToggles().replace('<div class="filter-label">Sumber pencarian</div>', "")}</div>
      <div class="set-group"><h3>Pustaka & data</h3>
        ${window.AlunanAndroid?.pickFolder ? `<div class="set-row"><div class="lbl"><b>Folder unduhan</b><span>${esc(S.folder)}</span>${S.folder === window.AlunanAndroid.defaultLibraryPath() ? `<br><span style="color:var(--dim)">Folder pribadi aplikasi: tersembunyi di file manager dan ikut terhapus jika Songfy dihapus.</span>` : ""}</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn outline" id="setFolder">Ubah folder</button>${S.folder !== window.AlunanAndroid.defaultLibraryPath() ? `<button class="btn outline" id="setFolderDefault">Default</button>` : ""}</div></div>` : ""}
        <div class="set-row"><div class="lbl"><b>Tambah lagu dari perangkat</b><span>Salin file musik ke folder unduhan</span></div><button class="btn outline" id="setUpload">Unggah file</button></div>
        <div class="set-row"><div class="lbl"><b>Impor playlist</b><span>Dari NetEase, QQ Music, Spotify, YouTube Music, dan lainnya</span></div><button class="btn outline" id="setImport">Impor</button></div>
        <div class="set-row"><div class="lbl"><b>Riwayat putar</b><span>${S.data.history.length} lagu tercatat</span></div><button class="btn outline" id="setClearHist">Hapus</button></div>
        <div class="set-row" hidden><div class="lbl"><b>Pasang sebagai aplikasi</b><span>Buka menu browser → “Instal Alunan” untuk membuatnya seperti aplikasi desktop</span></div></div>
      </div>
      ${window.AlunanAndroid?.server?.() ? `<div class="set-group"><h3>Aplikasi Android</h3>
        <div class="set-row" style="border-top:0"><div class="lbl"><b>Server</b><span>${esc(window.AlunanAndroid.server())}</span></div><button class="btn outline" id="setChangeServer">Ganti server</button></div></div>` : ""}
      <div class="set-group" id="remoteGroup"><h3>Akses dari HP</h3><p>Buka Alunan dari aplikasi Android atau browser HP lewat WiFi yang sama (atau Tailscale).</p><div id="remoteInfo" class="rp-note" style="padding:0">Memuat…</div></div>
      <div class="set-group"><h3>Pintasan keyboard</h3><div class="shortcuts">
        <kbd>Ctrl K</kbd><span>Palet perintah</span><kbd>/</kbd><span>Fokus ke pencarian</span><kbd>Spasi</kbd><span>Putar / jeda</span>
        <kbd>← / →</kbd><span>Mundur / maju 5 detik</span><kbd>Shift ← / →</kbd><span>Lagu sebelumnya / berikutnya</span>
        <kbd>↑ / ↓</kbd><span>Volume</span><kbd>L</kbd><span>Suka / batal suka lagu ini</span><kbd>F</kbd><span>Layar penuh dengan lirik</span>
        <kbd>M</kbd><span>Bisukan</span><kbd>S</kbd><span>Acak</span><kbd>R</kbd><span>Ulangi</span>
      </div></div>
    </div>`;
    const v = $("#view");
    $$("[data-theme]", v).forEach((b) => (b.onclick = () => { st.theme = b.dataset.theme; saveSettings(); applyTheme(); $$("[data-theme]", v).forEach((x) => x.classList.toggle("on", x === b)); }));
    $$("[data-set]", v).forEach((w) => (w.onclick = () => {
      const k = w.dataset.set;
      st[k] = !st[k];
      saveSettings();
      w.firstElementChild.classList.toggle("on", st[k]);
      if (k === "eqOn") { $("#eqBands").classList.toggle("off", !st.eqOn); applyEq(); }
      if (k === "vis") renderPanel();
    }));
    $("#eqPreset").onchange = (e) => {
      st.eqPreset = e.target.value;
      const g = EQ_PRESETS[st.eqPreset][1];
      if (g) st.eqGains = [...g];
      if (!st.eqOn) { st.eqOn = true; $('[data-set="eqOn"] .switch').classList.add("on"); $("#eqBands").classList.remove("off"); }
      saveSettings();
      applyEq();
      $$("[data-band]", v).forEach((r, i) => { r.value = st.eqGains[i]; $("#db" + i).textContent = `${st.eqGains[i] > 0 ? "+" : ""}${st.eqGains[i]} dB`; });
    };
    $$("[data-band]", v).forEach((r) => (r.oninput = () => {
      const i = +r.dataset.band;
      st.eqGains[i] = +r.value;
      st.eqPreset = "custom";
      $("#eqPreset").value = "custom";
      $("#db" + i).textContent = `${st.eqGains[i] > 0 ? "+" : ""}${st.eqGains[i]} dB`;
      saveSettings();
      applyEq();
    }));
    $("#visStyle").onchange = (e) => { st.visStyle = e.target.value; saveSettings(); };
    $("#setUpload").onclick = () => fileInput.click();
    $("#setFolder")?.addEventListener("click", () => window.AlunanAndroid.pickFolder());
    $("#setFolderDefault")?.addEventListener("click", () => changeLibraryFolder(window.AlunanAndroid.defaultLibraryPath()));
    $("#setImport").onclick = importPlaylistFlow;
    renderNativeOut();
    $("#setChangeServer")?.addEventListener("click", () => window.AlunanAndroid.changeServer());
    $("#setClearHist").onclick = () => { S.data.history = []; saveData(); renderSettings(); toast("Riwayat dihapus"); };
    bindSourceToggles(v);
    fetch("/api/remote-info").then((r) => r.json()).then((info) => {
      const box = $("#remoteInfo");
      if (!box) return;
      if (!info.pin) { $("#remoteGroup").hidden = true; return; } // dibuka dari HP: jangan tampilkan PIN
      box.innerHTML = info.enabled
        ? `<div class="set-row" style="border-top:0"><div class="lbl"><b>Alamat server</b><span>${info.urls.map((u) => `<code style="color:#fff">${esc(u)}</code>`).join("<br>") || "Tidak ditemukan jaringan"}</span></div></div>
           <div class="set-row"><div class="lbl"><b>PIN</b><span>Dimasukkan sekali di HP</span></div><b style="font-size:24px;letter-spacing:.2em;color:#fff">${esc(info.pin)}</b></div>`
        : `Akses dari HP sedang <b>mati</b>. Tutup Alunan, lalu jalankan <code style="color:#fff">start-hp.bat</code> (bukan start.bat). Alamat dan PIN akan muncul di sini.`;
    }).catch(() => {});
  }

  // ------------------------------------------------------------------ folder unduhan (aplikasi Android)
  window.onFolderPicked = (path, reason) => {
    if (path) return changeLibraryFolder(path);
    if (reason === "permission") toast("Izinkan \"Akses semua file\" untuk Songfy, lalu tekan Ubah folder lagi.");
    else if (reason === "invalid") toast("Folder itu tidak bisa dipakai. Pilih folder di penyimpanan internal atau kartu SD.", true);
    else if (reason === "unsupported") toast("HP ini tidak punya pemilih folder.", true);
  };
  async function changeLibraryFolder(path) {
    if (path === S.folder) return toast("Itu sudah folder unduhan sekarang");
    const count = S.library.length;
    let move = false;
    if (count) {
      const v = await formModal({ title: "Pindahkan lagu?", text: `Folder unduhan akan diganti ke<br><code style="color:#fff;word-break:break-all">${esc(path)}</code><br><br>Pindahkan ${count} lagu yang sudah ada ke folder baru? Kalau tidak, lagu lama tetap di folder lama dan tidak tampil di pustaka.`, ok: "Pindahkan", cancel: "Jangan pindahkan" });
      move = !!v;
    }
    const res = await postJSON("/api/library/folder", { path, move }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) return toast(data.error || "Gagal mengganti folder", true);
    window.AlunanAndroid.saveLibraryPath(data.folder);
    toast(move ? `Folder diganti, ${data.moved} lagu dipindahkan${data.failed.length ? ` (${data.failed.length} gagal)` : ""}` : "Folder unduhan diganti");
    if (data.folder !== window.AlunanAndroid.defaultLibraryPath()) window.AlunanAndroid.mediaScan(data.folder);
    await loadLibrary();
    if (S.view === "settings") renderSettings();
  }

  // ------------------------------------------------------------------ sidebar
  function renderSidebar() {
    $("#sideLibrary").innerHTML = libraryTilesHTML();
    if (current()) markPlaying();
    if (S.view === "collection") renderCollectionIndex();
  }
  function renderCollectionIndex() {
    $("#view").innerHTML = `<h1 class="greeting">Pustaka Anda</h1>
      <div class="chips" style="margin-bottom:12px"><button class="chip" id="ciNew">+ Playlist</button><button class="chip" id="ciImport">Impor URL</button><button class="chip" id="ciUpload">Unggah file</button></div>
      <div class="lib-list mobile-lib">${libraryTilesHTML()}</div>`;
    $("#ciNew").onclick = newPlaylistFlow;
    $("#ciImport").onclick = importPlaylistFlow;
    $("#ciUpload").onclick = () => fileInput.click();
    markPlaying();
  }
  function libraryTilesHTML() {
    const tile = (href, artHtml, title, sub, plid = "") => `<a class="lib-tile ${location.hash === href ? "active" : ""}" href="${href}" ${plid ? `data-plid="${plid}"` : ""}>
      <div class="lib-art">${artHtml}</div><div class="lib-meta"><div class="lib-title">${esc(title)}</div><div class="lib-sub">${esc(sub)}</div></div></a>`;
    const active = [...S.jobs.values()].filter((j) => j.status === "queued" || j.status === "downloading").length + S.dlPending.length;
    let html = tile("#liked", `<div class="art" style="background:linear-gradient(135deg,#450af5,#8e8ee5);color:#fff">${I.heartOn}</div>`, "Lagu Disukai", `Playlist · ${S.data.likes.length} lagu`);
    html += tile("#library", `<div class="art" style="background:linear-gradient(135deg,#0d7a3e,#1ed760);color:#fff">${I.dlSmall}</div>`, "Lagu Unduhan", `Playlist · ${S.library.length} lagu`);
    html += tile("#recent", `<div class="art" style="background:linear-gradient(135deg,#b33b00,#f59b23);color:#fff">${I.clock.replace(/style="[^"]*"/, "")}</div>`, "Baru Diputar", `${S.data.history.length} lagu`);
    html += tile("#downloads", `<div class="art" style="background:#2a2a2a;color:var(--accent)">${I.down}</div>`, "Antrean Unduhan", active ? `${active} sedang diproses` : "Tidak ada unduhan aktif");
    if (S.data.playlists.length) html += `<div class="lib-section">Playlist</div>` + S.data.playlists.map((pl) => tile("#playlist/" + pl.id, plCover(pl, "art"), pl.name, `Playlist · ${pl.tracks.length} lagu`, pl.id)).join("");
    else html += `<div class="lib-empty">Buat playlist pertamamu dengan tombol <b>+</b>, atau impor dari platform lain.</div>`;
    return html;
  }

  // ------------------------------------------------------------------ downloads
  let pollTimer = null;
  const activeJobs = () => [...S.jobs.values()].filter((j) => j.status === "queued" || j.status === "downloading").length;

  async function resolveTrack(t) {
    if (t.kind === "library" || (t.downloaded && t.file)) return true;
    if (t.id && S.live.has(t.id)) return true;
    const res = await postJSON("/api/resolve", toRef(t)).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) { toast(`“${t.title}”: ${d.error || "gagal dicari ulang"}`, true); return false; }
    if (d.library) { t.file = d.file; t.downloaded = true; return true; }
    S.live.add(d.id);
    Object.assign(t, { id: d.id, q: d.q || t.q, cover: t.cover || d.cover, ext: d.ext || t.ext, size: d.size, streamable: d.streamable, downloaded: d.downloaded, file: d.file, lyricUrl: d.hasLyric ? `/api/lyric/${d.id}` : null });
    return true;
  }

  function queueDownload(t) {
    if (t.kind === "library" || t.downloaded || S.dlPending.includes(t)) return;
    S.dlPending.push(t);
    refreshDlButtons();
    pumpDownloads();
  }
  async function pumpDownloads() {
    while (S.dlPending.length && activeJobs() < 2) {
      const t = S.dlPending.shift();
      await startDownload(t, true);
    }
  }

  async function startDownload(t, quiet = false) {
    if (t.kind === "library") return;
    if (t.downloaded) return quiet || toast("Lagu ini sudah ada di pustaka");
    const job = t.id && S.jobs.get(t.id);
    if (job && (job.status === "queued" || job.status === "downloading")) return quiet || go("#downloads");
    if (!(await resolveTrack(t))) return;
    if (t.downloaded) { markDownloaded(t.id, t.file, t); return quiet || toast("Lagu ini sudah ada di pustaka"); }
    const res = await fetch(`/api/download/${t.id}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) return toast(data.error || "Gagal memulai unduhan", true);
    S.jobs.set(t.id, { received: 0, ...data });
    if (!quiet) toast(`Mengunduh “${t.title}”…`);
    refreshDlButtons();
    poll();
  }

  async function poll() {
    clearTimeout(pollTimer);
    const list = await fetch("/api/downloads").then((r) => r.json()).catch(() => []);
    let finished = false;
    for (const j of list) {
      const prev = S.jobs.get(j.id);
      if (prev && prev.status !== j.status) {
        if (j.status === "done") {
          finished = true;
          toast(`“${j.title}” tersimpan di pustaka`);
          markDownloaded(j.id, j.file);
          if (j.file && S.folder) window.AlunanAndroid?.mediaScan?.(`${S.folder}/${j.file}`);
        }
        if (j.status === "error") toast(`Gagal mengunduh “${j.title}”: ${j.error}`, true);
      }
      S.jobs.set(j.id, j);
    }
    refreshDlButtons();
    if (S.view === "downloads") renderDownloads();
    if (finished) loadLibrary();
    else renderSidebarCounts();
    pumpDownloads();
    if (activeJobs() || S.dlPending.length) pollTimer = setTimeout(poll, 1000);
  }
  function renderSidebarCounts() {
    const tileSub = $('#sideLibrary [href="#downloads"] .lib-sub');
    const active = activeJobs() + S.dlPending.length;
    if (tileSub) tileSub.textContent = active ? `${active} sedang diproses` : "Tidak ada unduhan aktif";
  }

  function markDownloaded(id, file, extra) {
    const touch = (t) => { if (t.id === id || t === extra) { t.downloaded = true; t.file = file; } };
    for (const list of Object.values(S.lists)) list.forEach(touch);
    if (S.search) for (const r of S.search.results.values()) r.songs.forEach(touch);
    S.queue.forEach(touch);
    // simpan nama file di data tersimpan agar suka/playlist bisa langsung memutar dari pustaka
    let changed = false;
    for (const ref of [...S.data.likes, ...S.data.history, ...S.data.playlists.flatMap((p) => p.tracks)]) if (ref.id === id && ref.file !== file) { ref.file = file; changed = true; }
    if (changed) saveData();
    updatePlayerButtons();
  }

  function refreshDlButtons() {
    $$("[data-dl]").forEach((b) => {
      const r = rowTrack(b);
      if (r?.t) b.outerHTML = dlButton(r.t);
    });
    updatePlayerButtons();
  }

  // ------------------------------------------------------------------ player
  function playList(list, i, from = null) {
    S.original = list;
    S.playingFrom = from;
    if (S.shuffle) {
      const rest = list.filter((_, k) => k !== i).sort(() => Math.random() - 0.5);
      S.queue = [list[i], ...rest];
      S.index = 0;
    } else {
      S.queue = list.slice();
      S.index = i;
    }
    loadCurrent();
  }

  function playNext(t) {
    if (!current()) return playList([t], 0);
    S.queue.splice(S.index + 1, 0, t);
    preloadNextNative();
    toast("Akan diputar berikutnya");
    if (S.tab === "queue") renderPanel();
  }
  function addToQueue(tracks) {
    if (!tracks.length) return;
    if (!current()) return playList(tracks, 0);
    S.queue.push(...tracks);
    preloadNextNative();
    toast(tracks.length === 1 ? "Ditambahkan ke antrean" : `${tracks.length} lagu ditambahkan ke antrean`);
    if (S.tab === "queue") renderPanel();
  }

  let loadToken = 0, historyLogged = null;
  async function loadCurrent() {
    const t = current();
    if (!t) return;
    const token = ++loadToken;
    updateNowPlaying();
    markPlaying();
    $("#playBtn").classList.add("loading");
    if (!(await resolveTrack(t))) { $("#playBtn").classList.remove("loading"); return; }
    if (token !== loadToken) return;
    if (t.kind !== "library" && !t.downloaded && !t.streamable) toast("Lagu ini tidak bisa diputar langsung. Unduh dulu ke pustaka.", true);
    if (NATIVE && t.id && t.kind !== "library" && !t.downloaded && !qualityInfo(t).known) {
      // mesin native perlu tahu bit depth/sample rate sebelum memilih format DAC (maks. 3 detik)
      const q = await Promise.race([fetch(`/api/quality/${t.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null), new Promise((r) => setTimeout(r, 3000))]);
      if (q) t.q = q;
      if (token !== loadToken) return;
    }
    audio.src = playableUrl(t) || `/api/stream/${t.id}`;
    ensureAudioGraph();
    audio.play().catch(() => {});
    preloadNextNative();
    updateNowPlaying();
    probeQuality(t, true);
    loadLyrics(t);
    markPlaying();
  }

  const playableUrl = (t) => (t.kind === "library" || (t.downloaded && t.file)) ? `/api/library/file/${enc(t.file)}`
    : t.id && S.live.has(t.id) ? `/api/stream/${t.id}` : null;
  function upcomingTrack() {
    if (!S.queue.length) return null;
    if (S.repeat === "one") return current();
    if (S.index + 1 < S.queue.length) return S.queue[S.index + 1];
    return S.repeat === "all" ? S.queue[0] : null;
  }
  // gapless: beri tahu mesin native lagu berikutnya agar disambung tanpa jeda
  function preloadNextNative() {
    if (!NATIVE || !current()) return;
    const n = upcomingTrack();
    audio.preload(n ? playableUrl(n) : "", n);
  }

  function togglePlay() {
    if (!current()) {
      const first = S.library.length ? S.library : S.lists.searchAll;
      if (first?.length) playList(first, 0);
      return;
    }
    if (audio.paused) { ensureAudioGraph(); audio.play().catch(() => {}); } else audio.pause();
  }

  function next(auto = false) {
    if (!S.queue.length) return;
    if (auto && S.repeat === "one") { audio.currentTime = 0; audio.play(); return; }
    if (S.index + 1 < S.queue.length) S.index++;
    else if (S.repeat === "all") S.index = 0;
    else { if (auto) { audio.pause(); audio.currentTime = 0; } return; }
    loadCurrent();
  }
  function prev() {
    if (audio.currentTime > 3 || S.index <= 0) { audio.currentTime = 0; return; }
    S.index--;
    loadCurrent();
  }

  function setShuffle(on) {
    S.shuffle = on;
    store.set("shuffle", on);
    $("#shuffleBtn").classList.toggle("on", on);
    const cur = current();
    if (cur && S.original.length) {
      if (on) {
        const rest = S.original.filter((t) => t.key !== cur.key).sort(() => Math.random() - 0.5);
        S.queue = [cur, ...rest];
        S.index = 0;
      } else {
        S.queue = S.original.slice();
        S.index = Math.max(0, S.original.findIndex((t) => t.key === cur.key));
      }
      preloadNextNative();
      if (S.tab === "queue") renderPanel();
    }
  }
  function setRepeat(mode) {
    S.repeat = mode;
    store.set("repeat", mode);
    $("#repeatBtn").classList.toggle("on", mode !== "off");
    $("#repeatOne").classList.toggle("show", mode === "one");
    $("#repeatBtn").title = { off: "Ulangi", all: "Ulangi semua", one: "Ulangi satu lagu" }[mode];
    preloadNextNative();
  }

  $("#playBtn").onclick = togglePlay;
  $("#nextBtn").onclick = () => next();
  $("#prevBtn").onclick = prev;
  $("#shuffleBtn").onclick = () => setShuffle(!S.shuffle);
  $("#repeatBtn").onclick = () => setRepeat({ off: "all", all: "one", one: "off" }[S.repeat]);
  $("#plDownload").onclick = () => current() && startDownload(current());
  $("#plLike").onclick = () => toggleLike(current());
  $("#plCover").onclick = () => current() && openKaraoke();
  // di HP, ketuk judul di pemutar mini membuka layar Sedang Diputar (dengan tab Lirik & Antrean)
  $(".pl-meta").addEventListener("click", () => { if (innerWidth <= 640 && current()) openPanel("now"); });
  $("#fullBtn").onclick = () => (karaokeOpen() ? closeKaraoke() : openKaraoke());
  $("#eqBtn").onclick = () => { go("#settings"); setTimeout(() => $("#eqGroup")?.scrollIntoView({ behavior: "smooth" }), 50); };

  audio.addEventListener("play", () => { notifyAndroid(); $("#playIcon").innerHTML = I.pause.match(/<path.*\/>/)[0]; $("#playBtn").title = "Jeda"; markPlaying(); startVis(); });
  audio.addEventListener("pause", () => { notifyAndroid(); $("#playIcon").innerHTML = I.play.match(/<path.*\/>/)[0]; $("#playBtn").title = "Putar"; markPlaying(); });
  audio.addEventListener("playing", () => {
    $("#playBtn").classList.remove("loading");
    const t = current();
    if (t && historyLogged !== loadToken) { historyLogged = loadToken; pushHistory(t); }
  });
  audio.addEventListener("waiting", () => $("#playBtn").classList.add("loading"));
  audio.addEventListener("ended", () => next(true));
  // mesin native sudah menyambung ke lagu berikutnya tanpa jeda: cukup perbarui antrean & tampilan
  audio.addEventListener("gapless", () => {
    if (S.repeat !== "one") S.index = S.index + 1 < S.queue.length ? S.index + 1 : 0;
    historyLogged = ++loadToken;
    const t = current();
    if (!t) return;
    updateNowPlaying();
    probeQuality(t, true);
    loadLyrics(t);
    markPlaying();
    pushHistory(t);
    preloadNextNative();
  });
  audio.addEventListener("error", () => {
    $("#playBtn").classList.remove("loading");
    const t = current();
    if (!t || !audio.src) return;
    // tautan kedaluwarsa (misal server dimulai ulang): cari ulang sekali secara otomatis
    if (t.kind !== "library" && !t.downloaded && !t._retried) { t._retried = true; S.live.delete(t.id); loadCurrent(); return; }
    toast(t.kind === "library" ? "Gagal memutar file ini." : "Gagal memutar. Coba sumber lain atau unduh lagunya.", true);
  });
  audio.addEventListener("timeupdate", () => { if (!seekDrag) setSeekUI(audio.currentTime, audio.duration); highlightLyric(); });
  audio.addEventListener("loadedmetadata", () => setSeekUI(audio.currentTime, audio.duration));

  function setSeekUI(cur, dur) {
    const d = isFinite(dur) && dur > 0 ? dur : current()?.duration || 0;
    const pct = d ? Math.min(100, (cur / d) * 100) : 0;
    $("#seekFill").style.width = pct + "%";
    $("#seek .slider-knob").style.left = pct + "%";
    $("#curTime").textContent = fmt(cur);
    $("#durTime").textContent = fmt(d);
  }

  function updateNowPlaying() {
    const t = current();
    $("#plTitle").textContent = t ? t.title : "Belum ada lagu";
    $("#plArtist").textContent = t ? t.artist : "Cari lagu untuk mulai memutar";
    $("#plCover").innerHTML = t ? art(t.cover) : I.note;
    document.title = t ? `${t.title} · ${t.artist}` : "Songfy";
    updatePlayerButtons();
    updateQualityChip();
    notifyAndroid();
    renderPanel();
    renderKaraoke();
    if ("mediaSession" in navigator && t) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: t.artist, album: t.album || "",
        artwork: t.cover ? [{ src: new URL(t.cover, location.href).href, sizes: "512x512" }] : [],
      });
    }
  }

  function updatePlayerButtons() {
    const t = current();
    const lb = $("#plLike");
    lb.hidden = !t;
    if (t) { const on = isLiked(t); lb.classList.toggle("on", on); lb.innerHTML = on ? I.heartOn : I.heart; lb.title = on ? "Hapus dari Lagu Disukai" : "Simpan ke Lagu Disukai"; }
    const b = $("#plDownload");
    b.hidden = !t || t.kind === "library";
    if (!t || t.kind === "library") return;
    const job = t.id && S.jobs.get(t.id);
    const done = t.downloaded || job?.status === "done";
    b.classList.toggle("on", done);
    b.innerHTML = done ? I.done : I.down;
    b.title = done ? "Sudah di pustaka" : job && job.status !== "error" ? "Sedang diunduh…" : "Unduh ke pustaka";
  }

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("previoustrack", prev);
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
  }

  // ------------------------------------------------------------------ sliders
  let seekDrag = false;
  function slider(el, onMove, onEnd) {
    const frac = (e) => { const r = el.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      el.classList.add("drag");
      onMove(frac(e), true);
      const move = (ev) => onMove(frac(ev), true);
      const up = (ev) => { el.classList.remove("drag"); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); onEnd?.(frac(ev)); };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
    });
  }
  const dur = () => (isFinite(audio.duration) && audio.duration > 0 ? audio.duration : current()?.duration || 0);
  slider($("#seek"), (f) => { seekDrag = true; setSeekUI(f * dur(), dur()); }, (f) => { seekDrag = false; if (dur()) audio.currentTime = f * dur(); });

  let lastVol = store.get("vol", 0.8);
  function setVol(v, save = true) {
    v = Math.min(1, Math.max(0, v));
    audio.volume = v;
    $("#volFill").style.width = v * 100 + "%";
    $("#vol .slider-knob").style.left = v * 100 + "%";
    $("#volIcon").innerHTML = v === 0 ? I.volMute : v < 0.5 ? I.volLow : I.volHigh;
    if (save) store.set("vol", v);
  }
  slider($("#vol"), (f) => { setVol(f); if (f > 0) lastVol = f; });
  const toggleMute = () => { if (audio.volume > 0) { lastVol = audio.volume; setVol(0); } else setVol(lastVol || 0.8); };
  $("#muteBtn").onclick = toggleMute;

  // ------------------------------------------------------------------ audio graph: equalizer + analyser
  let actx = null, filters = [], analyser = null;
  function ensureAudioGraph() {
    if (NATIVE) return; // equalizer native diatur lewat applyEq()
    if (actx) { if (actx.state === "suspended") actx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      actx = new Ctx();
      const src = actx.createMediaElementSource(audio);
      filters = BANDS.map((f, i) => {
        const bq = actx.createBiquadFilter();
        bq.type = i === 0 ? "lowshelf" : i === BANDS.length - 1 ? "highshelf" : "peaking";
        bq.frequency.value = f;
        bq.Q.value = 1.1;
        return bq;
      });
      analyser = actx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      let node = src;
      for (const f of filters) { node.connect(f); node = f; }
      node.connect(analyser);
      analyser.connect(actx.destination);
      applyEq();
    } catch (err) { console.warn("Web Audio tidak tersedia", err); actx = null; }
  }
  function applyEq() {
    if (NATIVE) { NATIVE.setEq(!!S.settings.eqOn, JSON.stringify(S.settings.eqGains)); $("#eqBtn").classList.toggle("on", S.settings.eqOn); return; }
    if (!filters.length) return;
    filters.forEach((f, i) => f.gain.setTargetAtTime(S.settings.eqOn ? S.settings.eqGains[i] : 0, actx.currentTime, 0.05));
    $("#eqBtn").classList.toggle("on", S.settings.eqOn);
  }

  // ------------------------------------------------------------------ visualizer
  let visRunning = false;
  const freqBuf = new Uint8Array(1024), waveBuf = new Uint8Array(2048);
  function startVis() { if (!visRunning) { visRunning = true; requestAnimationFrame(drawVis); } }
  function drawVis() {
    const canvases = [];
    if (S.settings.vis) {
      const np = $("#npVis");
      if (np && np.offsetParent !== null) canvases.push(np);
      if (karaokeOpen()) canvases.push($("#kVis"));
    }
    if (!analyser || audio.paused || !canvases.length) {
      canvases.forEach((c) => c.getContext("2d").clearRect(0, 0, c.width, c.height));
      visRunning = false;
      return;
    }
    analyser.getByteFrequencyData(freqBuf);
    analyser.getByteTimeDomainData(waveBuf);
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#1ed760";
    for (const c of canvases) {
      const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
      const g = c.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = accent;
      g.strokeStyle = accent;
      const style = S.settings.visStyle;
      if (style === "wave") {
        g.lineWidth = 2;
        g.beginPath();
        for (let x = 0; x < w; x++) {
          const v = waveBuf[Math.floor((x / w) * waveBuf.length)] / 128 - 1;
          const y = h / 2 + v * h * 0.45;
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      } else {
        const n = Math.max(16, Math.floor(w / (c.id === "kVis" ? 10 : 6)));
        const bw = w / n;
        for (let i = 0; i < n; i++) {
          // skala logaritmik agar frekuensi rendah tidak menguasai tampilan
          const lo = Math.floor(Math.pow(i / n, 2) * 700), hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / n, 2) * 700));
          let sum = 0;
          for (let k = lo; k < hi; k++) sum += freqBuf[k];
          const v = sum / (hi - lo) / 255;
          const bh = Math.max(2, v * h * (style === "mirror" ? 0.5 : 0.95));
          g.globalAlpha = 0.35 + v * 0.65;
          if (style === "mirror") g.fillRect(i * bw + 1, h / 2 - bh, bw - 2, bh * 2);
          else g.fillRect(i * bw + 1, h - bh, bw - 2, bh);
        }
        g.globalAlpha = 1;
      }
    }
    requestAnimationFrame(drawVis);
  }

  // ------------------------------------------------------------------ lyrics
  function parseLrc(txt) {
    const timed = [], plain = [];
    for (const raw of String(txt || "").split(/\r?\n/)) {
      const times = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
      const text = raw.replace(/\[[^\]]*\]/g, "").trim();
      if (times.length) times.forEach((m) => timed.push({ t: +m[1] * 60 + parseFloat(m[2].replace(":", ".")), text }));
      else if (text && !/^\[[a-z]+:/i.test(raw.trim())) plain.push(text);
    }
    timed.sort((a, b) => a.t - b.t);
    const lines = timed.filter((l, i) => l.text || (i > 0 && timed[i - 1].text));
    return lines.length ? { lines: lines.map((l) => ({ ...l, text: l.text || "♪" })), synced: true } : { lines: plain.map((text) => ({ t: 0, text })), synced: false };
  }

  async function loadLyrics(t) {
    S.lyric = { key: t.key, lines: [], synced: false, loading: !!t.lyricUrl, active: -1 };
    renderPanel();
    renderKaraokeLyrics();
    if (!t.lyricUrl) return;
    const data = await fetch(t.lyricUrl).then((r) => r.json()).catch(() => ({ lyric: "" }));
    if (S.lyric.key !== t.key) return;
    Object.assign(S.lyric, parseLrc(data.lyric), { loading: false });
    renderPanel();
    renderKaraokeLyrics();
  }

  function lyricsHTML() {
    const L = S.lyric;
    if (!current()) return `<p class="rp-note">Putar lagu untuk melihat liriknya.</p>`;
    if (L.loading) return `<p class="rp-note">Memuat lirik…</p>`;
    if (!L.lines.length) return `<p class="rp-note">Lirik untuk lagu ini tidak tersedia dari sumbernya.</p>`;
    return `<div class="lyrics ${L.synced ? "" : "plain"}">${L.lines.map((l, i) => `<p data-t="${l.t}" data-i="${i}">${esc(l.text)}</p>`).join("")}</div>`;
  }
  function bindLyricClicks(root) {
    if (S.lyric.synced) $$(".lyrics p", root).forEach((p) => (p.onclick = () => { audio.currentTime = +p.dataset.t; userScrolledAt = 0; }));
  }

  let userScrolledAt = 0;
  function highlightLyric(force = false) {
    const L = S.lyric;
    if (!L.synced || !L.lines.length) return;
    const ct = audio.currentTime + 0.25;
    let idx = -1;
    for (let i = 0; i < L.lines.length; i++) { if (L.lines[i].t <= ct) idx = i; else break; }
    if (idx === L.active && !force) return;
    L.active = idx;
    for (const [box, scroller] of [[$("#rpBody .lyrics"), $("#rpBody")], [$("#kLyricsBox .lyrics"), $("#kLyricsBox")]]) {
      if (!box) continue;
      $$("p", box).forEach((p, i) => { p.classList.toggle("now", i === idx); p.classList.toggle("past", i < idx); });
      const el = box.children[idx];
      if (el && Date.now() - userScrolledAt > 3000) scroller.scrollTo({ top: el.offsetTop - scroller.clientHeight / (scroller.id === "kLyricsBox" ? 2.4 : 3), behavior: force ? "auto" : "smooth" });
    }
  }

  // ------------------------------------------------------------------ karaoke / layar penuh
  const karaokeOpen = () => !$("#karaoke").hidden;
  function openKaraoke() {
    if (!current()) return toast("Putar lagu dulu untuk membuka layar penuh");
    $("#karaoke").hidden = false;
    $("#fullBtn").classList.add("on");
    renderKaraoke();
    renderKaraokeLyrics();
    startVis();
  }
  function closeKaraoke() { $("#karaoke").hidden = true; $("#fullBtn").classList.remove("on"); }
  $("#kClose").onclick = closeKaraoke;
  $("#kLyricsBox").addEventListener("wheel", () => (userScrolledAt = Date.now()), { passive: true });
  function renderKaraoke() {
    if (!karaokeOpen()) return;
    const t = current();
    if (!t) return closeKaraoke();
    $("#kCover").innerHTML = art(t.cover);
    $("#kTitle").textContent = t.title;
    $("#kArtist").textContent = t.artist;
    $("#kQuality").innerHTML = qualityLine(t);
    $("#kBg").style.backgroundImage = t.cover ? `url("${t.cover.replace(/"/g, "%22")}")` : `linear-gradient(hsl(${hue(t.title)} 50% 30%), #000)`;
  }
  function renderKaraokeLyrics() {
    if (!karaokeOpen()) return;
    const box = $("#kLyricsBox");
    box.innerHTML = lyricsHTML();
    bindLyricClicks(box);
    S.lyric.active = -2;
    highlightLyric(true);
  }

  // ------------------------------------------------------------------ right panel
  function openPanel(tab) {
    const app = $("#app");
    if (!app.classList.contains("panel-closed") && S.tab === tab) { app.classList.add("panel-closed"); syncPanelBtns(); return; }
    app.classList.remove("panel-closed");
    S.tab = tab;
    renderPanel();
  }
  function syncPanelBtns() {
    const open = !$("#app").classList.contains("panel-closed");
    $("#lyricsBtn").classList.toggle("on", open && S.tab === "lyrics");
    $("#queueBtn").classList.toggle("on", open && S.tab === "queue");
    store.set("panel", open);
  }
  $("#lyricsBtn").onclick = () => openPanel("lyrics");
  $("#queueBtn").onclick = () => openPanel("queue");
  $("#closePanel").onclick = () => { $("#app").classList.add("panel-closed"); syncPanelBtns(); };
  $$(".rp-tab").forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; renderPanel(); }));
  $("#rpBody").addEventListener("wheel", () => (userScrolledAt = Date.now()), { passive: true });

  function renderPanel() {
    $$(".rp-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === S.tab));
    syncPanelBtns();
    const body = $("#rpBody"), t = current();
    if (S.tab === "lyrics") {
      body.innerHTML = lyricsHTML();
      bindLyricClicks(body);
      S.lyric.active = -2;
      highlightLyric(true);
      return;
    }
    if (S.tab === "queue") {
      if (!S.queue.length) { body.innerHTML = `<p class="rp-note">Antrean kosong. Putar lagu dari hasil pencarian, playlist, atau pustaka.</p>`; return; }
      const row = (q, i) => `<div class="q-row ${i === S.index ? "now" : ""}" data-qi="${i}">${art(q.cover)}<div class="lib-meta" style="flex:1"><div class="lib-title">${esc(q.title)}</div><div class="lib-sub">${esc(q.artist)}</div></div>${i > S.index ? `<button class="row-more" data-qrm="${i}" title="Hapus dari antrean" style="opacity:1">${I.trash}</button>` : ""}</div>`;
      const upcoming = S.queue.slice(S.index + 1, S.index + 51);
      body.innerHTML = `<div class="q-label">Sedang diputar</div>${row(S.queue[S.index], S.index)}
        <div class="q-label" style="margin-top:18px">Berikutnya${S.shuffle ? " (acak)" : ""}</div>
        ${upcoming.length ? upcoming.map((q, k) => row(q, S.index + 1 + k)).join("") : `<p class="rp-note" style="padding:8px">Tidak ada lagu berikutnya${S.repeat === "all" ? " — antrean akan diulang" : ""}.</p>`}`;
      $$("[data-qrm]", body).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); S.queue.splice(+b.dataset.qrm, 1); renderPanel(); }));
      $$("[data-qi]", body).forEach((r) => (r.onclick = () => { S.index = +r.dataset.qi; loadCurrent(); }));
      return;
    }
    if (!t) { body.innerHTML = `<div class="art np-cover">${I.note}</div><div class="np-title">Belum ada lagu</div><div class="np-artist">Cari dan putar lagu untuk mulai.</div>`; return; }
    const L = S.lyric;
    body.innerHTML = `
      ${art(t.cover, "np-cover")}
      ${S.settings.vis && !NATIVE ? '<canvas class="np-vis" id="npVis"></canvas>' : ""}
      <div class="np-title">${esc(t.title)}</div>
      <div class="np-artist">${esc(t.artist)}</div>
      ${L.lines.length ? `<div class="np-card" style="background:hsl(${hue(t.title)} 35% 30%)"><h4>Lirik</h4><div class="np-lyric-preview" id="npLyric">${L.lines.slice(0, 8).map((l) => esc(l.text)).join("<br>")}</div></div>` : ""}
      <div class="np-card"><h4>Tentang lagu ini</h4><div class="np-props">
        ${t.album ? `<span>Album</span><b>${esc(t.album)}</b>` : ""}
        <span>Sumber</span><b>${esc(t.sourceLabel)}</b>
        ${qualityProps(t)}
        ${t.size ? `<span>Ukuran</span><b>${esc(t.size)}</b>` : ""}
        ${t.duration ? `<span>Durasi</span><b>${fmt(t.duration)}</b>` : ""}
        <span>Status</span><b>${t.downloaded || t.kind === "library" ? "Tersimpan di pustaka" : "Streaming"}</b>
      </div></div>`;
    $("#npLyric")?.addEventListener("click", () => { S.tab = "lyrics"; renderPanel(); });
    if (!audio.paused) startVis();
  }

  // ------------------------------------------------------------------ palet perintah (Ctrl+K)
  function openPalette() {
    closeMenu();
    modal.innerHTML = `<div class="palette"><input id="palInput" placeholder="Cari lagu, playlist, atau perintah…"><div class="palette-list" id="palList"></div></div>`;
    modal.hidden = false;
    modal._cancel = closeModal;
    const input = $("#palInput");
    let items = [], focus = 0;
    const commands = [
      { kind: "Perintah", label: "Beranda", icon: I.home, run: () => go("#home") },
      { kind: "Perintah", label: "Lagu Disukai", icon: I.heartOn, run: () => go("#liked") },
      { kind: "Perintah", label: "Lagu Unduhan", icon: I.dlSmall, run: () => go("#library") },
      { kind: "Perintah", label: "Baru Diputar", icon: I.clock, run: () => go("#recent") },
      { kind: "Perintah", label: "Antrean Unduhan", icon: I.down, run: () => go("#downloads") },
      { kind: "Perintah", label: "Pengaturan", icon: I.gear, run: () => go("#settings") },
      { kind: "Perintah", label: "Buat playlist baru", icon: I.plus, run: newPlaylistFlow },
      { kind: "Perintah", label: "Impor playlist dari URL", icon: I.link, run: importPlaylistFlow },
      { kind: "Perintah", label: "Unggah file musik", icon: I.upload, run: () => fileInput.click() },
      { kind: "Pemutar", label: audio.paused ? "Putar" : "Jeda", icon: audio.paused ? I.play : I.pause, run: togglePlay },
      { kind: "Pemutar", label: "Lagu berikutnya", icon: I.next, run: () => next() },
      { kind: "Pemutar", label: S.shuffle ? "Matikan acak" : "Nyalakan acak", icon: I.shuffle, run: () => setShuffle(!S.shuffle) },
      { kind: "Pemutar", label: "Layar penuh dengan lirik", icon: I.full, run: openKaraoke },
      { kind: "Pemutar", label: "Tampilkan lirik", icon: I.lyrics, run: () => openPanel("lyrics") },
      { kind: "Pemutar", label: "Tampilkan antrean", icon: I.list, run: () => openPanel("queue") },
      ...(current() ? [{ kind: "Pemutar", label: isLiked(current()) ? "Batal suka lagu ini" : "Suka lagu ini", icon: I.heart, run: () => toggleLike(current()) }] : []),
      ...Object.entries(THEMES).map(([k, [n, c]]) => ({ kind: "Tema", label: `Tema ${n}`, icon: `<span style="width:14px;height:14px;border-radius:50%;background:${c}"></span>`, run: () => { S.settings.theme = k; saveSettings(); applyTheme(); if (S.view === "settings") renderSettings(); } })),
    ];
    const songPool = () => {
      const seen = new Set(), out = [];
      for (const [label, list] of [["Disukai", S.data.likes.map(fromRef)], ["Pustaka", S.library], ["Riwayat", S.data.history.map(fromRef)]])
        for (const t of list) { const k = norm(t.title) + "|" + norm(t.artist); if (!seen.has(k)) { seen.add(k); out.push({ t, label }); } }
      return out;
    };
    const build = () => {
      const q = norm(input.value);
      const match = (s) => !q || norm(s).includes(q);
      items = [];
      if (q) items.push({ group: "Cari", kind: "Cari di semua sumber", label: `Cari “${input.value.trim()}”`, icon: I.search, run: () => go("#search/" + enc(input.value.trim())) });
      const pls = S.data.playlists.filter((p) => match(p.name)).slice(0, 6).map((pl) => ({ group: "Playlist", kind: `Playlist · ${pl.tracks.length} lagu`, label: pl.name, iconHtml: plCover(pl, "art"), run: () => go("#playlist/" + pl.id) }));
      const songs = songPool().filter(({ t }) => match(t.title + " " + t.artist)).slice(0, q ? 8 : 5).map(({ t, label }) => ({ group: "Lagu", kind: `${t.artist} · ${label}`, label: t.title, iconHtml: art(t.cover), run: () => playList([t], 0) }));
      const cmds = commands.filter((c) => match(c.label + " " + c.kind)).slice(0, q ? 8 : 20).map((c) => ({ ...c, group: c.kind }));
      items.push(...pls, ...songs, ...cmds);
      focus = Math.min(focus, Math.max(0, items.length - 1));
      let lastGroup = null;
      $("#palList").innerHTML = items.length ? items.map((it, i) => {
        const head = it.group !== lastGroup ? `<div class="pal-group">${esc(it.group)}</div>` : "";
        lastGroup = it.group;
        return `${head}<div class="pal-item ${i === focus ? "focus" : ""}" data-pi="${i}"><div class="pal-ico">${it.iconHtml || it.icon}</div><div class="pal-text"><div class="lib-title" style="font-size:14px">${esc(it.label)}</div>${it.group !== it.kind ? `<div class="pal-kind">${esc(it.kind)}</div>` : ""}</div></div>`;
      }).join("") : `<p class="rp-note" style="padding:16px">Tidak ada yang cocok.</p>`;
      $$("[data-pi]", modal).forEach((el) => {
        el.onmouseenter = () => { focus = +el.dataset.pi; $$(".pal-item", modal).forEach((x) => x.classList.toggle("focus", x === el)); };
        el.onclick = () => runItem(+el.dataset.pi);
      });
    };
    const runItem = (i) => { const it = items[i]; if (!it) return; closeModal(); it.run(); };
    input.oninput = () => { focus = 0; build(); };
    input.onkeydown = (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        focus = (focus + (e.key === "ArrowDown" ? 1 : -1) + items.length) % Math.max(1, items.length);
        $$(".pal-item", modal).forEach((x) => x.classList.toggle("focus", +x.dataset.pi === focus));
        $(`.pal-item[data-pi="${focus}"]`, modal)?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") { e.preventDefault(); runItem(focus); }
      else if (e.key === "Escape") closeModal();
    };
    build();
    input.focus();
  }

  // ------------------------------------------------------------------ aplikasi Android (WebView)
  // Aplikasi Android menampilkan notifikasi pemutar dan meneruskan tombol notifikasi ke sini.
  function notifyAndroid() {
    const bridge = window.AlunanAndroid;
    if (!bridge) return;
    const t = current();
    try {
      bridge.update(JSON.stringify({ hasTrack: !!t, title: t?.title || "", artist: t?.artist || "", cover: t?.cover ? new URL(t.cover, location.href).href : "", playing: !audio.paused }));
    } catch { /* jembatan Android tidak tersedia */ }
  }
  window.alunanControl = (cmd) => {
    if (cmd === "toggle") togglePlay();
    else if (cmd === "play") audio.play().catch(() => {});
    else if (cmd === "pause") audio.pause();
    else if (cmd === "next") next();
    else if (cmd === "prev") prev();
  };

  // ------------------------------------------------------------------ keyboard
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); modal.hidden ? openPalette() : closeModal(); return; }
    if (!modal.hidden) { if (e.key === "Escape") modal._cancel?.(); return; }
    if (!menu.hidden && e.key === "Escape") return closeMenu();
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if (e.key === "/" && !typing) { e.preventDefault(); $("#searchInput").focus(); $("#searchInput").select(); return; }
    if (typing) { if (e.key === "Escape") document.activeElement.blur(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.key === "Escape" && karaokeOpen()) closeKaraoke();
    else if (e.key === "ArrowRight" && e.shiftKey) next();
    else if (e.key === "ArrowLeft" && e.shiftKey) prev();
    else if (e.key === "ArrowRight") audio.currentTime = Math.min(dur(), audio.currentTime + 5);
    else if (e.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 5);
    else if (e.key === "ArrowUp") { e.preventDefault(); setVol(audio.volume + 0.05); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setVol(audio.volume - 0.05); }
    else if (k === "f") karaokeOpen() ? closeKaraoke() : openKaraoke();
    else if (k === "l") toggleLike(current());
    else if (k === "m") toggleMute();
    else if (k === "s") setShuffle(!S.shuffle);
    else if (k === "r") setRepeat({ off: "all", all: "one", one: "off" }[S.repeat]);
  });
  window.addEventListener("resize", closeMenu);
  $("#main").addEventListener("scroll", closeMenu, { passive: true });

  // ------------------------------------------------------------------ init
  (async function init() {
    applyTheme();
    setVol(lastVol, false);
    setRepeat(S.repeat);
    $("#shuffleBtn").classList.toggle("on", S.shuffle);
    $("#eqBtn").classList.toggle("on", S.settings.eqOn);
    if (NATIVE) applyEq();
    if (store.get("panel", true) === false || window.innerWidth <= 1100) $("#app").classList.add("panel-closed");
    renderPanel();
    await Promise.all([loadSources(), loadUserData()]);
    renderSidebar();
    render();
    loadLibrary();
    poll();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  })();
})();
