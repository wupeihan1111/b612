/* B612 單字星球 — game logic. Progress lives in this browser's localStorage, with a backup code in Settings. */
"use strict";
const APP_VERSION = "2026-11-27 · 主畫面音樂版";   // shown in Settings so you can tell which version the phone is running

/* ---------- 題庫 ---------- */
// Book units first (your handwritten Day 1–2), then the extra topic units, then the movie bonus unit.
const DECKS = (() => {
  const base = window.B612_DECKS || [], more = window.B612_DECKS_MORE || [];
  return [...base.filter(d => d.id !== "d0"), ...more, ...base.filter(d => d.id === "d0")];
})();
const seenWords = new Set();
const BOOK_WORDS = DECKS.flatMap(d => d.words.map((a, i) => ({
  id: d.id + "-" + (i + 1), deck: d.id, w: a[0], pos: a[1], zh: a[2], ex: a[3], exZh: a[4], tip: a[5], hook: a[6]
}))).filter(w => { const k = w.w.toLowerCase(); if (seenWords.has(k)) return false; seenWords.add(k); return true });   // a word in two units is taught once

const EXAM = dayNum(new Date(2027, 0, 9));
const INTERVALS = [1, 1, 3, 7, 14, 30];
const STAR_STAGE = 4;
/* The journey: every 150 new words the prince lands on the next planet, meets its resident and brings a souvenir home.
   A fixed distance per leg means adding more words never pushes him backwards. */
const LEG = 150;
const STOPS = [
  { id: "b612", name: "B612", who: "你的家", col: "#c49a68" },
  { id: "king", name: "國王的星球", who: "國王", col: "#9b72cf", gift: "crown", giftName: "國王的小王冠",
    lines: ["啊！一個臣民！過來讓我看看你。", "我命令你：明天也要回來背單字。", "這是個合理的命令，因為你做得到。"] },
  { id: "vain", name: "愛慕虛榮的人", who: "愛慕虛榮的人", col: "#e0556e", gift: "hat", giftName: "會打招呼的帽子",
    lines: ["你是來崇拜我的嗎？快拍拍手！", "⋯⋯什麼？你已經認識 300 個單字了？", "好吧，這次換我替你拍手。"] },
  { id: "drunk", name: "酒鬼的星球", who: "酒鬼", col: "#6d8bd6", gift: "hourglass", giftName: "不會忘記的沙漏",
    lines: ["我在這裡，是為了忘記一些事。", "你不一樣，你每天複習，是為了不要忘記。", "這個沙漏給你，提醒你時間會幫你記住。"] },
  { id: "biz", name: "商人的星球", who: "商人", col: "#e8c35a", gift: "starjar", giftName: "裝星星的瓶子",
    lines: ["別吵，我在數我擁有的星星。", "你說你也有星星？是你自己點亮的？", "那些星星比我的更值錢。拿這個瓶子去裝吧。"] },
  { id: "lamp", name: "點燈人的星球", who: "點燈人", col: "#ff8a3d", gift: "lamp", giftName: "一盞小路燈",
    lines: ["早安！晚安！我每天準時點燈、熄燈。", "你也每天準時回來清火山，對吧？", "我們是同一種人。這盞燈送你。"] },
  { id: "geo", name: "地理學家的星球", who: "地理學家", col: "#6cbf7a", gift: "globe", giftName: "地理學家的地球儀",
    lines: ["我只記錄永遠不會改變的東西。", "你腦袋裡的那些單字，已經不會跑掉了。", "下一站，去地球吧。那裡有人在等你。"] },
  { id: "earth", name: "地球", who: "狐狸", col: "#4aa3df", gift: "fox", giftName: "狐狸朋友",
    lines: ["你終於來了。這裡就是考場。", "你每天都來，所以你已經馴養了好多單字。", "重要的東西，用心才看得見。我跟你回 B612，考試加油。"] },
];
function legsDone() { return Math.min(STOPS.length - 1, Math.floor(seenCount() / LEG)) }
function nextStop() { const i = legsDone() + 1; return i < STOPS.length ? { stop: STOPS[i], left: i * LEG - seenCount() } : null }
function pendingLanding() { for (let i = 1; i <= legsDone(); i++) if (!S.visited.includes(STOPS[i].id)) return STOPS[i].id; return null }
function foxHourNow() { return new Date().getHours() === S.settings.foxHour }
const LINES = [
  "狐狸說：馴養需要時間。今天也來馴養幾個字吧。",
  "猴麵包樹要趁小的時候拔，單字也是。",
  "每座火山每天清一次，星球就會很安全。",
  "你在玫瑰身上花的時間，讓玫瑰變得重要。單字也一樣。",
  "星星會發亮，是因為上面有你記住的字。",
  "點燈人每天準時點燈，你每天準時清火山。",
  "沙漠會美，是因為某個地方藏著一口井。考場也是。",
];

function dayNum(d = new Date()) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])) }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }
function toast(msg, ms = 2600) { const t = document.getElementById("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms) }

/* ---------- 進度存檔 ---------- */
const LS = "b612.v2";
function fresh() { return { v: 2, words: {}, today: null, sunsets: [], visited: [], foxDays: [], landing: null, settings: { perDay: 40, rate: 0.9, voice: "", sfx: true, foxHour: 21, music: true, musicVol: 0.5, musicSrc: "chip", musicName: "" }, custom: [], installHidden: false, updatedAt: 0 } }
function load() { try { const r = localStorage.getItem(LS); if (r) { const o = JSON.parse(r); return Object.assign(fresh(), o, { settings: Object.assign(fresh().settings, o.settings) }) } } catch (e) { } return fresh() }
let S = load();
function save() { S.updatedAt = Date.now(); try { localStorage.setItem(LS, JSON.stringify(S)) } catch (e) { toast("存檔失敗：瀏覽器不允許儲存資料，請關閉無痕模式。") } sbSchedulePush() }
function exportCode() { return btoa(unescape(encodeURIComponent(JSON.stringify(S)))) }
function importCode(code) {
  const o = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  if (!o || typeof o !== "object" || !o.words) throw new Error("bad");
  adoptState(o); S.lastBackup = Date.now(); save();
}
// Sound settings belong to this device (its voices, its music file), so progress from elsewhere keeps them as they are here.
function adoptState(o) {
  const local = S.settings, keep = ["music", "musicVol", "musicSrc", "musicName", "voice", "rate", "sfx"];
  const settings = Object.assign(fresh().settings, o.settings);
  keep.forEach(k => settings[k] = local[k]);
  S = Object.assign(fresh(), o, { settings, installHidden: S.installHidden, lastBackup: S.lastBackup });
}

/* ---------- 雲端同步（Supabase） ----------
   One row per signed-in person in table "progress" (user_id, state jsonb, updated_at). Login is email + password, which
   works inside the home-screen app and needs no email at all (Supabase's "Confirm email" is turned off). The newer copy wins. */
const SB = { client: null, user: null, state: "off", last: 0, timer: null, busy: false };
function sbConfigured() { const c = window.B612_SUPABASE; return !!(c && c.url && c.anonKey && window.supabase) }
function sbInit() {
  if (!sbConfigured()) return;
  try {
    const c = window.B612_SUPABASE;
    SB.client = window.supabase.createClient(c.url, c.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "b612.auth" } });
    SB.client.auth.onAuthStateChange((ev, session) => {
      const was = SB.user; SB.user = session ? session.user : null;
      if (SB.user && !was) sbPull();
      if (view === "settings") renderSettings();
    });
  } catch (e) { SB.client = null }
}
function sbSafeToSwap() { return view !== "learn" && view !== "quiz" && view !== "land" }
/* Merge two copies of the progress instead of letting one replace the other, so an empty or older device can never
   wipe out real progress. Per word: a seen word beats an unseen one, then the more recent answer wins. Lists such as
   sunsets and souvenirs are combined. This device keeps its own sound settings. */
function mergeStates(a, b) {
  const out = Object.assign(fresh(), a), words = {};
  const ids = new Set([...Object.keys(a.words || {}), ...Object.keys(b.words || {})]);
  ids.forEach(id => {
    const x = (a.words || {})[id], y = (b.words || {})[id];
    if (!x || !y) { words[id] = x || y; return }
    if (!!x.seen !== !!y.seen) { words[id] = x.seen ? x : y; return }
    const tx = x.t || 0, ty = y.t || 0;
    words[id] = tx !== ty ? (tx > ty ? x : y) : ((x.s || 0) * 100 + (x.wr || 0) >= (y.s || 0) * 100 + (y.wr || 0) ? x : y);
  });
  out.words = words;
  const uni = (p, q) => [...new Set([...(p || []), ...(q || [])])].sort((m, n) => (m > n ? 1 : m < n ? -1 : 0));
  out.sunsets = uni(a.sunsets, b.sunsets); out.foxDays = uni(a.foxDays, b.foxDays); out.visited = uni(a.visited, b.visited);
  const cust = {}; [...(a.custom || []), ...(b.custom || [])].forEach(c => { cust[c.w.toLowerCase()] = cust[c.w.toLowerCase()] || c }); out.custom = Object.values(cust);
  const ta = a.today, tb = b.today;
  if (ta && tb && ta.day === tb.day) {
    const pick = tb.done.filter(Boolean).length > ta.done.filter(Boolean).length ? tb : ta;
    out.today = Object.assign({}, pick, { done: ta.done.map((d, i) => d || tb.done[i]), stars: Math.max(ta.stars || 0, tb.stars || 0) });
  } else out.today = (!ta || (tb && tb.day > ta.day)) ? tb : ta;
  out.settings = a.settings; out.landing = a.landing; out.installHidden = a.installHidden;
  out.lastBackup = Math.max(a.lastBackup || 0, b.lastBackup || 0);
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}
const syncKey = st => JSON.stringify([st.words, st.sunsets, st.foxDays, st.visited, st.custom, st.today]);
async function sbPull() {
  if (!SB.client || !SB.user || SB.busy || !sbSafeToSwap()) return;
  SB.busy = true; SB.state = "syncing";
  try {
    const { data, error } = await SB.client.from("progress").select("state").eq("user_id", SB.user.id).maybeSingle();
    if (error) throw error;
    const remote = data && data.state;
    const merged = remote ? mergeStates(S, remote) : S;
    const localChanged = syncKey(merged) !== syncKey(S), remoteChanged = !remote || syncKey(merged) !== syncKey(remote);
    if (localChanged && sbSafeToSwap()) {
      S = merged; byIdCache.clear();
      try { localStorage.setItem(LS, JSON.stringify(S)) } catch (e) { }
      render(); toast("已合併雲端的進度", 1800);
    }
    SB.busy = false;
    if (remoteChanged) await sbPush(); else { SB.state = "ok"; SB.last = Date.now() }
  } catch (e) { SB.state = "error"; SB.busy = false }
}
async function sbPush() {
  if (!SB.client || !SB.user) return;
  try {
    const { error } = await SB.client.from("progress").upsert({ user_id: SB.user.id, state: S, updated_at: new Date().toISOString() });
    if (error) throw error;
    SB.state = "ok"; SB.last = Date.now();
  } catch (e) { SB.state = "error" }
  if (view === "settings") { const el = document.getElementById("sbStat"); if (el) el.textContent = sbStatusText() }
}
function sbSchedulePush() { if (!SB.user) return; clearTimeout(SB.timer); SB.timer = setTimeout(sbPull, 1500) }   // pull-merge-push, never a blind overwrite
function sbStatusText() {
  if (SB.state === "syncing") return "同步中⋯";
  if (SB.state === "error") return "這次同步失敗（可能沒有網路），有網路時會再試。";
  if (SB.last) return "已同步 · " + new Date(SB.last).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
  return "等待同步";
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) sbPull(); else if (SB.user) { clearTimeout(SB.timer); sbPull() } });
window.addEventListener("online", () => sbPull());

