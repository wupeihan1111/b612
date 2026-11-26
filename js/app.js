/* B612 單字星球 — game logic. Progress lives in this browser's localStorage, with a backup code in Settings. */
"use strict";

/* ---------- 題庫 ---------- */
const DECKS = window.B612_DECKS || [];
const BOOK_WORDS = DECKS.flatMap(d => d.words.map((a, i) => ({
  id: d.id + "-" + (i + 1), deck: d.id, w: a[0], pos: a[1], zh: a[2], ex: a[3], exZh: a[4], tip: a[5], hook: a[6]
})));

const EXAM = dayNum(new Date(2027, 0, 9));
const INTERVALS = [1, 1, 3, 7, 14, 30];
const STAR_STAGE = 4;
const PLANETS = ["B612", "國王", "虛榮的人", "酒鬼", "商人", "點燈人", "地理學家", "地球"];
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
function fresh() { return { v: 2, words: {}, today: null, sunsets: [], settings: { perDay: 40, rate: 0.9, voice: "", sfx: true }, custom: [], installHidden: false, updatedAt: 0 } }
function load() { try { const r = localStorage.getItem(LS); if (r) { const o = JSON.parse(r); return Object.assign(fresh(), o, { settings: Object.assign(fresh().settings, o.settings) }) } } catch (e) { } return fresh() }
let S = load();
function save() { S.updatedAt = Date.now(); try { localStorage.setItem(LS, JSON.stringify(S)) } catch (e) { toast("存檔失敗：瀏覽器不允許儲存資料，請關閉無痕模式。") } }
function exportCode() { return btoa(unescape(encodeURIComponent(JSON.stringify(S)))) }
function importCode(code) {
  const o = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  if (!o || typeof o !== "object" || !o.words) throw new Error("bad");
  S = Object.assign(fresh(), o, { settings: Object.assign(fresh().settings, o.settings) }); save();
}

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
function ensureToday() {
  const t = today();
  if (S.today && S.today.day === t) return;
  const per = S.settings.perDay, half = Math.ceil(per / 2);
  const unseen = ALL().filter(w => !ws(w.id).seen).map(w => w.id);
  S.today = { day: t, v1: unseen.slice(0, half), v2: unseen.slice(half, per), done: [false, false, false] };
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
function markSpeaking(on) { document.querySelectorAll(".speak").forEach(b => b.classList.toggle("on", on)) }
function speak(text) {
  const synth = window.speechSynthesis;
  if (!synth) { if (!warnedNoVoice) { warnedNoVoice = true; toast("這個瀏覽器不支援發音，建議用 Safari 或 Chrome 打開。") } return }
  try {
    if (!voices.length) loadVoices();
    const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; const v = pickVoice(); if (v) u.voice = v; u.rate = S.settings.rate; u.volume = 1;
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

let AC = null;
function blip(ok) {
  if (!S.settings.sfx) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume();
    const o = AC.createOscillator(), g = AC.createGain(); o.type = "square";
    const t = AC.currentTime; const n = ok ? [660, 880] : [220, 165];
    o.frequency.setValueAtTime(n[0], t); o.frequency.setValueAtTime(n[1], t + .08);
    g.gain.setValueAtTime(.05, t); g.gain.exponentialRampToValueAtTime(.001, t + .22); o.connect(g).connect(AC.destination); o.start(t); o.stop(t + .23)
  } catch (e) { }
  if (!ok && navigator.vibrate) navigator.vibrate(60);
}

/* ---------- 像素圖 ---------- */
const PAL = { h: "#f2c14e", H: "#c9962e", s: "#f6d2b0", e: "#2a2440", g: "#4f9a62", G: "#3a7a4c", y: "#f7dd5a", b: "#3b2f4a", r: "#e0556e", R: "#a83a52", l: "#6cbf7a", L: "#3f8a50", t: "#7a5236", v: "#7a5568", V: "#553a4c", x: "#6d6a7c", X: "#4d4a5c", d: "#2c2236", o: "#ff8a3d", f: "#e8833a", F: "#fff1dc", k: "#2a2440", w: "#ffffff", c: "#c9e6ff" };
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
  const sunset = opt.sunset, phi = walker.phi;
  const bands = sunset ? ["#2b2f6b", "#4c3a78", "#8a4c7c", "#c8636d", "#ee8f5c", "#f6b766"] : ["#0d1129", "#11163a", "#151b45", "#1a2150", "#20285c", "#262f68"];
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
  if (sunset) { ctx.fillStyle = "#ffd27a"; for (let y = -9; y <= 9; y++) { const hw = Math.floor(Math.sqrt(81 - y * y)); ctx.fillRect(98 - hw, 70 + y, hw * 2, 1) } }
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
  const st = opt.streak;
  onPlanet(ctx, st >= 7 ? SPR.roseDome : st === 0 ? SPR.wilt : st < 3 ? SPR.bud : SPR.rose, PLACES.rose + phi);
  // the prince always stands on top; side view while walking
  const moving = walker.dragging || Math.abs(walker.vel) > 0.002;
  let rows;
  if (moving) rows = Math.floor(walker.dist / 0.09) % 2 ? SPR.walk2 : SPR.walk1;
  else rows = opt.done.every(Boolean) ? SPR.princeHappy : (tick % 6 < 3 ? SPR.prince : SPR.prince2);
  const c = sprCanvas(rows, moving && walker.face < 0);
  const hop = opt.jump > 0 ? Math.round(Math.sin(opt.jump / 6 * Math.PI) * 4) : 0;
  ctx.drawImage(c, PX - Math.floor(c.width / 2), PY - PR - c.height + 1 - hop);
}
function drawIcon(cv, rows, scale) { const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cv.width, cv.height); spr(ctx, rows, Math.floor((cv.width - rows[0].length * scale) / 2), Math.floor((cv.height - rows.length * scale) / 2), scale) }
function drawJourney(cv, frac, tick) {
  const ctx = cv.getContext("2d"), w = 128, h = 24; ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0f1430"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#3a4277"; for (let x = 8; x < 120; x += 3) ctx.fillRect(x, 19, 1, 1);
  const cols = ["#c49a68", "#b37acb", "#e0556e", "#6d8bd6", "#e8c35a", "#ff8a3d", "#6cbf7a", "#4aa3df"];
  PLANETS.forEach((p, i) => {
    const x = 8 + Math.round(i * 112 / (PLANETS.length - 1)), r = i === 7 ? 3 : 2;
    ctx.fillStyle = frac >= i / (PLANETS.length - 1) - 1e-9 ? cols[i] : "#3a4277";
    for (let y = -r; y <= r; y++) { const hw = Math.floor(Math.sqrt(r * r - y * y + .5)); ctx.fillRect(x - hw, 19 + y, hw * 2 + 1, 1) }
  });
  const mx = 8 + Math.round(Math.min(1, frac) * 112);
  spr(ctx, Math.floor(tick / 2) % 2 ? SPR.walk2 : SPR.walk1, Math.max(0, Math.min(w - 10, mx - 5)), 3);
}

