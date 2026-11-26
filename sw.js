// Offline-Unterstützung und Auslieferung der Kontaktdatei.
// kontakt.vcf wird von der Seite in den Cache gelegt und hier mit dem richtigen Dateityp ausgeliefert,
// damit Safari die Kontaktvorschau zeigt statt die Datei herunterzuladen.
const CACHE = 'visit-v3';
const VCARD = 'visit-vcard';
const SHELL = ['./', 'index.html', 'parser.js', 'online.js', 'data/namen.json', 'data/plz.json',
  'vendor/libphonenumber-max.js', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== VCARD).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.endsWith('/kontakt.vcf')) {
    e.respondWith(caches.open(VCARD)
      .then(c => c.match(url.origin + url.pathname))
      .then(r => r || new Response('Kein Kontakt vorhanden.', { status: 404 })));
    return;
  }

  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then(m => m || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