/* ---------- 單字與記憶狀態 ---------- */
function ALL() { return BOOK_WORDS.concat(S.custom || []) }
const byIdCache = new Map();
function byId(id) { if (!byIdCache.has(id)) byIdCache.set(id, ALL().find(w => w.id === id)); return byIdCache.get(id) }
function ws(id) { return S.words[id] || { s: 0, due: 0, wr: 0, seen: false } }
function setWs(id, o) { S.words[id] = Object.assign(ws(id), o) }
function today() { return dayNum() }
function clampDue(d) { const t = today(); if (t >= EXAM - 1) return Math.max(d, t + 1); return Math.max(t + 1, Math.min(d, EXAM - 1)) }
function dueWords() { const t = today(); return ALL().filter(w => { const x = S.words[w.id]; return x && x.seen && x.due <= t }) }
function seenCount() { return ALL().filter(w => ws(w.id).seen).length }
function stars() { return ALL().filter(w => ws(w.id).s >= STAR_STAGE).length }
function status(id) { const x = ws(id); if (!x.seen) return ["new", "還沒遇見"]; if (x.due <= today()) return ["baobab", "猴麵包樹"]; if (x.wr >= 3 && x.s < STAR_STAGE) return ["stubborn", "頑固單字"]; if (x.s >= STAR_STAGE) return ["star", "已點亮"]; return ["taming", "馴養中"] }
/* New words never spill into the next unit within a day: the day takes what is left of the current unit
   (40 words = one unit = both volcanoes). If only half a unit is left, the second volcano becomes a review,
   so the next day starts cleanly on a new unit. */
function unitPool(exclude = []) {
  const unseen = ALL().filter(w => !ws(w.id).seen && !exclude.includes(w.id));
  if (!unseen.length) return [];
  const deck = unseen[0].deck;
  return unseen.filter(w => w.deck === deck).map(w => w.id);
}
function ensureToday() {
  const t = today(), per = S.settings.perDay, half = Math.ceil(per / 2);
  if (S.today && S.today.day === t) {
    // Units may have been added since this morning: refill any volcano not cleared yet, from the current unit.
    const T = S.today;
    const v1 = T.done[0] ? T.v1 : unitPool().slice(0, half);
    const v2 = T.done[1] ? T.v2 : unitPool(v1).slice(0, T.done[0] ? per - half : per - v1.length);
    if (v1.join() !== T.v1.join() || v2.join() !== T.v2.join()) { T.v1 = v1; T.v2 = v2; save() }
    return;
  }
  const pool = unitPool();
  S.today = { day: t, v1: pool.slice(0, half), v2: pool.slice(half, per), done: [false, false, false] };
  save();
}
function streak() { const set = new Set(S.sunsets); let d = today(); if (!set.has(d)) d--; let n = 0; while (set.has(d)) { n++; d-- } return n }
function daysLeft() { return Math.max(0, EXAM - today()) }
function currentDeck() { const w = ALL().find(w => !ws(w.id).seen); const id = w ? w.deck : null; const d = DECKS.find(d => d.id === id); return d ? d.title : (id ? "我的單字" : "全部遇見了") }

/* ---------- 發音 ---------- */
let voices = [];
function loadVoices() { try { voices = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang)) } catch (e) { voices = [] } }
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.addEventListener?.("voiceschanged", () => { loadVoices(); if (view === "settings") render() }) }
function pickVoice() {
  if (S.settings.voice) { const v = voices.find(v => v.name === S.settings.voice); if (v) return v }
  const pref = ["Samantha", "Ava", "Allison", "Susan", "Google US English", "Microsoft Aria", "Microsoft Jenny", "Karen", "Daniel"];
  for (const p of pref) { const v = voices.find(v => v.name.includes(p) && /en[-_](US|GB|AU)/i.test(v.lang)); if (v) return v }
  return voices.find(v => /en[-_]US/i.test(v.lang) && v.localService) || voices.find(v => /en[-_]US/i.test(v.lang)) || voices[0] || null;
}
let speakTimer = null, speakBtn = null, warnedNoVoice = false;
function markSpeaking(on) { document.querySelectorAll(".speak").forEach(b => b.classList.toggle("on", on)); musicDuck(on) }
const SAY_AS = { resume: "résumé" };   // words whose plain spelling the voice reads as a different word
function speak(text, rateMul = 1) {
  text = SAY_AS[text] || text;
  const synth = window.speechSynthesis;
  if (!synth) { if (!warnedNoVoice) { warnedNoVoice = true; toast("這個瀏覽器不支援發音，建議用 Safari 或 Chrome 打開。") } return }
  try {
    if (!voices.length) loadVoices();
    const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; const v = pickVoice(); if (v) u.voice = v; u.rate = S.settings.rate * rateMul; u.volume = 1;
    u.onstart = () => markSpeaking(true);
    u.onend = () => markSpeaking(false);
    u.onerror = e => { markSpeaking(false); if (e.error === "not-allowed") toast("點一下喇叭就能聽發音。") };
    clearTimeout(speakTimer);
    // Chrome and Safari drop an utterance queued right after cancel(), so cancel only when something is playing, then wait a beat.
    if (synth.speaking || synth.pending) { synth.cancel(); speakTimer = setTimeout(() => { synth.resume(); synth.speak(u) }, 120) }
    else { synth.resume(); synth.speak(u) }
  } catch (e) { }
}
// iOS only allows speech after a tap: unlock it silently on the first touch.
let unlocked = false;
document.addEventListener("pointerdown", () => {
  if (unlocked || !window.speechSynthesis) return; unlocked = true;
  try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u) } catch (e) { }
}, { capture: true });

/* Sound effects (Web Audio). iOS starts the audio engine suspended, re-suspends it ("interrupted") after the app
   goes to the background, and mutes it with the silent switch, so: unlock on every tap, resume before each sound,
   and ask for a "playback" audio session where Safari supports it. */
let AC = null;
try { if (navigator.audioSession) navigator.audioSession.type = "playback" } catch (e) { }
function audio() {
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state !== "running") AC.resume().catch(() => { }) } catch (e) { }
  return AC;
}
let audioUnlocked = false;
function rebuildAudio() {
  // iPhone sometimes leaves the audio engine stuck "interrupted" after switching apps; start a fresh one.
  try { waStop(); AC && AC.close() } catch (e) { }
  AC = null; BGM.waGain = null; BGM.waBuf = {}; audio(); musicSync();
}
function unlockAudio() {
  const ac = audio(); if (!ac) return;
  audioUnlocked = true; musicSync();   // inside the tap, so the music element is allowed to start
  if (ac.state !== "running") ac.resume().then(() => { if (ac.state === "running") musicSync() }).catch(() => { }).finally(() => setTimeout(() => { if (AC === ac && ac.state !== "running") rebuildAudio() }, 400));
  try { const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0) } catch (e) { }
}
["touchend", "pointerup", "click", "keydown"].forEach(ev => document.addEventListener(ev, unlockAudio, { capture: true, passive: true }));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { musicSync(); return }
  if (AC && AC.state !== "running") AC.resume().then(musicSync).catch(() => { });
  musicSync();
});

/* ---------- 背景音樂 ----------
   An original 3/4 music-box waltz played on the same Web Audio engine as the sound effects, or a file the player
   picked from their own phone (kept in this browser's IndexedDB, never uploaded). Music pauses while learning. */
const SONG = [   // [bass, chord tones, melody [step, midi, length in eighths]] — 6 eighths per bar, G major
  [43, [59, 62], [[0, 74, 2], [2, 71, 1], [3, 74, 1], [4, 79, 2]]],
  [40, [59, 64], [[0, 78, 2], [2, 76, 1], [3, 74, 1], [4, 71, 2]]],
  [48, [60, 64], [[0, 72, 2], [2, 76, 2], [4, 79, 2]]],
  [50, [62, 66], [[0, 78, 3], [3, 76, 1], [4, 74, 2]]],
  [43, [59, 62], [[0, 74, 2], [2, 71, 1], [3, 74, 1], [4, 83, 2]]],
  [40, [59, 64], [[0, 81, 2], [2, 79, 1], [3, 78, 1], [4, 76, 2]]],
  [45, [60, 64], [[0, 72, 1], [1, 76, 1], [2, 81, 2], [4, 79, 1], [5, 76, 1]]],
  [50, [62, 66], [[0, 78, 4], [4, 81, 2]]],
  [40, [59, 64], [[0, 79, 2], [2, 78, 1], [3, 76, 1], [4, 71, 2]]],
  [48, [60, 64], [[0, 72, 2], [2, 74, 1], [3, 76, 1], [4, 79, 2]]],
  [43, [59, 62], [[0, 79, 1], [1, 78, 1], [2, 79, 2], [4, 83, 2]]],
  [50, [62, 66], [[0, 81, 3], [3, 78, 1], [4, 74, 2]]],
  [48, [60, 64], [[0, 76, 2], [2, 79, 2], [4, 84, 2]]],
  [50, [62, 66], [[0, 83, 2], [2, 81, 2], [4, 78, 2]]],
  [43, [59, 62], [[0, 79, 6]]],
  [43, [59, 62], [[2, 71, 1], [3, 74, 1], [4, 79, 2]]],
];
/* The waltz is a real audio file in the site (audio/*.m4a, rendered from SONG), looped by an <audio> element that
   lives in the page. That is the most dependable way to get sound in an iPhone home-screen app. */
const BGM = { el: null, chipUrl: ["audio/b612-waltz.m4a", "audio/b612-waltz-night.m4a"], blob: null, customUrl: null, night: false, ducked: false, err: "" };
function customReady() { return S.settings.musicSrc === "custom" && BGM.blob }
function musicWanted() { return S.settings.music && audioUnlocked && !document.hidden && view !== "learn" && view !== "quiz" }
/* Two ways to play: a hidden <audio> element (Safari), or a looping Web Audio buffer on the same engine as the
   sound effects. iPhone home-screen apps often refuse the <audio> element ("NotAllowedError") while the effects play
   fine, so the home-screen app uses Web Audio, and any other browser switches to it after one refusal. */