/* The prince talks in chiptune babble, not the word-reading voice. */
const PRINCE_LINES = ["你好呀！", "今天也要清火山喔", "我的玫瑰在等我", "Bonjour!", "你看，星星又多一顆了", "往右邊走走看？", "猴麵包樹要趁小拔掉", "我們一起去地球吧", "嘿嘿", "今天想看夕陽"];
function babble(n) {
  if (!S.settings.sfx) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume();
    const t0 = AC.currentTime, base = 900 + Math.random() * 200;
    for (let i = 0; i < Math.min(n, 9); i++) {
      const o = AC.createOscillator(), g = AC.createGain(), t = t0 + i * 0.075;
      o.type = "triangle"; o.frequency.setValueAtTime(base * (0.85 + Math.random() * 0.45), t);
      o.frequency.exponentialRampToValueAtTime(base * 1.3, t + 0.05);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g).connect(AC.destination); o.start(t); o.stop(t + 0.07);
    }
  } catch (e) { }
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
  ({ home: renderHome, learn: renderLearn, quiz: renderQuiz, result: renderResult, cards: renderCards, settings: renderSettings })[view]();
}
function sceneOpts(sunset) {
  const t = today();
  return { sunset, jump, stars: stars(), done: S.today.done, streak: streak(), baobabs: dueWords().map(w => t - ws(w.id).due).sort((a, b) => b - a) };
}
function startAnim(cv, sunset, journey) {
  let last = 0; const total = ALL().length || 1;
  const frame = () => { drawScene(cv, tick, sceneOpts(sunset)); if (journey) drawJourney(journey, seenCount() / total, tick) };
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
  const line = allDone ? "三座火山都清好了，B612 現在是夕陽時間。明天見！" : LINES[today() % LINES.length];
  const showInstall = !isStandalone() && !S.installHidden;
  app.innerHTML = `
  <header class="top">
    <div class="logo">B612<small>單字星球 · ${esc(currentDeck())}</small></div>
    <div class="count">距離多益 1/9<b>${daysLeft()} 天</b></div>
  </header>
  <div class="stage">
    <canvas class="scene" id="scene" width="${W}" height="${H}" tabindex="0" role="img" aria-label="B612 星球：小王子、玫瑰、三座火山${due ? `和 ${due} 棵猴麵包樹` : ""}，天上有 ${nStars} 顆點亮的星星。左右滑動可以繞著星球走，點一下小王子會說話"></canvas>
    <p class="bubble" id="bubble" hidden></p>
    <span class="hint">← 左右滑動繞星球 →</span>
  </div>
  <p class="line">${esc(line)}</p>
  <div class="journey">
    <canvas id="journey" width="128" height="24" aria-hidden="true"></canvas>
    <div class="lbl"><span>B612</span><span>已遇見 ${seenCount()} / ${total} 字</span><span>地球（考場）</span></div>
  </div>
  <div class="chips">
    <span class="chip"><i style="background:var(--rose)"></i>玫瑰連續<b>${st} 天</b></span>
    <span class="chip"><i style="background:var(--gold)"></i>點亮星星<b>${nStars}</b></span>
    <span class="chip"><i style="background:var(--leaf)"></i>猴麵包樹<b>${due}</b></span>
    <span class="chip"><i style="background:var(--ember)"></i>看過夕陽<b>${S.sunsets.length} 次</b></span>
  </div>
  <div class="list">
    ${vols.map((v, i) => `<button class="btn vol" data-vol="${i}" ${v.lock || T.done[i] ? "disabled" : ""}>
      <canvas width="24" height="14" style="width:48px;height:28px" data-icon="${i}"></canvas>
      <span><span class="t">${v.t}</span><br><span class="s">${esc(v.s)}</span></span>
      <span class="tag ${T.done[i] ? "clean" : v.lock ? "lock" : "smoke"}">${T.done[i] ? "已清理" : v.lock ? (i === 1 ? "先清第一座" : "先學新字") : "冒煙中"}</span>
    </button>`).join("")}
    ${T.done[2] && due ? `<button class="btn vol" data-vol="3">
      <canvas width="24" height="14" style="width:48px;height:28px" data-icon="3"></canvas>
      <span><span class="t">拔猴麵包樹</span><br><span class="s">還有 ${due} 棵，每次拔 15 棵</span></span>
      <span class="tag clean">加碼</span></button>` : ""}
  </div>
  <p class="note">每座火山每天只能清一次，午夜會重新冒煙；沒清的機會不會留到明天。</p>
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
  startAnim(cv, allDone, document.getElementById("journey"));
  bindWalk(cv, document.getElementById("bubble"));
  app.querySelectorAll("[data-icon]").forEach(c => { const i = +c.dataset.icon; drawIcon(c, i === 3 ? SPR.tree : i === 2 ? SPR.dead : SPR.volHot, 2) });
  app.querySelectorAll("[data-vol]").forEach(b => b.onclick = () => startSession(+b.dataset.vol));
  app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  const hi = document.getElementById("hideInstall"); if (hi) hi.onclick = () => { S.installHidden = true; save(); renderHome() };
}

/* ---------- 清火山（一回合） ---------- */
function startSession(kind) {
  const T = S.today;
  SES = { kind, first: {}, retries: {}, right: 0, wrong: 0, newStars: 0, combo: 0, best: 0, mode: {}, q: [], cur: null, answered: false };
  if (kind < 2) {
    const ids = kind === 0 ? T.v1 : T.v2;
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
    ${w.ex ? `<p class="ex" lang="en">${esc(w.ex)}</p><p class="exzh">${esc(w.exZh)}</p>` : ""}
    ${w.tip ? `<div class="tip"><span class="lab">記憶小技巧</span>${esc(w.tip)}</div>` : ""}
  </article>
  <button class="btn gold center" id="next">${SES.li < chunk.length - 1 ? "認識了，下一個" : "認識了，開始清火山"}</button>`;
  document.getElementById("say").onclick = () => speak(w.w);
  document.getElementById("w").onclick = () => speak(w.w);
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
  if (mode === "new") { setWs(id, { seen: true, s: ok ? 1 : 0, due: clampDue(t + 1), wr: x.wr + (ok ? 0 : 1) }); return }
  if (mode === "practice") { if (!ok) setWs(id, { wr: x.wr + 1, due: Math.min(x.due, clampDue(t + 1)) }); return }
  if (ok) { const ns = Math.min(x.s + 1, 5); if (ns >= STAR_STAGE && x.s < STAR_STAGE) SES.newStars++; setWs(id, { s: ns, due: clampDue(t + INTERVALS[ns]) }) }
  else setWs(id, { s: 0, due: clampDue(t + 1), wr: x.wr + 1 });
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
     ${w.ex ? `<p class="ex" lang="en">${esc(w.ex)}</p><p class="exzh">${esc(w.exZh)}</p>` : ""}
     ${showHook ? hookHtml(w) : ""}
     ${w.tip ? `<div class="tip"><span class="lab">記憶小技巧</span>${esc(w.tip)}</div>` : ""}
     ${w.hook && !showHook ? `<p class="note">再錯一次，就會解鎖這個字的電影記憶句。</p>` : ""}
   </article>
   <button class="btn gold center" id="cont" style="margin-top:12px">知道了，繼續</button>`;
  document.getElementById("say2").onclick = () => speak(w.w);
  document.getElementById("w2").onclick = () => speak(w.w);
  document.getElementById("cont").onclick = nextQ;
  document.getElementById("reveal").scrollIntoView({ behavior: "smooth", block: "start" });
}
function hookHtml(w) { const h = w.hook; return `<div class="hook"><span class="lab">記憶句 · 頑固單字解鎖</span><span class="src" lang="en">${esc(h.src)}</span>${h.zh ? `<span class="note">${esc(h.zh)}</span>` : ""}<span>${esc(h.note)}</span></div>` }
function finishSession() {
  const T = S.today, t = today();
  if (SES.kind < 3) T.done[SES.kind] = true;
  const firstSunset = !S.sunsets.includes(t);
  if (firstSunset) S.sunsets.push(t);
  save();
  lastResult = { kind: SES.kind, right: SES.right, wrong: SES.wrong, newStars: SES.newStars, best: SES.best, firstSunset, n: S.sunsets.length, allDone: T.done.every(Boolean) };
  SES = null; go("result");
}
function renderResult() {
  const r = lastResult; const names = ["第一座活火山", "第二座活火山", "死火山", "猴麵包樹"];
  const foxLine = r.allDone ? "三座火山都清好了。你已經把今天的 B612 照顧得很好。" : r.wrong ? "答錯的字別擔心，明天它們會再回來找你。" : "全部答對！你最好每天在同一個時間來。";
  app.innerHTML = `
  <canvas class="scene" id="scene" width="${W}" height="${H}" role="img" aria-label="B612 上的夕陽"></canvas>
  <div class="center" style="display:flex;flex-direction:column;gap:6px">
    <p class="prompt">${r.kind === 3 ? "猴麵包樹拔掉了" : names[r.kind] + "清乾淨了"}</p>
    ${r.firstSunset ? `<p class="big-num">第 ${r.n} 次夕陽</p><p class="note">小王子曾經在一天裡看了 44 次夕陽。離考試還有 ${daysLeft()} 天。</p>` : `<p class="big-num">做得好</p>`}
  </div>
  <div class="stats">
    <div class="stat"><b>${r.right}</b>一次就答對</div>
    <div class="stat"><b>${r.best}</b>最高連擊</div>
    <div class="stat"><b>${r.newStars}</b>新點亮星星</div>
  </div>
  <div class="card" style="flex-direction:row;align-items:center;gap:12px">
    <canvas width="24" height="18" style="width:56px;height:42px;flex:none" id="fox"></canvas>
    <p style="font-size:14px">狐狸說：${esc(foxLine)}${r.wrong ? `（${r.wrong} 個字明天再見）` : ""}</p>
  </div>
  <button class="btn gold center" id="home">回到 B612</button>`;
  startAnim(document.getElementById("scene"), true);
  drawIcon(document.getElementById("fox"), SPR.fox, 2);
  document.getElementById("home").onclick = () => go("home");
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
        ${open ? `<div class="detail">${w.ex ? `<p class="ex" lang="en">${esc(w.ex)}</p><p class="exzh">${esc(w.exZh)}</p>` : ""}${w.tip ? `<div class="tip"><span class="lab">記憶小技巧</span>${esc(w.tip)}</div>` : ""}${w.hook ? hookHtml(w) : ""}${x.wr ? `<p class="note">答錯過 ${x.wr} 次</p>` : ""}</div>` : ""}
      </div>`}).join("") : `<p class="note">這裡還沒有單字。</p>`}
  </div>`;
  document.getElementById("back").onclick = () => go("home");
  app.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { colFilter = b.dataset.f; renderCards() });
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
    <h3>發音</h3>
    <label for="voice">聲音
      <select id="voice"><option value="">自動挑選美式發音</option>${voices.map(v => `<option value="${esc(v.name)}" ${st.voice === v.name ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("")}</select></label>
    ${voices.length ? "" : `<p class="note">還沒讀到手機的英文語音。如果一直是空的，iPhone 可以到「設定 → 輔助使用 → 朗讀內容 → 聲音 → 英文」下載 Samantha。</p>`}
    <label for="rate">語速 <span class="en" id="rateV">${st.rate.toFixed(2)}x</span>
      <input type="range" id="rate" min="0.6" max="1.2" step="0.05" value="${st.rate}"></label>
    <div class="row"><button class="btn small" id="test">試聽 negotiate</button>
      <label style="flex-direction:row;align-items:center;gap:8px" for="sfx"><input type="checkbox" id="sfx" ${st.sfx ? "checked" : ""}> 答題音效</label></div>
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
    <h3>備份進度</h3>
    <p class="note">進度存在這支手機的瀏覽器裡。換手機或怕被清掉時，先複製備份碼存到備忘錄，之後貼回來就能還原。</p>
    <div class="row" style="justify-content:flex-start"><button class="btn small" id="copyCode">複製備份碼</button></div>
    <label for="code">貼上備份碼還原
      <textarea id="code" placeholder="把備份碼貼在這裡"></textarea></label>
    <button class="btn small" id="restore">用備份碼還原</button>
  </section>
  <section class="sect">
    ${confirmReset ? `<p>確定要清除全部進度嗎？星星、玫瑰和夕陽都會歸零，無法復原。</p>
      <div class="row"><button class="btn small" id="resetNo">取消</button><button class="btn small" id="resetYes" style="background:#7a2f3e">清除全部進度</button></div>`
      : `<button class="btn small" id="reset">重新開始</button>`}
  </section>`;
  const $ = id => document.getElementById(id);
  $("back").onclick = () => { confirmReset = false; go("home") };
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
  $("copyCode").onclick = async () => {
    const code = exportCode();
    try { await navigator.clipboard.writeText(code); toast("備份碼已複製，貼到備忘錄保存吧") }
    catch (e) { $("code").value = code; $("code").select(); toast("請手動複製下面框框裡的備份碼") }
  };
  $("restore").onclick = () => { try { importCode($("code").value); byIdCache.clear(); toast("進度已還原"); go("home") } catch (e) { toast("備份碼看起來不完整，請重新複製一次") } };
  if (confirmReset) { $("resetNo").onclick = () => { confirmReset = false; renderSettings() }; $("resetYes").onclick = () => { const keep = S.settings; S = fresh(); S.settings = keep; S.installHidden = true; confirmReset = false; save(); go("home") } }
  else $("reset").onclick = () => { confirmReset = true; renderSettings() };
}

function speakerSvg(s = 1) { return `<svg width="${20 * s}" height="${18 * s}" viewBox="0 0 10 9" shape-rendering="crispEdges" aria-hidden="true"><g fill="currentColor"><rect x="0" y="3" width="2" height="3"/><rect x="2" y="2" width="1" height="5"/><rect x="3" y="1" width="1" height="7"/><rect x="4" y="0" width="1" height="9"/><rect x="6" y="3" width="1" height="3"/><rect x="7" y="2" width="1" height="1"/><rect x="7" y="6" width="1" height="1"/><rect x="8" y="1" width="1" height="1"/><rect x="8" y="7" width="1" height="1"/><rect x="9" y="2" width="1" height="5"/></g></svg>` }

document.addEventListener("visibilitychange", () => { if (!document.hidden && S.today && S.today.day !== today() && (view === "home" || view === "result")) go("home") });
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => { });
render();
