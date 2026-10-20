/*
 * rt100k Service Worker – bewusst minimal (docs/SECURITY.md → PWA):
 * - cacht nur die Offline-Seite (Skript, Stil, Icon), nie App-Seiten oder API-Antworten
 * - Seitenaufrufe gehen immer ins Netz; nur wenn es fehlt, kommt die Offline-Seite
 * - den „letzten Stand“ schreibt die App in einen eigenen Cache und löscht ihn beim Abmelden
 * Namen passend zu src/lib/offline.ts.
 */
const STATIC_CACHE = 'rt100k-static-v1'
const SNAPSHOT_CACHE = 'rt100k-letzter-stand'
const ASSETS = ['/offline.js', '/offline.css', '/icons/icon-192.png']

// Eigene, strenge CSP für die Offline-Seite (ohne Inline-Skripte)
const OFFLINE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

const OFFLINE_HTML = `<!doctype html>
<html lang="de-AT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Offline · rt100k</title>
<link rel="stylesheet" href="/offline.css">
</head>
<body>
<main id="inhalt">
  <p class="brand"><img src="/icons/icon-192.png" alt="" width="28" height="28"> rt100k</p>
  <h1>Offline</h1>
  <p class="lead">Keine Verbindung. Sobald das Netz zurück ist, geht es hier weiter.</p>
  <section id="stand" hidden aria-labelledby="stand-titel">
    <h2 id="stand-titel">Letzter Stand</h2>
    <p id="stand-zeit" class="meta"></p>
    <dl class="stats">
      <div><dt>Gesamtvermögen</dt><dd id="gesamt"></dd></div>
      <div><dt>Eingesetzt</dt><dd id="eingesetzt"></dd></div>
      <div><dt>Kursgewinn</dt><dd id="gewinn"></dd></div>
      <div><dt>Erträge</dt><dd id="ertraege"></dd></div>
    </dl>
    <h3>Aufteilung</h3>
    <ul id="aufteilung" class="slices"></ul>
    <p class="meta">Nur auf diesem Gerät gespeichert, wird beim Abmelden gelöscht.</p>
  </section>
  <p id="kein-stand" class="meta">Auf diesem Gerät ist noch kein Stand gespeichert.</p>
  <button id="neu" type="button">Erneut versuchen</button>
</main>
<script src="/offline.js"></script>
</body>
</html>`

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': OFFLINE_CSP, 'Cache-Control': 'no-store' },
  })
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rt100k-') && k !== STATIC_CACHE && k !== SNAPSHOT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => offlineResponse()))
    return
  }
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)))
  }
})