BGM.engine = isStandalone() ? "wa" : "media"; BGM.waBuf = {}; BGM.waNode = null; BGM.waGain = null; BGM.waLoading = null;
function waLoad(url) {
  if (BGM.waBuf[url]) return Promise.resolve(BGM.waBuf[url]);
  return fetch(url).then(r => r.arrayBuffer()).then(ab => new Promise((res, rej) => audio().decodeAudioData(ab, res, rej))).then(buf => (BGM.waBuf[url] = buf));
}
function waStop() { try { BGM.waNode && BGM.waNode.stop() } catch (e) { } BGM.waNode = null }
function waPlay(url) {
  const ac = audio(); if (!ac) { BGM.err = "這個瀏覽器不支援 Web Audio"; return }
  if (!BGM.waGain) { BGM.waGain = ac.createGain(); BGM.waGain.connect(ac.destination) }
  BGM.waGain.gain.value = Math.min(1, S.settings.musicVol * (BGM.ducked ? 0.3 : 1));
  if (BGM.waNode && BGM.waNode._url === url) return;
  if (BGM.waLoading === url) return;
  BGM.waLoading = url;
  waLoad(url).then(buf => {
    BGM.waLoading = null;
    if (!musicWanted() || BGM.engine !== "wa") return;
    waStop();
    const n = ac.createBufferSource(); n.buffer = buf; n.loop = true; n.connect(BGM.waGain); n.start(); n._url = url;
    BGM.waNode = n; BGM.err = "";
  }).catch(e => { BGM.waLoading = null; BGM.err = "音樂檔讀取失敗：" + (e && (e.message || e.name) || "未知") });
}
function mediaEl() {
  if (!BGM.el) {
    BGM.el = document.createElement("audio"); BGM.el.loop = true; BGM.el.preload = "auto";
    BGM.el.setAttribute("playsinline", ""); BGM.el.setAttribute("webkit-playsinline", ""); BGM.el.hidden = true;
    BGM.el.addEventListener("error", () => { if (BGM.engine === "media") BGM.err = "音樂檔載入失敗（錯誤碼 " + (BGM.el.error ? BGM.el.error.code : "?") + "）" });
    BGM.el.addEventListener("playing", () => { BGM.err = "" });
    document.body.appendChild(BGM.el);
  }
  return BGM.el;
}
function musicSync() {
  BGM.night = !!(S.today && skyStage() === 3);
  if (customReady() && !BGM.customUrl) BGM.customUrl = URL.createObjectURL(BGM.blob);
  const src = customReady() ? BGM.customUrl : (BGM.chipUrl[BGM.night ? 1 : 0] || BGM.chipUrl[0]);
  const want = musicWanted() && src;
  if (BGM.engine === "wa") {
    if (BGM.el && !BGM.el.paused) BGM.el.pause();
    if (want) waPlay(src); else waStop();
  } else {
    const el = mediaEl();
    if (want) {
      if (el.dataset.src !== src) { el.src = src; el.dataset.src = src }
      el.volume = Math.min(1, S.settings.musicVol * (BGM.ducked ? 0.3 : 1));
      if (el.paused) { const p = el.play(); if (p) p.catch(e => { if (e && e.name === "NotAllowedError") { BGM.engine = "wa"; BGM.err = ""; if (audioUnlocked) waPlay(src) } else BGM.err = "播放失敗：" + (e && e.name || "未知") }) }
    } else if (!el.paused) el.pause();
  }
  const mb = document.getElementById("mbtn"); if (mb) { mb.classList.toggle("off", !S.settings.music); mb.setAttribute("aria-pressed", String(S.settings.music)) }
}
function musicStatus() {
  if (!S.settings.music) return "背景音樂已關閉";
  if (BGM.err) return BGM.err;
  const tag = BGM.engine === "wa" ? "（Web Audio）" : "（音樂播放器）";
  if (BGM.engine === "wa" ? !!BGM.waNode : (BGM.el && !BGM.el.paused)) return "播放中 ♪ " + tag;
  if (BGM.waLoading) return "載入中⋯ " + tag;
  return (audioUnlocked ? "暫停中 " : "點一下畫面後開始 ") + tag + (AC ? " · 音效引擎：" + AC.state : "");
}
function musicDuck(on) {
  BGM.ducked = on; const v = Math.min(1, S.settings.musicVol * (on ? 0.3 : 1));
  if (BGM.el) BGM.el.volume = v; if (BGM.waGain && AC) BGM.waGain.gain.setTargetAtTime(v, AC.currentTime, 0.1);
}
function idb() { return new Promise((res, rej) => { const r = indexedDB.open("b612", 1); r.onupgradeneeded = () => r.result.createObjectStore("files"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) }) }
function idbDo(mode, fn) { return idb().then(db => new Promise((res, rej) => { const q = fn(db.transaction("files", mode).objectStore("files")); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })) }
if (S.settings.musicName) idbDo("readonly", st => st.get("bgm")).then(b => { if (b) { BGM.blob = b; musicSync() } }).catch(() => { });
function whenAudio(fn) {
  const ac = audio(); if (!ac) return;
  if (ac.state === "running") fn(ac); else ac.resume().then(() => fn(ac)).catch(() => { });
}
function blip(ok) {
  if (!ok && navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(60);
  if (!S.settings.sfx) return;
  whenAudio(ac => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = "square";
    const t = ac.currentTime + 0.01; const n = ok ? [660, 880] : [220, 165];
    o.frequency.setValueAtTime(n[0], t); o.frequency.setValueAtTime(n[1], t + .08);
    g.gain.setValueAtTime(.05, t); g.gain.exponentialRampToValueAtTime(.001, t + .22); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + .23);
  });
}

/* ---------- 像素圖 ---------- */
const PAL = { h: "#f2c14e", H: "#c9962e", s: "#f6d2b0", e: "#2a2440", g: "#4f9a62", G: "#3a7a4c", y: "#f7dd5a", b: "#3b2f4a", r: "#e0556e", R: "#a83a52", l: "#6cbf7a", L: "#3f8a50", t: "#7a5236", v: "#7a5568", V: "#553a4c", x: "#6d6a7c", X: "#4d4a5c", d: "#2c2236", o: "#ff8a3d", f: "#e8833a", F: "#fff1dc", k: "#2a2440", w: "#ffffff", c: "#c9e6ff", p: "#8a5cc2", P: "#5e3d8a", u: "#4a74c9", z: "#8f8c9e" };
const SPR = {
  prince: ["...hhhh...", "..hhhhhh..", ".hhhhhhhh.", ".hHhhhhHh.", "..sesses..", "..ssssss..", ".yyyyyyy..", "..gggggyyy", ".gggggggg.", ".gggggggg.", "..gggggg..", "..gg..gg..", "..gg..gg..", "..bb..bb.."],
  prince2: ["...hhhh...", "..hhhhhh..", ".hhhhhhhh.", ".hHhhhhHh.", "..sesses..", "..ssssss..", ".yyyyyyy..", "..gggggyy.", ".ggggggggy", ".gggggggg.", "..gggggg..", "..gg..gg..", "..gg..gg..", "..bb..bb.."],
  princeHappy: ["...hhhh...", "..hhhhhh..", ".hhhhhhhh.", ".hHhhhhHh.", "..sesses..", "..ssrrss..", "yyyyyyyy..", "g.ggggg.yy", "..gggggg.y", ".gggggggg.", "..gggggg..", "..gg..gg..", "..gg..gg..", "..bb..bb.."],
  rose: [".r.r.", "rrRrr", ".rrr.", "..l..", "ll.l.", "..ll.", "..l.."],
  bud: ["..r..", ".rRr.", "..l..", ".ll..", "..l..", "..ll.", "..l.."],
  wilt: [".....", "...R.", "..R..", "..l..", ".l...", "..l..", "..l.."],
  vol: ["....ddd....", "...vvvvv...", "..vvvvvvV..", ".vvvvvvvVV.", "vvvvvvvvVVV"],
  volHot: ["....dod....", "...vvvvv...", "..vvvvvvV..", ".vvvvvvvVV.", "vvvvvvvvVVV"],
  dead: ["....ddd....", "...xxxxx...", "..xxxxxxX..", ".xxxxxxxXX.", "xxxxxxxxXXX"],
  sprout: ["l.l", "LlL", ".t."],
  tree: ["..lllll..", ".lllLlll.", "lllLlLlll", ".lL.t.Ll.", "....t....", "...ttt...", "...ttt..."],
  fox: ["f...f......", "ff.ff......", "fffff......", "fkffk......", "FfffF....ff", "Ffff....fff", ".fffffffff.", ".f.f..f.f.."],
  mini: ["..h..", ".hhh.", ".ses.", ".yyy.", ".ggg.", ".g.g."],
};
function spr(ctx, rows, x, y, s = 1) { for (let j = 0; j < rows.length; j++)for (let i = 0; i < rows[j].length; i++) { const c = rows[j][i]; if (c === ".") continue; ctx.fillStyle = PAL[c]; ctx.fillRect(x + i * s, y + j * s, s, s) } }
function seeded(n) { let x = n * 9301 + 49297; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280 } }

/* Side view, facing right. Two walking frames: legs apart / legs passing, scarf flapping behind. */
SPR.walk1 = ["...hh.h...", "..hhhhhh..", ".hhhhhhhh.", "hhhhhhsss.", ".hhhhsses.", "..hhssss..", "yyyyyyyy..", "yy.gggggg.", "y..ggggg..", "...gggggg.", "..ggggggg.", "...g...g..", "..bb...bb."];
SPR.walk2 = ["...hh.h...", "..hhhhhh..", ".hhhhhhhh.", "hhhhhhsss.", ".hhhhsses.", "..hhssss..", ".yyyyyyy..", "yyygggggg.", "...ggggg..", "...gggggg.", "..ggggggg.", "....g.g...", "....bbbb.."];
SPR.roseDome = ["...ccccc...", "..c.....c..", ".c..r.r..c.", ".c.rrRrr.c.", ".c..rrr..c.", ".c...l...c.", ".c.ll.l..c.", ".c...ll..c.", ".c...l...c.", "ccccccccccc"];

Object.assign(SPR, {
  king: ["..h.h.h..", "..hhhhh..", "..sssss..", "..seses..", "..wwwww..", "...www...", ".ppppppp.", "ppwpppwpp", "ppppppppp", "PpppppppP", ".PPPPPPP."],
  vainman: ["..kkkkk..", "..kkkkk..", "..rrrrr..", "kkkkkkkkk", "..sssss..", "..seses..", "..sssss..", ".rrrrrrr.", "r.rrrrr.r", "..rrrrr..", "..b...b.."],
  drunkard: ["...zzz...", "..zzzzz..", "..sssss..", "..sesse..", "..sssss..", ".uuuuuuu.", "uuuuuuull", "uuuuuuul.", ".uuuuuu..", ".uu..uu..", ".bb..bb.."],
  businessman: ["..sssss..", ".sssssss.", ".skkskks.", ".sssssss.", "..sssss..", ".XXXrXXX.", "XXXXrXXXX", "XXXXXXXXX", ".XXXXXXX.", ".XX...XX.", ".bb...bb."],
  lamplighter: ["..uuuu..o", ".uuuuuu.o", "..ssss..k", "..sess..k", "..ssss..k", ".uuuuuu.k", "uuuuuuusk", ".uuuuuu.k", ".uuuuuu.k", ".uu..uu.k", ".bb..bb.k"],
  geographer: ["..zzzzz..", "..sssss..", "..kskks..", "..wwwww..", "..wwwww..", "...www...", ".ttttttt.", "tttFFFttt", "ttttttttt", ".ttttttt.", ".tt...tt."],
  crown: ["h.h.h", "hhhhh", "hrhuh"],
  hat: [".kkk.", ".kkk.", ".rrr.", "kkkkk"],
  hourglass: ["ttttt", ".cyc.", "..y..", ".cyc.", ".yyy.", "ttttt"],
  starjar: [".ttt.", "c...c", "cy.yc", "c.y.c", "cyyyc", "ccccc"],
  lamp: [".kkk.", "kyyyk", ".kyk.", "..k..", "..k..", "..k..", "..k..", ".kkk."],
  globe: [".uuu.", "ulluu", "uuull", ".uuu.", "..t..", ".ttt."],
});
const RESIDENT = { king: SPR.king, vain: SPR.vainman, drunk: SPR.drunkard, biz: SPR.businessman, lamp: SPR.lamplighter, geo: SPR.geographer, earth: SPR.fox };
const GIFT_AT = { crown: 1.55, hat: -1.2, hourglass: 2.2, starjar: -1.95, lamp: -2.7, globe: 2.5, fox: 1.0 };
const sprCache = new Map();
function sprCanvas(rows, flip) {
  const key = rows.join("|") + (flip ? "<" : "");
  if (sprCache.has(key)) return sprCache.get(key);
  const c = document.createElement("canvas"); c.width = rows[0].length; c.height = rows.length;
  spr(c.getContext("2d"), flip ? rows.map(r => r.split("").reverse().join("")) : rows, 0, 0);
  sprCache.set(key, c); return c;
}

