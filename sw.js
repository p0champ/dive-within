// Dive Within: works offline once opened. Bump VERSION on every release.
const VERSION = "dive-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png", "./music/peaceful-desolation.mp3"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Safari asks for audio in byte ranges; answer them from the cached file.
async function ranged(req, res) {
  const range = req.headers.get("range");
  if (!range) return res;
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : buf.byteLength - 1;
  if (!m[1] && m[2]) { start = buf.byteLength - +m[2]; end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { "Content-Type": res.headers.get("Content-Type") || "audio/mpeg", "Content-Range": `bytes ${start}-${end}/${buf.byteLength}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" },
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== location.origin && !fonts) return;

  // pages: newest from the network, cached copy when offline
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => { const cp = res.clone(); caches.open(VERSION).then((c) => c.put("./index.html", cp)); return res; })
      .catch(() => caches.match("./index.html")));
    return;
  }
  // music: cached copy, sliced to the range Safari asks for
  if (url.pathname.endsWith(".mp3")) {
    e.respondWith(caches.match(url.href, { ignoreSearch: true }).then((hit) => {
      if (hit) return ranged(req, hit);
      return fetch(url.href).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(VERSION).then((c) => c.put(url.href, cp)); return ranged(req, res); } return res; });
    }));
    return;
  }
  // everything else, fonts included: cache first
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok || res.type === "opaque") { const cp = res.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); }
    return res;
  })));
});
