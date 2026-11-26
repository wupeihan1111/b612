/* Offline support. Network first so a new deploy shows up right away; falls back to the cached copy when offline. */
const CACHE = "b612-v17";
const SHELL = ["./", "./index.html", "./css/style.css", "./js/app.js", "./data/words.js", "./data/days03-10.js", "./config.js", "./audio/b612-waltz.m4a", "./audio/b612-waltz-night.m4a", "./manifest.webmanifest", "./icons/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())) });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())) });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isFont = url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com" || url.host === "cdn.jsdelivr.net";   // fonts and the sync library: cache once, reuse offline
  if (url.origin !== location.origin && !isFont) return;
  if (req.destination === "audio") return;   // let the <audio> element stream music itself (range requests); fetch() of the file is cached normally
  if (isFont) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res })));
    return;
  }
  e.respondWith(fetch(req, { cache: "no-cache" }).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res }).catch(() => caches.match(req).then(hit => hit || caches.match("./index.html"))));
});