/* The whole little planet is visible; things on it sit at an angle (0 = top, clockwise) and turn with PHI. */
const W = 112, H = 84, PX = 56, PY = 50, PR = 24;
const PLACES = { v0: -0.55, v1: -0.95, v2: 2.3, rose: 0.6, baobab: [1.2, -1.5, 2.8, -2.4, 1.85, -3.0] };
const CRATERS = [[9, 0.3], [16, -0.9], [12, 1.9], [19, 2.6], [7, -2.2], [18, -1.8], [14, 0.9]];
const walker = { phi: 0, vel: 0, dist: 0, face: 1, dragging: false, talk: 0 };
function polar(r, a) { return [PX + r * Math.sin(a), PY - r * Math.cos(a)] }
function onPlanet(ctx, rows, ang, lift = 0) {
  const c = sprCanvas(rows); ctx.save(); ctx.translate(PX, PY); ctx.rotate(ang);
  ctx.drawImage(c, -Math.floor(c.width / 2), -PR - c.height + 1 - lift); ctx.restore();
}
function drawScene(cv, tick, opt) {
  const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
  // sky: 0 night · 1 sun going down · 2 sun almost gone · 3 the starry night after the day's sunset
  const sky = opt.sky || 0, sunset = sky === 1 || sky === 2, phi = walker.phi;
  const bands = [["#0d1129", "#11163a", "#151b45", "#1a2150", "#20285c", "#262f68"],
    ["#3a4a8a", "#5b5a9a", "#9a6a8f", "#d98a6a", "#f2b56a", "#f8d27a"],
    ["#2b2f6b", "#4c3a78", "#8a4c7c", "#c8636d", "#ee8f5c", "#f6b766"],
    ["#0a0d24", "#101438", "#1a1a48", "#272356", "#362a5e", "#4b3268"]][sky];
  const bh = Math.ceil(H / bands.length);
  for (let b = 0; b < bands.length; b++) {
    ctx.fillStyle = bands[b]; ctx.fillRect(0, b * bh, W, bh);
    if (b > 0) { ctx.fillStyle = bands[b - 1]; for (let x = 0; x < W; x += 2) { ctx.fillRect(x + (b % 2), b * bh, 1, 1); ctx.fillRect(x + ((b + 1) % 2), b * bh + 1, 1, 1) } }
  }
  const r1 = seeded(7);
  for (let i = 0; i < 55; i++) { const x = Math.floor(r1() * W), y = Math.floor(r1() * H); const tw = (Math.floor(tick / 3) + i) % 9 === 0; ctx.fillStyle = tw ? "#ffffff" : (sunset ? "rgba(255,230,200,.35)" : "rgba(200,205,255,.45)"); ctx.fillRect(x, y, 1, 1) }
  const r2 = seeded(42);
  for (let i = 0; i < Math.min(opt.stars, 400); i++) {
    let x = 4 + Math.floor(r2() * (W - 8)), y = 3 + Math.floor(r2() * (H - 6));
    if (Math.hypot(x - PX, y - PY) < PR + 18) continue;
    const on = (Math.floor(tick / 2) + i) % 7 !== 0;
    ctx.fillStyle = on ? "#ffe9a8" : "#f2c14e"; ctx.fillRect(x, y, 1, 1); ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x, y + 1, 1, 1);
    if (on) { ctx.fillStyle = "#fff"; ctx.fillRect(x, y, 1, 1) }
  }
  const sp = tick % 90; if (sp < 8) { ctx.fillStyle = "#fff"; for (let k = 0; k < 4; k++)ctx.fillRect(104 - sp * 5 + k * 2, 6 + sp * 2 - k, 1, 1) }
  if (sunset) { const sy = sky === 1 ? 54 : 76; ctx.fillStyle = sky === 1 ? "#ffe08a" : "#ffb35c"; for (let y = -9; y <= 9; y++) { const hw = Math.floor(Math.sqrt(81 - y * y)); ctx.fillRect(98 - hw, sy + y, hw * 2, 1) } }
  if (sky === 3) { const r3 = seeded(99); for (let i = 0; i < 30; i++) { const x = Math.floor(r3() * W), y = Math.floor(r3() * H); if ((Math.floor(tick / 2) + i) % 5) { ctx.fillStyle = "#fff6d0"; ctx.fillRect(x, y, 1, 1) } } }
  // planet body, light from upper left
  for (let y = -PR - 1; y <= PR + 1; y++) {
    const hw = Math.floor(Math.sqrt(Math.max(0, (PR + 1) * (PR + 1) - y * y)));
    ctx.fillStyle = "#2a1f3a"; ctx.fillRect(PX - hw, PY + y, hw * 2 + 1, 1);
  }
  for (let y = -PR; y <= PR; y++) {
    const hw = Math.floor(Math.sqrt(Math.max(0, PR * PR - y * y)));
    for (let x = -hw; x <= hw; x++) {
      const d = Math.hypot(x + PR * 0.45, y + PR * 0.45) / PR;   // light from upper left, crescent shadow lower right
      ctx.fillStyle = d > 1.2 ? (sunset ? "#a8724e" : "#8f6b4a") : d > 0.7 ? (sunset ? "#d29a64" : "#b8905f") : (sunset ? "#e8b67a" : "#d3ad74");
      ctx.fillRect(PX + x, PY + y, 1, 1);
    }
  }
  ctx.fillStyle = sunset ? "#9c6a48" : "#8c6646";
  CRATERS.forEach(([r, a]) => { const [x, y] = polar(r, a + phi); ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1); ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 1) });
  // things on the planet
  opt.baobabs.slice(0, 6).forEach((od, i) => onPlanet(ctx, od > 2 ? SPR.tree : SPR.sprout, PLACES.baobab[i] + phi));
  [0, 1, 2].forEach(i => {
    const a = PLACES["v" + i] + phi, dirty = !opt.done[i];
    onPlanet(ctx, i === 2 ? SPR.dead : (dirty && tick % 4 < 2 ? SPR.volHot : SPR.vol), a);
    if (dirty) {
      const [x, y] = polar(PR + 6, a);
      for (let k = 0; k < 4; k++) { const p = (tick + k * 4) % 14; ctx.fillStyle = k % 2 ? "#8d8aa8" : "#b9b6cf"; ctx.fillRect(Math.round(x + Math.sin((p + k) / 3) * 2), Math.round(y - p), 2, 2) }
    }
  });
  (opt.gifts || []).forEach(g => { if (g !== "fox") onPlanet(ctx, SPR[g], GIFT_AT[g] + phi) });
  if (opt.fox) onPlanet(ctx, SPR.fox, GIFT_AT.fox + phi);
  const st = opt.streak;
  onPlanet(ctx, st >= 7 ? SPR.roseDome : st === 0 ? SPR.wilt : st < 3 ? SPR.bud : SPR.rose, PLACES.rose + phi);
  // the prince always stands on top; side view while walking
  const moving = walker.dragging || Math.abs(walker.vel) > 0.002;
  let rows;
  if (moving) rows = Math.floor(walker.dist / 0.09) % 2 ? SPR.walk2 : SPR.walk1;
  else rows = sky === 3 ? SPR.princeHappy : (tick % 6 < 3 ? SPR.prince : SPR.prince2);
  const c = sprCanvas(rows, moving && walker.face < 0);
  const hop = opt.jump > 0 ? Math.round(Math.sin(opt.jump / 6 * Math.PI) * 4) : 0;
  ctx.drawImage(c, PX - Math.floor(c.width / 2), PY - PR - c.height + 1 - hop);
}
function drawIcon(cv, rows, scale) { const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cv.width, cv.height); spr(ctx, rows, Math.floor((cv.width - rows[0].length * scale) / 2), Math.floor((cv.height - rows.length * scale) / 2), scale) }
function drawJourney(cv, frac, tick) {
  const ctx = cv.getContext("2d"), w = 128, h = 24; ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0f1430"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#3a4277"; for (let x = 8; x < 120; x += 3) ctx.fillRect(x, 19, 1, 1);
  STOPS.forEach((p, i) => {
    const x = 8 + Math.round(i * 112 / (STOPS.length - 1)), r = i === 7 ? 3 : 2;
    ctx.fillStyle = frac >= i / (STOPS.length - 1) - 1e-9 ? p.col : "#3a4277";
    for (let y = -r; y <= r; y++) { const hw = Math.floor(Math.sqrt(r * r - y * y + .5)); ctx.fillRect(x - hw, 19 + y, hw * 2 + 1, 1) }
  });
  const mx = 8 + Math.round(Math.min(1, frac) * 112);
  spr(ctx, Math.floor(tick / 2) % 2 ? SPR.walk2 : SPR.walk1, Math.max(0, Math.min(w - 10, mx - 5)), 3);
}

function shadeHex(hex, f) { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f)))); return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("") }
function drawVisit(cv, stop, tick) {
  const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
  const bands = ["#0d1129", "#11163a", "#151b45", "#1a2150", "#20285c", "#262f68"], bh = Math.ceil(H / bands.length);
  bands.forEach((c, b) => { ctx.fillStyle = c; ctx.fillRect(0, b * bh, W, bh) });
  const r1 = seeded(stop.id.length * 13);
  for (let i = 0; i < 60; i++) { const x = Math.floor(r1() * W), y = Math.floor(r1() * H); ctx.fillStyle = (Math.floor(tick / 3) + i) % 9 ? "rgba(200,205,255,.5)" : "#fff"; ctx.fillRect(x, y, 1, 1) }
  // far away: a tiny B612 to fly home to
  ctx.fillStyle = "#c49a68"; for (let y = -3; y <= 3; y++) { const hw = Math.floor(Math.sqrt(9 - y * y + .5)); ctx.fillRect(100 - hw, 14 + y, hw * 2 + 1, 1) }
  const cx = 56, cy = 58, r = 20;
  for (let y = -r - 1; y <= r + 1; y++) { const hw = Math.floor(Math.sqrt(Math.max(0, (r + 1) * (r + 1) - y * y))); ctx.fillStyle = "#1a1430"; ctx.fillRect(cx - hw, cy + y, hw * 2 + 1, 1) }
  for (let y = -r; y <= r; y++) { const hw = Math.floor(Math.sqrt(Math.max(0, r * r - y * y))); for (let x = -hw; x <= hw; x++) { const d = Math.hypot(x + r * .45, y + r * .45) / r; ctx.fillStyle = d > 1.2 ? shadeHex(stop.col, .62) : d > .7 ? shadeHex(stop.col, .82) : stop.col; ctx.fillRect(cx + x, cy + y, 1, 1) } }
  const at = (rows, ang) => { const c = sprCanvas(rows); ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.drawImage(c, -Math.floor(c.width / 2), -r - c.height + 1); ctx.restore() };
  if (stop.id === "b612") { at(SPR.rose, .5); at(SPR.vol, -.6) }
  else {
    at(RESIDENT[stop.id], 0.18);
    at(tick % 6 < 3 ? SPR.walk1 : SPR.walk2, -0.42);
    if (stop.gift && stop.gift !== "fox") at(SPR[stop.gift], 0.85);
  }
}

/* The prince talks in chiptune babble, not the word-reading voice. */
const PRINCE_LINES = ["你好呀！", "今天也要清火山喔", "我的玫瑰在等我", "Bonjour!", "你看，星星又多一顆了", "往右邊走走看？", "猴麵包樹要趁小拔掉", "我們一起去地球吧", "嘿嘿", "今天想看夕陽"];
function babble(n) {
  if (!S.settings.sfx) return;
  whenAudio(ac => {
    const t0 = ac.currentTime + 0.02, base = 900 + Math.random() * 200;
    for (let i = 0; i < Math.min(n, 9); i++) {
      const o = ac.createOscillator(), g = ac.createGain(), t = t0 + i * 0.075;
      o.type = "triangle"; o.frequency.setValueAtTime(base * (0.85 + Math.random() * 0.45), t);
      o.frequency.exponentialRampToValueAtTime(base * 1.3, t + 0.05);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.07);
    }
  });
}
function princeTalk(bubble) {
  const line = PRINCE_LINES[Math.floor(Math.random() * PRINCE_LINES.length)];
  bubble.textContent = line; bubble.hidden = false; jump = 6; babble(line.length);
  clearTimeout(princeTalk.t); princeTalk.t = setTimeout(() => bubble.hidden = true, 2200);
}
function bindWalk(cv, bubble) {
  let sx = 0, lx = 0, st = 0, moved = 0;
  cv.addEventListener("pointerdown", e => { walker.dragging = true; sx = lx = e.clientX; st = performance.now(); moved = 0; cv.setPointerCapture?.(e.pointerId) });
  cv.addEventListener("pointermove", e => {
    if (!walker.dragging) return;
    const dx = e.clientX - lx; lx = e.clientX; moved += Math.abs(dx);
    if (!dx) return;
    const k = 4 / cv.clientWidth;                 // a full swipe across turns the planet about 4 radians
    walker.vel = -dx * k; walker.phi += walker.vel; walker.dist += Math.abs(walker.vel); walker.face = dx > 0 ? 1 : -1;
  });
  const end = () => {
    if (!walker.dragging) return; walker.dragging = false;
    if (moved < 6 && performance.now() - st < 400) { walker.vel = 0; princeTalk(bubble) }
  };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  cv.addEventListener("keydown", e => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const d = e.key === "ArrowRight" ? 1 : -1; walker.face = d; walker.vel = -d * 0.06 }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); princeTalk(bubble) }
  });
}

/* ---------- 畫面 ---------- */
const app = document.getElementById("app");
let view = "home", SES = null, tick = 0, anim = null, colFilter = "all", openWord = null, confirmReset = false, lastResult = null, jump = 0;
function go(v) { view = v; render(); window.scrollTo(0, 0) }
function render() {
  cancelAnimationFrame(anim); anim = null;
  ensureToday();
  setTimeout(musicSync, 0);
  ({ home: renderHome, learn: renderLearn, quiz: renderQuiz, result: renderResult, cards: renderCards, settings: renderSettings, planets: renderPlanets, land: renderLand })[view]();
}
function skyStage() { return S.today.done.filter(Boolean).length }
function sceneOpts(sky) {
  const t = today();
  const gifts = STOPS.filter(st => st.gift && S.visited.includes(st.id)).map(st => st.gift);
  return { sky, jump, gifts, fox: gifts.includes("fox") || foxHourNow(), stars: stars(), done: S.today.done, streak: streak(), baobabs: dueWords().map(w => t - ws(w.id).due).sort((a, b) => b - a) };
}
function startAnim(cv, sunset, journey) {
  let last = 0; const total = ALL().length || 1;
  const frame = () => { drawScene(cv, tick, sceneOpts(sunset)); if (journey) drawJourney(journey, Math.min(1, seenCount() / (LEG * (STOPS.length - 1))), tick) };
  const loop = ts => {
    const moving = walker.dragging || Math.abs(walker.vel) > 0.002;
    if (!walker.dragging && moving) { walker.phi += walker.vel; walker.dist += Math.abs(walker.vel); walker.vel *= 0.93 }
    else if (!walker.dragging) walker.vel = 0;
    if (ts - last > 125) { tick++; if (jump > 0) jump--; last = ts; frame() }
    else if (moving) drawScene(cv, tick, sceneOpts(sunset));
    anim = requestAnimationFrame(loop);
  };
  frame();
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) anim = requestAnimationFrame(loop);
}
function isStandalone() { return window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches }

function v3List() {
  const due = dueWords().sort((a, b) => ws(b.id).wr - ws(a.id).wr || ws(a.id).due - ws(b.id).due).slice(0, 30).map(w => ({ id: w.id, mode: "srs" }));
  if (due.length < 10) {
    const learned = [...S.today.v1, ...S.today.v2].filter(id => ws(id).seen && !due.some(d => d.id === id));
    const extra = learned.length ? learned : ALL().filter(w => ws(w.id).seen && ws(w.id).s < STAR_STAGE && !due.some(d => d.id === w.id)).map(w => w.id);
    shuffle(extra).slice(0, Math.max(0, 15 - due.length)).forEach(id => due.push({ id, mode: "practice" }));
  }
  return due;
}

function renderHome() {
  const T = S.today, due = dueWords().length, st = streak(), nStars = stars(), total = ALL().length, anySeen = seenCount() > 0;
  const allDone = T.done.every(Boolean);
  const vols = [
    { t: "活火山 · 第一座", s: T.v1.length ? `新單字 ${T.v1.length} 個 · 約 5 分鐘` : "新單字都遇見過了，改成隨機複習", lock: false },
    { t: "活火山 · 第二座", s: T.v2.length ? `新單字 ${T.v2.length} 個 · 約 5 分鐘` : "新單字都遇見過了，改成隨機複習", lock: !T.done[0] },
    { t: "死火山", s: due ? `複習到期單字 ${Math.min(due, 30)} 個` : "今天學過的字再考一次", lock: !anySeen },
  ];
  const fh = S.settings.foxHour, foxNow = foxHourNow(), nx = nextStop();
  const line = allDone ? "三座火山都清好了，今天的夕陽已經落下，滿天星星。明天見！"
    : foxNow ? `狐狸來了！現在是狐狸時間（${fh}:00–${fh}:59），這時候清火山牠會很開心。`
    : LINES[today() % LINES.length];
  const showInstall = !isStandalone() && !S.installHidden;
  app.innerHTML = `
  <header class="top">
    <div class="logo">B612<small>單字星球 · ${esc(currentDeck())}</small></div>
    <div class="hdr-r"><button class="mbtn ${S.settings.music ? "" : "off"}" id="mbtn" aria-label="背景音樂" aria-pressed="${S.settings.music}">${noteSvg()}</button>
    <div class="count">距離多益 1/9<b>${daysLeft()} 天</b></div></div>
  </header>
  <div class="stage">
    <canvas class="scene" id="scene" width="${W}" height="${H}" tabindex="0" role="img" aria-label="B612 星球：小王子、玫瑰、三座火山${due ? `和 ${due} 棵猴麵包樹` : ""}，天上有 ${nStars} 顆點亮的星星。左右滑動可以繞著星球走，點一下小王子會說話"></canvas>
    <p class="bubble" id="bubble" hidden></p>
    <span class="hint">← 左右滑動繞星球 →</span>
  </div>
  <p class="line">${esc(line)}</p>
  <button class="journey" id="journeyBtn" aria-label="打開星球之旅">
    <canvas id="journey" width="128" height="24" aria-hidden="true"></canvas>
    <span class="lbl"><span>B612</span><span>${nx ? `下一站：${esc(nx.stop.name)} · 還差 ${nx.left} 字` : "已經抵達地球"}</span><span>地球（考場）</span></span>
  </button>
  <div class="chips">
    <span class="chip"><i style="background:var(--rose)"></i>玫瑰連續<b>${st} 天</b></span>
    <span class="chip"><i style="background:var(--gold)"></i>點亮星星<b>${nStars}</b></span>
    <span class="chip"><i style="background:var(--leaf)"></i>猴麵包樹<b>${due}</b></span>
    <span class="chip"><i style="background:var(--ember)"></i>看過夕陽<b>${S.sunsets.length} 次</b></span>
    <span class="chip"><i style="background:#e8833a"></i>狐狸好感<b>${S.foxDays.length}</b></span>
    <span class="chip"><i style="background:#9b72cf"></i>紀念物<b>${S.visited.length} / 7</b></span>
  </div>
  <div class="list">
    ${vols.map((v, i) => `<button class="btn vol" data-vol="${i}" ${v.lock || T.done[i] ? "disabled" : ""}>
      <canvas width="24" height="14" style="width:48px;height:28px" data-icon="${i}"></canvas>
      <span><span class="t">${v.t}</span><br><span class="s">${esc(v.s)}</span></span>
      <span class="tag ${T.done[i] ? "clean" : v.lock ? "lock" : "smoke"}">${T.done[i] ? "已清理" : v.lock ? (i === 1 ? "先清第一座" : "先學新字") : "冒煙中"}</span>
    </button>`).join("")}
    ${bonusIds().length ? `<button class="btn vol" data-vol="4">
      <canvas width="24" height="14" style="width:48px;height:28px" data-icon="4"></canvas>
      <span><span class="t">加碼 · 讀完 ${esc(deckTitle(byId(bonusIds()[0]).deck))}</span><br><span class="s">還剩 ${bonusIds().length} 個新字，清完明天就從新單元開始</span></span>
      <span class="tag smoke">可選</span></button>` : ""}
    ${T.done[2] && due ? `<button class="btn vol" data-vol="3">
      <canvas width="24" height="14" style="width:48px;height:28px" data-icon="3"></canvas>
      <span><span class="t">拔猴麵包樹</span><br><span class="s">還有 ${due} 棵，每次拔 15 棵</span></span>
      <span class="tag clean">加碼</span></button>` : ""}
  </div>
  <p class="note">每座火山每天只能清一次，午夜會重新冒煙；沒清的機會不會留到明天。</p>
  ${needBackup() ? `<div class="install" id="bk">
    <div class="row"><b>幫進度拍張照吧</b><button class="btn small" id="bkCopy">複製備份碼</button></div>
    <span class="note">進度只存在這支手機的 B612 裡。複製備份碼貼到備忘錄，萬一 App 被刪掉或換手機，到設定貼回來就能還原。</span>
  </div>` : ""}
  ${showInstall ? `<div class="install">
    <div class="row"><b>把 B612 放到手機主畫面</b><button class="btn small" id="hideInstall" aria-label="不再顯示">✕</button></div>
    <span>iPhone：用 Safari 打開 → 下方「分享」→「加入主畫面」。<br>Android：Chrome 右上角 ⋮ →「加到主畫面」。</span>
    <span class="note">放到主畫面後打開就像 App，也比較不會被瀏覽器清掉進度。</span>
  </div>` : ""}
  <nav class="nav">
    <button class="btn" data-go="cards">星空圖鑑</button>
    <button class="btn" data-go="settings">設定</button>
  </nav>`;
  const cv = document.getElementById("scene");
  startAnim(cv, skyStage(), document.getElementById("journey"));
  document.getElementById("journeyBtn").onclick = () => go("planets");
  document.getElementById("mbtn").onclick = () => { S.settings.music = !S.settings.music; save(); unlockAudio(); musicSync(); toast(S.settings.music ? "背景音樂開啟" : "背景音樂關閉", 1400) };
  bindWalk(cv, document.getElementById("bubble"));
  app.querySelectorAll("[data-icon]").forEach(c => { const i = +c.dataset.icon; drawIcon(c, i === 3 ? SPR.tree : i === 2 ? SPR.dead : SPR.volHot, 2) });
  app.querySelectorAll("[data-vol]").forEach(b => b.onclick = () => startSession(+b.dataset.vol));
  app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  const bk = document.getElementById("bkCopy"); if (bk) bk.onclick = () => copyBackup(() => renderHome());
  const hi = document.getElementById("hideInstall"); if (hi) hi.onclick = () => { S.installHidden = true; save(); renderHome() };
}

/* ---------- 清火山（一回合） ---------- */
function deckTitle(id) { const d = DECKS.find(d => d.id === id); return d ? d.title.split(" · ")[0] : "我的單字" }
// After both new-word volcanoes, if today's unit still has words left, offer them so tomorrow starts on a fresh unit.
function bonusIds() {
  const T = S.today; if (!T.done[1] || !T.v2.length) return [];
  const lastDeck = byId(T.v2[T.v2.length - 1]).deck;
  return unitPool().filter(id => byId(id).deck === lastDeck).slice(0, Math.ceil(S.settings.perDay / 2));
}
function startSession(kind) {
  const T = S.today;
  SES = { kind, first: {}, retries: {}, right: 0, wrong: 0, newStars: 0, combo: 0, best: 0, mode: {}, q: [], cur: null, answered: false };
  if (kind < 2 || kind === 4) {
    const ids = kind === 0 ? T.v1 : kind === 1 ? T.v2 : bonusIds();
    if (ids.length) {
      ids.forEach(id => SES.mode[id] = "new");
      SES.chunks = []; for (let i = 0; i < ids.length; i += 5) SES.chunks.push(ids.slice(i, i + 5));
      SES.ci = 0; SES.li = 0; SES.total = ids.length;
      view = "learn"; render(); return;
    }
    const pool = shuffle(ALL().filter(w => ws(w.id).seen).map(w => w.id)).slice(0, 15);
    pool.forEach(id => SES.mode[id] = ws(id).due <= today() ? "srs" : "practice");
    SES.q = pool; SES.total = pool.length;
  } else {
    const list = kind === 2 ? v3List() : dueWords().sort((a, b) => ws(a.id).due - ws(b.id).due).slice(0, 15).map(w => ({ id: w.id, mode: "srs" }));
    list.forEach(x => SES.mode[x.id] = x.mode);
    SES.q = shuffle(list.map(x => x.id)); SES.total = SES.q.length;
  }
  if (!SES.q.length) { finishSession(); return }
  nextQ();
}
function topBar(done, total, label) {
  const prog = Math.round(done / Math.max(1, total) * 100);
  return `<div class="qtop">
    <button class="btn small" id="quit" aria-label="回到星球">✕</button>
    <div class="bar" role="progressbar" aria-label="${label}" aria-valuenow="${prog}" aria-valuemin="0" aria-valuemax="100"><span style="width:${prog}%"></span></div>
    <span class="combo" id="combo">${SES.combo >= 3 ? "連擊×" + SES.combo : `<span class="note en">${done}/${total}</span>`}</span>
  </div>`;
}
function renderLearn() {
  const chunk = SES.chunks[SES.ci], id = chunk[SES.li], w = byId(id);
  const seenSoFar = SES.chunks.slice(0, SES.ci).flat().length + SES.li;
  app.innerHTML = `
  ${topBar(seenSoFar, SES.total, "新單字進度")}
  <p class="prompt">新朋友 ${SES.li + 1}/${chunk.length} · 先認識，等一下就考這 ${chunk.length} 個</p>
  <article class="card enter">
    <div class="row"><button class="word" id="w" lang="en">${esc(w.w)}</button><button class="speak" id="say" aria-label="播放發音">${speakerSvg()}</button></div>
    <span class="pos">${esc(w.pos)}</span>
    <p class="zh">${esc(w.zh)}</p>
    ${exHtml(w)}
    ${w.tip ? `<div class="tip"><span class="lab">記憶小技巧</span>${esc(w.tip)}</div>` : ""}
  </article>
  <button class="btn gold center" id="next">${SES.li < chunk.length - 1 ? "認識了，下一個" : "認識了，開始清火山"}</button>`;
  document.getElementById("say").onclick = () => speak(w.w);
  document.getElementById("w").onclick = () => speak(w.w);
  bindEx(app);
  document.getElementById("quit").onclick = () => go("home");
  document.getElementById("next").onclick = () => {
    if (SES.li < chunk.length - 1) { SES.li++; renderLearn() }
    else { SES.q = shuffle(chunk); nextQ() }
  };
  speak(w.w);
}
function makeQ(id) {
  const w = byId(id), mode = SES.mode[id];
  const types = mode === "new" ? ["en2zh", "en2zh", "zh2en"] : ["en2zh", "ear2zh", "zh2en"];
  const type = types[Math.floor(Math.random() * types.length)];
  const others = ALL().filter(x => x.id !== id && x.zh !== w.zh && x.w.toLowerCase() !== w.w.toLowerCase());
  const same = shuffle(others.filter(x => x.pos === w.pos)), diff = shuffle(others.filter(x => x.pos !== w.pos));
  const opts = shuffle([w, ...same.concat(diff).slice(0, 3)]);
  return { id, type, opts, ans: opts.indexOf(w) };
}
function nextQ() {
  if (!SES.q.length) {
    if (SES.chunks && SES.ci < SES.chunks.length - 1) { SES.ci++; SES.li = 0; view = "learn"; render(); return }
    finishSession(); return;
  }
  SES.cur = makeQ(SES.q.shift()); SES.answered = false; view = "quiz"; render();
}
function renderQuiz() {
  const q = SES.cur, w = byId(q.id), x = ws(q.id);
  const prompts = { en2zh: "這個字是什麼意思？", ear2zh: "聽聽看，這是什麼意思？", zh2en: "哪一個英文是這個意思？" };
  app.innerHTML = `
  ${topBar(Object.keys(SES.first).length, SES.total, "火山清理進度")}
  <p class="prompt">${x.wr >= 3 ? "頑固單字出沒！ " : ""}${prompts[q.type]}</p>
  <article class="card enter" id="qcard">
    ${q.type === "en2zh" ? `<div class="row"><button class="word" id="w" lang="en">${esc(w.w)}</button><button class="speak" id="say" aria-label="播放發音">${speakerSvg()}</button></div><span class="pos">${esc(w.pos)}</span>` : ""}
    ${q.type === "ear2zh" ? `<button class="speak big" id="say" aria-label="播放發音">${speakerSvg(2)}</button><p class="note center">點喇叭可以重聽</p>` : ""}
    ${q.type === "zh2en" ? `<p class="zh" style="font-size:26px">${esc(w.zh)}</p><span class="pos">${esc(w.pos)}</span>` : ""}
  </article>
  <div class="choices" id="choices">
    ${q.opts.map((o, i) => `<button class="btn ${q.type === "zh2en" ? "en" : ""}" data-i="${i}" ${q.type === "zh2en" ? 'lang="en"' : ""}>${esc(q.type === "zh2en" ? o.w : o.zh)}</button>`).join("")}
  </div>
  <div id="reveal"></div>`;
  document.getElementById("quit").onclick = () => go("home");
  const say = document.getElementById("say"); if (say) say.onclick = () => speak(w.w);
  const wb = document.getElementById("w"); if (wb) wb.onclick = () => speak(w.w);
  app.querySelectorAll("[data-i]").forEach(b => b.onclick = () => answer(+b.dataset.i));
  if (q.type !== "zh2en") speak(w.w);
}
function applySRS(id, ok) {
  const mode = SES.mode[id], x = ws(id), t = today();
  if (mode === "new") { setWs(id, { t: Date.now(), seen: true, s: ok ? 1 : 0, due: clampDue(t + 1), wr: x.wr + (ok ? 0 : 1) }); return }
  if (mode === "practice") { if (!ok) setWs(id, { t: Date.now(), wr: x.wr + 1, due: Math.min(x.due, clampDue(t + 1)) }); return }
  if (ok) { const ns = Math.min(x.s + 1, 5); if (ns >= STAR_STAGE && x.s < STAR_STAGE) SES.newStars++; setWs(id, { t: Date.now(), s: ns, due: clampDue(t + INTERVALS[ns]) }) }
  else setWs(id, { t: Date.now(), s: 0, due: clampDue(t + 1), wr: x.wr + 1 });
}
function answer(i) {
  if (SES.answered) return; SES.answered = true;
  const q = SES.cur, w = byId(q.id), ok = i === q.ans;
  if (!(q.id in SES.first)) { SES.first[q.id] = ok; applySRS(q.id, ok); ok ? SES.right++ : SES.wrong++; save() }
  if (ok) { SES.combo++; SES.best = Math.max(SES.best, SES.combo) } else SES.combo = 0;
  if (!ok) { const r = SES.retries[q.id] || 0; if (r < 2) { SES.retries[q.id] = r + 1; SES.q.splice(Math.min(SES.q.length, 2), 0, q.id) } }
  blip(ok);
  const card = document.getElementById("qcard");
  const btns = app.querySelectorAll("[data-i]"); btns.forEach(b => b.disabled = true);
  btns[q.ans].disabled = false; btns[q.ans].classList.add("right");
  const cb = document.getElementById("combo"); if (cb && SES.combo >= 3) cb.textContent = "連擊×" + SES.combo;
  if (ok) {
    card.insertAdjacentHTML("beforeend", `<span class="pop" aria-hidden="true">+★</span>`);
    if (q.type !== "en2zh") speak(w.w);
    setTimeout(() => { if (SES && SES.cur === q) nextQ() }, q.type === "en2zh" ? 700 : 1100);
    return;
  }
  btns[i].disabled = false; btns[i].classList.add("wrong");
  card.classList.remove("enter"); card.classList.add("shake");
  speak(w.w);
  const x = ws(q.id), showHook = w.hook && x.wr >= 2;
  document.getElementById("reveal").innerHTML = `
   <article class="card enter">
     <div class="row"><button class="word" id="w2" lang="en" style="font-size:28px">${esc(w.w)}</button><button class="speak" id="say2" aria-label="播放發音">${speakerSvg()}</button></div>
     <span class="pos">${esc(w.pos)}　<span style="font-family:var(--font-zh);color:var(--ink)">${esc(w.zh)}</span></span>
     ${exHtml(w)}
     ${showHook ? hookHtml(w, true) : ""}
     ${w.tip ? `<div class="tip"><span class="lab">記憶小技巧</span>${esc(w.tip)}</div>` : ""}
     ${w.hook && !showHook ? `<p class="note">再錯一次，就會解鎖這個字的電影記憶句。</p>` : ""}
   </article>
   <button class="btn gold center" id="cont" style="margin-top:12px">知道了，繼續</button>`;
  document.getElementById("say2").onclick = () => speak(w.w);
  document.getElementById("w2").onclick = () => speak(w.w);
  document.getElementById("cont").onclick = nextQ;
  bindEx(document.getElementById("reveal"));
  document.getElementById("reveal").scrollIntoView({ behavior: "smooth", block: "start" });
}
function exHtml(w) { return w.ex ? `<div class="exrow"><p class="ex" lang="en">${esc(w.ex)}</p><button class="speak sm" data-say-ex="${esc(w.id)}" aria-label="播放例句">${speakerSvg()}<span>句子</span></button></div><p class="exzh">${esc(w.exZh)}</p>` : "" }
function bindEx(root) { root.querySelectorAll("[data-say-ex]").forEach(b => b.onclick = e => { e.stopPropagation(); const w = byId(b.dataset.sayEx); speak(w.ex, 0.92) }) }
let foxImg = null;
function foxSrc() { if (!foxImg) { const c = document.createElement("canvas"); c.width = 11; c.height = 8; spr(c.getContext("2d"), SPR.fox, 0, 0); foxImg = c.toDataURL() } return foxImg }
function hookHtml(w, coach) { const h = w.hook; return `<div class="hook">${coach ? `<div class="coach"><img src="${foxSrc()}" alt="" width="33" height="24"><span>狐狸：「這個字好像很難馴養。我陪你，用這句來記。」</span></div>` : ""}<span class="lab">記憶句 · 頑固單字解鎖</span>${h.q ? `<p class="ex" lang="en">“${esc(h.q)}”</p><span class="note" lang="en">— ${esc(h.src)}${h.zh ? `（${esc(h.zh)}）` : ""}</span>` : `<span class="src" lang="en">${esc(h.src)}</span>${h.zh ? `<span class="note">${esc(h.zh)}</span>` : ""}`}<span>${esc(h.note)}</span></div>` }
function finishSession() {
  const T = S.today, t = today();
  if (SES.kind < 3) T.done[SES.kind] = true;
  if (SES.kind === 4) T.v2 = T.v2.concat(Object.keys(SES.mode));
  const firstSunset = !S.sunsets.includes(t);
  if (firstSunset) S.sunsets.push(t);
  T.stars = (T.stars || 0) + SES.newStars;
  const fox = foxHourNow() && !S.foxDays.includes(t);
  if (fox) S.foxDays.push(t);
  save();
  lastResult = { kind: SES.kind, right: SES.right, wrong: SES.wrong, newStars: SES.newStars, best: SES.best, firstSunset, n: S.sunsets.length, stage: skyStage(), dayStars: T.stars, fox };
  SES = null; go("result");
}
function renderResult() {
  const r = lastResult; const names = ["第一座活火山", "第二座活火山", "死火山", "猴麵包樹", "加碼火山"];
  const stage = Math.max(1, r.stage);
  let big, note;
  if (r.kind === 3) { big = "做得好"; note = "猴麵包樹越少，B612 越安全。" }
  else if (r.kind === 4) { big = "單元讀完了"; note = "明天開始，一天剛好一個單元。" }
  else if (stage === 3) { big = "今天的夕陽落下了"; note = `三座火山都清好了${r.dayStars ? `，今天點亮了 ${r.dayStars} 顆新星星` : "，今晚的星空屬於你"}。離考試還有 ${daysLeft()} 天。` }
  else if (r.firstSunset) { big = `第 ${r.n} 次夕陽`; note = `小王子曾經在一天裡看了 44 次夕陽。離考試還有 ${daysLeft()} 天。` }
  else { big = "夕陽更低了"; note = "今天還剩一座火山，清完就能看到今晚的星空。" }
  const foxLine = r.fox ? `你準時在狐狸時間來了！狐狸好感 +1（共 ${S.foxDays.length}）。`
    : stage === 3 ? "晚安。你已經把今天的 B612 照顧得很好。"
    : r.wrong ? "答錯的字別擔心，明天它們會再回來找你。" : "全部答對！你最好每天在同一個時間來。";
  const pend = pendingLanding();
  app.innerHTML = `
  <canvas class="scene" id="scene" width="${W}" height="${H}" role="img" aria-label="${stage === 3 ? "夕陽落下後的星空" : "B612 上的夕陽"}"></canvas>
  <div class="center" style="display:flex;flex-direction:column;gap:6px">
    <p class="prompt">${r.kind === 3 ? "猴麵包樹拔掉了" : names[r.kind] + "清乾淨了"}</p>
    <p class="big-num">${big}</p><p class="note">${esc(note)}</p>
  </div>
  <div class="stats">
    <div class="stat"><b>${r.right}</b>一次就答對</div>
    <div class="stat"><b>${r.best}</b>最高連擊</div>
    <div class="stat"><b>${r.newStars}</b>新點亮星星</div>
  </div>
  <div class="card" style="flex-direction:row;align-items:center;gap:12px">
    <canvas width="24" height="18" style="width:56px;height:42px;flex:none" id="fox"></canvas>
    <p style="font-size:14px">狐狸說：${esc(foxLine)}${r.wrong && stage < 3 ? `（${r.wrong} 個字明天再見）` : ""}</p>
  </div>
  ${pend ? `<p class="note center">小王子的旅程走到了新的星球⋯⋯</p>` : ""}
  <button class="btn gold center" id="home">${pend ? "出發，前往新的星球" : "回到 B612"}</button>`;
  startAnim(document.getElementById("scene"), stage);
  drawIcon(document.getElementById("fox"), SPR.fox, 2);
  document.getElementById("home").onclick = () => { if (pend) { S.landing = pend; save(); go("land") } else go("home") };
}

/* ---------- 星球之旅 ---------- */
function renderPlanets() {
  const seen = seenCount(), done = legsDone();
  app.innerHTML = `
  <div class="qtop" style="grid-template-columns:auto 1fr"><button class="btn small" id="back" aria-label="回到 B612">✕</button><h2 style="font-size:18px">星球之旅 <span class="note">每遇見 ${LEG} 個新字抵達下一站</span></h2></div>
  <p class="note">B612 永遠是你的家，每天回來清火山。旅程是小王子晚上出去拜訪的地方，去過的星球隨時可以再回去看看。</p>
  <div class="list">
    ${STOPS.map((st, i) => {
      const visited = i === 0 || S.visited.includes(st.id), reached = i <= done;
      const state = i === 0 ? "你的家" : visited ? "已拜訪" : reached ? "可以登陸了" : i === done + 1 ? `還差 ${i * LEG - seen} 字` : `第 ${i * LEG} 字抵達`;
      return `<button class="btn vol" data-stop="${i}" ${reached ? "" : "disabled"}>
        <canvas width="16" height="14" style="width:48px;height:42px" data-res="${i}"></canvas>
        <span><span class="t">${esc(st.name)}</span><br><span class="s">${i === 0 ? "火山、玫瑰和你點亮的星星" : visited ? "紀念物：" + esc(st.giftName) : "居民：" + esc(st.who)}</span></span>
        <span class="tag ${visited ? "clean" : reached ? "smoke" : "lock"}">${state}</span></button>`;
    }).join("")}
  </div>`;
  document.getElementById("back").onclick = () => go("home");
  app.querySelectorAll("[data-res]").forEach(c => { const st = STOPS[+c.dataset.res]; drawIcon(c, st.id === "b612" ? SPR.prince : RESIDENT[st.id], 1) });
  app.querySelectorAll("[data-stop]").forEach(b => b.onclick = () => { const st = STOPS[+b.dataset.stop]; if (st.id === "b612") { go("home"); return } S.landing = st.id; save(); go("land") });
}
function renderLand() {
  const st = STOPS.find(x => x.id === S.landing) || STOPS[1];
  const first = !S.visited.includes(st.id);
  let li = 0;
  app.innerHTML = `
  <canvas class="scene" id="visit" width="${W}" height="${H}" role="img" aria-label="${esc(st.name)}，上面住著${esc(st.who)}"></canvas>
  <div class="center" style="display:flex;flex-direction:column;gap:4px">
    <p class="prompt">${first ? "登陸新星球" : "再次拜訪"}</p>
    <p class="big-num" style="font-size:30px">${esc(st.name)}</p>
  </div>
  <button class="card dialog" id="talk" aria-live="polite">
    <span class="lab">${esc(st.who)}</span>
    <span id="dline">${esc(st.lines[0])}</span>
    <span class="note" id="dhint">點這裡繼續 ▸</span>
  </button>
  <div class="card gift" id="gift" hidden>
    <canvas width="12" height="10" style="width:48px;height:40px;flex:none" id="giftIcon"></canvas>
    <span><span class="lab">${first ? "得到紀念物" : "你的紀念物"}</span><br>${esc(st.giftName)}<br><span class="note">${st.gift === "fox" ? "狐狸會搬到 B612 跟你住在一起。" : "它會擺在你的 B612 上，繞著星球走就看得到。"}</span></span>
  </div>
  <button class="btn gold center" id="fly" hidden>${first ? "收下紀念物，飛回 B612" : "飛回 B612"}</button>`;
  const cv = document.getElementById("visit");
  let last = 0; const loop = ts => { if (ts - last > 140) { tick++; last = ts; drawVisit(cv, st, tick) } anim = requestAnimationFrame(loop) };
  drawVisit(cv, st, tick); anim = requestAnimationFrame(loop);
  drawIcon(document.getElementById("giftIcon"), SPR[st.gift] || SPR.fox, st.gift === "fox" ? 1 : 2);
  babble(st.lines[0].length);
  const showEnd = () => { document.getElementById("gift").hidden = false; document.getElementById("fly").hidden = false; document.getElementById("dhint").textContent = "" };
  document.getElementById("talk").onclick = () => {
    if (li >= st.lines.length - 1) { showEnd(); return }
    li++; document.getElementById("dline").textContent = st.lines[li]; babble(st.lines[li].length);
    if (li === st.lines.length - 1) showEnd();
  };
  document.getElementById("fly").onclick = () => {
    if (first) S.visited.push(st.id);
    S.landing = null; save();
    const more = pendingLanding();
    if (more) { S.landing = more; save(); go("land") } else go("home");
  };
}

/* ---------- 星空圖鑑 ---------- */
function renderCards() {
  const filters = [["all", "全部"], ["taming", "馴養中"], ["baobab", "猴麵包樹"], ["stubborn", "頑固"], ["star", "已點亮"], ["new", "還沒遇見"]];
  const list = ALL().filter(w => colFilter === "all" || status(w.id)[0] === colFilter);
  app.innerHTML = `
  <div class="qtop" style="grid-template-columns:auto 1fr"><button class="btn small" id="back" aria-label="回到星球">✕</button><h2 style="font-size:18px">星空圖鑑 <span class="note">${stars()} 顆已點亮 · 共 ${ALL().length} 字</span></h2></div>
  <div class="tabs">${filters.map(([k, n]) => `<button class="btn ${colFilter === k ? "on" : ""}" data-f="${k}">${n}</button>`).join("")}</div>
  <div class="list">
    ${list.length ? list.map(w => {
      const x = ws(w.id), [k, n] = status(w.id); const open = openWord === w.id; return `
      <div class="wrow" role="button" tabindex="0" data-w="${w.id}" aria-expanded="${open}">
        <div class="row"><span class="w" lang="en">${esc(w.w)}</span><span class="st ${k}">${n}</span></div>
        <div class="row"><span style="font-size:14px">${esc(w.zh)}</span><span class="pips" aria-label="馴養程度 ${x.seen ? x.s : 0}/5">${[1, 2, 3, 4, 5].map(i => `<i class="${x.seen && x.s >= i ? "on" : ""}"></i>`).join("")}</span></div>
        ${open ? `<div class="detail">${exHtml(w)}${w.tip ? `<div class="tip"><span class="lab">記憶小技巧</span>${esc(w.tip)}</div>` : ""}${w.hook ? hookHtml(w) : ""}${x.wr ? `<p class="note">答錯過 ${x.wr} 次</p>` : ""}</div>` : ""}
      </div>`}).join("") : `<p class="note">這裡還沒有單字。</p>`}
  </div>`;
  document.getElementById("back").onclick = () => go("home");
  app.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { colFilter = b.dataset.f; renderCards() });
  bindEx(app);
  app.querySelectorAll("[data-w]").forEach(el => { const f = () => { const id = el.dataset.w; openWord = openWord === id ? null : id; speak(byId(id).w); renderCards() }; el.onclick = f; el.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f() } } });
}

/* ---------- 設定 ---------- */
function renderSettings() {
  const st = S.settings;
  app.innerHTML = `
  <div class="qtop" style="grid-template-columns:auto 1fr"><button class="btn small" id="back" aria-label="回到星球">✕</button><h2 style="font-size:18px">設定</h2></div>
  <section class="sect">
    <h3>每日節奏</h3>
    <label for="per">每天新單字數量（明天起生效）
      <select id="per">${[10, 20, 30, 40].map(n => `<option value="${n}" ${st.perDay === n ? "selected" : ""}>${n} 個（兩座活火山各 ${Math.ceil(n / 2)}）</option>`).join("")}</select></label>
    <p class="note">書本每個 Day 有 40 字。設 40 就是一天讀完一個 Day，30 天讀完整本，最後兩週專心複習。</p>
  </section>
  <section class="sect">
    <h3>狐狸時間</h3>
    <label for="foxh">每天固定回來的時間（這個小時內清火山，狐狸會出現並增加好感）
      <select id="foxh">${Array.from({ length: 18 }, (_, i) => i + 6).map(h => `<option value="${h}" ${st.foxHour === h ? "selected" : ""}>${h}:00 – ${h}:59</option>`).join("")}</select></label>
  </section>
  <section class="sect">
    <h3>背景音樂</h3>
    <label style="flex-direction:row;align-items:center;gap:8px" for="mus"><input type="checkbox" id="mus" ${st.music ? "checked" : ""}> 播放背景音樂（清火山時會自動暫停）</label>
    <label for="mvol">音量（iPhone 請用側邊音量鍵調整） <input type="range" id="mvol" min="0.1" max="1" step="0.05" value="${st.musicVol}"></label>
    <label for="msrc">曲目
      <select id="msrc"><option value="chip" ${st.musicSrc !== "custom" ? "selected" : ""}>B612 原創小曲（8-bit 音樂盒）</option>${st.musicName ? `<option value="custom" ${st.musicSrc === "custom" ? "selected" : ""}>我的音樂：${esc(st.musicName)}</option>` : ""}</select></label>
    <div class="row" style="justify-content:flex-start;flex-wrap:wrap"><label class="btn small" for="mfile" style="display:inline-block;cursor:pointer">選擇手機裡的音樂檔</label>
      <input type="file" id="mfile" accept="audio/*" hidden>
      ${st.musicName ? `<button class="btn small" id="mdel">移除我的音樂</button>` : ""}</div>
    <div class="row" style="justify-content:flex-start;gap:10px;flex-wrap:wrap"><button class="btn small" id="mtest">▶ 試播音樂</button><span class="note" id="mstat">${musicStatus()}</span></div>
    <p class="note">音樂檔只存在這支手機的 B612 裡，不會上傳。要用買斷的歌（例如 iTunes 購買）或一般音樂檔；Apple Music、Spotify 的串流歌曲沒辦法選。</p>
  </section>
  <section class="sect">
    <h3>發音</h3>
    <label for="voice">聲音
      <select id="voice"><option value="">自動挑選美式發音</option>${voices.map(v => `<option value="${esc(v.name)}" ${st.voice === v.name ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("")}</select></label>
    ${voices.length ? "" : `<p class="note">還沒讀到手機的英文語音。如果一直是空的，iPhone 可以到「設定 → 輔助使用 → 朗讀內容 → 聲音 → 英文」下載 Samantha。</p>`}
    <label for="rate">語速 <span class="en" id="rateV">${st.rate.toFixed(2)}x</span>
      <input type="range" id="rate" min="0.6" max="1.2" step="0.05" value="${st.rate}"></label>
    <div class="row"><button class="btn small" id="test">試聽 negotiate</button>
      <label style="flex-direction:row;align-items:center;gap:8px" for="sfx"><input type="checkbox" id="sfx" ${st.sfx ? "checked" : ""}> 音效（答題、小王子說話）</label></div>
    <p class="note">聽不到聲音？iPhone 請先關掉側邊的靜音開關。</p>
  </section>
  <section class="sect">
    <h3>加入自己的單字</h3>
    <label for="imp">一行一個：英文 | 詞性 | 中文
      <textarea id="imp" placeholder="itinerary | n. | 行程表&#10;reimburse | v. | 報銷；償還"></textarea></label>
    <button class="btn small" id="doImp">加入單字</button>
    <p class="note" id="impMsg">目前自己加的單字：${(S.custom || []).length} 個</p>
  </section>
  <section class="sect">
    <h3>雲端同步</h3>
    ${!sbConfigured() ? `<p class="note">還沒設定雲端同步（需要先建立 Supabase 專案）。設定好之後，手機、Safari、電腦都會是同一份進度。</p>`
      : SB.user ? `<p>已登入：<span class="en">${esc(SB.user.email || "")}</span></p>
        <p class="note" id="sbStat">${sbStatusText()}</p>
        <p class="note">進度會自動同步。換裝置或用 Safari 時，用同一個 Email 登入就好。</p>
        <div class="row" style="justify-content:flex-start;gap:8px"><button class="btn small" id="sbNow">立即同步</button><button class="btn small" id="sbOut">登出</button></div>`
      : `<p class="note">用 Email 和密碼登入一次，這個裝置的進度就會自動存到雲端。每支手機、Safari、主畫面 App 都各登入一次，用同一組帳號密碼。</p>
        <form id="sbForm" class="list" style="gap:10px">
          <label for="sbEmail">Email<input type="email" id="sbEmail" autocomplete="username" inputmode="email" placeholder="you@example.com" style="font:inherit;color:var(--ink);background:#1a2048;border:3px solid var(--line);padding:8px"></label>
          <label for="sbPass">密碼（至少 6 個字）<input type="password" id="sbPass" autocomplete="current-password" minlength="6" style="font:inherit;color:var(--ink);background:#1a2048;border:3px solid var(--line);padding:8px"></label>
          <div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><button class="btn small" type="submit" id="sbIn">登入</button><button class="btn small" type="button" id="sbUp">第一次使用：建立帳號</button></div>
        </form>`}
  </section>
  <section class="sect">
    <h3>備份進度</h3>
    <p class="note">進度存在這支手機的瀏覽器裡。換手機或怕被清掉時，先複製備份碼存到備忘錄，之後貼回來就能還原。</p>
    <div class="row" style="justify-content:flex-start"><button class="btn small" id="copyCode">複製備份碼</button></div>
    <label for="code">貼上備份碼還原
      <textarea id="code" placeholder="把備份碼貼在這裡"></textarea></label>
    <button class="btn small" id="restore">用備份碼還原</button>
  </section>
  <p class="note center">B612 版本：${APP_VERSION}</p>
  <section class="sect">
    ${confirmReset ? `<p>確定要清除全部進度嗎？星星、玫瑰和夕陽都會歸零，無法復原。</p>
      <div class="row"><button class="btn small" id="resetNo">取消</button><button class="btn small" id="resetYes" style="background:#7a2f3e">清除全部進度</button></div>`
      : `<button class="btn small" id="reset">重新開始</button>`}
  </section>`;
  const $ = id => document.getElementById(id);
  $("back").onclick = () => { confirmReset = false; go("home") };
  $("mtest").onclick = () => {
    st.music = true; save(); audioUnlocked = true; BGM.err = ""; waStop(); musicSync();
    setTimeout(() => { const m = $("mstat"); if (m) m.textContent = musicStatus() }, 800);
  };
  $("mus").onchange = e => { st.music = e.target.checked; save(); unlockAudio(); musicSync() };
  $("mvol").oninput = e => { st.musicVol = +e.target.value; musicSync() };
  $("mvol").onchange = () => save();
  $("msrc").onchange = e => { st.musicSrc = e.target.value; save(); musicSync() };
  $("mfile").onchange = async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (f.size > 30 * 1024 * 1024) { toast("檔案太大了，請選 30MB 以下的音樂檔"); return }
    try {
      await idbDo("readwrite", s2 => s2.put(f, "bgm"));
      BGM.blob = f; if (BGM.customUrl) { URL.revokeObjectURL(BGM.customUrl); BGM.customUrl = null }
      st.musicName = f.name.replace(/\.[^.]+$/, ""); st.musicSrc = "custom"; st.music = true; save();
      toast("已換成你的音樂"); renderSettings(); musicSync();
    } catch (err) { toast("這個檔案沒辦法存進來，換一個音樂檔試試") }
  };
  const md = $("mdel"); if (md) md.onclick = async () => {
    try { await idbDo("readwrite", s2 => s2.delete("bgm")) } catch (err) { }
    BGM.blob = null; if (BGM.customUrl) { URL.revokeObjectURL(BGM.customUrl); BGM.customUrl = null }
    st.musicName = ""; st.musicSrc = "chip"; save(); renderSettings(); musicSync();
  };
  $("foxh").onchange = e => { st.foxHour = +e.target.value; save(); toast(`狐狸會在 ${st.foxHour}:00 等你`) };
  $("per").onchange = e => { st.perDay = +e.target.value; save(); toast("明天開始，每天 " + st.perDay + " 個新字") };
  $("voice").onchange = e => { st.voice = e.target.value; save(); speak("negotiate") };
  $("rate").oninput = e => { st.rate = +e.target.value; $("rateV").textContent = st.rate.toFixed(2) + "x" };
  $("rate").onchange = () => { save(); speak("negotiate") };
  $("test").onclick = () => speak("negotiate");
  $("sfx").onchange = e => { st.sfx = e.target.checked; save() };
  $("doImp").onclick = () => {
    const lines = $("imp").value.split(/\n/).map(l => l.trim()).filter(Boolean); let n = 0;
    S.custom = S.custom || [];
    lines.forEach(l => {
      const p = l.split(/\s*[|｜,，\t]\s*/); if (p.length < 2) return;
      const w = p[0], pos = p.length >= 3 ? p[1] : "", zh = p.length >= 3 ? p.slice(2).join("，") : p[1];
      if (!w || !zh || ALL().some(x => x.w.toLowerCase() === w.toLowerCase())) return;
      S.custom.push({ id: "c" + Date.now().toString(36) + n, deck: "custom", w, pos, zh, ex: "", exZh: "", tip: null, hook: null }); n++;
    });
    save(); byIdCache.clear(); $("imp").value = ""; $("impMsg").textContent = `加入了 ${n} 個新單字，會排進之後的活火山。目前自己加的單字：${S.custom.length} 個`;
  };
  if (sbConfigured()) {
    if (SB.user) {
      $("sbNow").onclick = async () => { SB.state = "syncing"; $("sbStat").textContent = sbStatusText(); await sbPull(); const el = $("sbStat"); if (el) el.textContent = sbStatusText() };
      $("sbOut").onclick = async () => { await SB.client.auth.signOut(); SB.user = null; SB.last = 0; toast("已登出，進度仍保留在這個裝置上"); renderSettings() };
    } else {
      const creds = () => {
        const email = $("sbEmail").value.trim(), password = $("sbPass").value;
        if (!/^\S+@\S+\.\S+$/.test(email)) { toast("請輸入正確的 Email"); return null }
        if (password.length < 6) { toast("密碼至少要 6 個字"); return null }
        return { email, password };
      };
      $("sbForm").onsubmit = async e => {
        e.preventDefault(); const c = creds(); if (!c) return;
        $("sbIn").disabled = true;
        const { error } = await SB.client.auth.signInWithPassword(c);
        $("sbIn").disabled = false;
        if (error) { toast(/invalid/i.test(error.message || "") ? "Email 或密碼不對。第一次使用請按「建立帳號」" : "登入失敗：" + error.message); return }
        toast("登入成功，開始同步");
      };
      $("sbUp").onclick = async () => {
        const c = creds(); if (!c) return;
        $("sbUp").disabled = true;
        const { data, error } = await SB.client.auth.signUp(c);
        $("sbUp").disabled = false;
        if (error) { toast(/registered|exists/i.test(error.message || "") ? "這個 Email 已經有帳號了，直接按「登入」" : "建立失敗：" + error.message); return }
        if (!data.session) { toast("帳號建立了，但 Supabase 還開著「Confirm email」，請先把它關掉再登入"); return }
        toast("帳號建立好了，開始同步");
      };
    }
  }
  $("copyCode").onclick = () => copyBackup(null, $("code"));
  $("restore").onclick = () => { try { importCode($("code").value); byIdCache.clear(); toast("進度已還原"); go("home") } catch (e) { toast("備份碼看起來不完整，請重新複製一次") } };
  if (confirmReset) { $("resetNo").onclick = () => { confirmReset = false; renderSettings() }; $("resetYes").onclick = () => { const keep = S.settings; S = fresh(); S.settings = keep; S.installHidden = true; confirmReset = false; save(); go("home") } }
  else $("reset").onclick = () => { confirmReset = true; renderSettings() };
}

function noteSvg() { return `<svg width="20" height="20" viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true"><g fill="currentColor"><rect x="4" y="1" width="1" height="6"/><rect x="5" y="1" width="3" height="1"/><rect x="7" y="2" width="1" height="4"/><rect x="2" y="6" width="3" height="2"/><rect x="5" y="5" width="3" height="2"/></g><rect class="slash" x="0" y="0" width="1" height="1" fill="none"/></svg>` }
function needBackup() { return !SB.user && seenCount() > 0 && Date.now() - (S.lastBackup || 0) > 3 * 864e5 }
async function copyBackup(after, box) {
  const code = exportCode();
  try { await navigator.clipboard.writeText(code); S.lastBackup = Date.now(); save(); toast("備份碼已複製，貼到備忘錄保存吧"); after && after() }
  catch (e) {
    if (box) { box.value = code; box.select(); toast("請手動複製下面框框裡的備份碼") }
    else { S.lastBackup = Date.now(); save(); go("settings"); setTimeout(() => { const b = document.getElementById("code"); if (b) { b.value = code; b.select() } toast("請手動複製框框裡的備份碼") }, 50) }
  }
}
function speakerSvg(s = 1) { return `<svg width="${20 * s}" height="${18 * s}" viewBox="0 0 10 9" shape-rendering="crispEdges" aria-hidden="true"><g fill="currentColor"><rect x="0" y="3" width="2" height="3"/><rect x="2" y="2" width="1" height="5"/><rect x="3" y="1" width="1" height="7"/><rect x="4" y="0" width="1" height="9"/><rect x="6" y="3" width="1" height="3"/><rect x="7" y="2" width="1" height="1"/><rect x="7" y="6" width="1" height="1"/><rect x="8" y="1" width="1" height="1"/><rect x="8" y="7" width="1" height="1"/><rect x="9" y="2" width="1" height="5"/></g></svg>` }

document.addEventListener("visibilitychange", () => { if (!document.hidden && S.today && S.today.day !== today() && (view === "home" || view === "result")) go("home") });
sbInit();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => { });
render();
