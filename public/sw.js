// Service worker sederhana: aset build (nama ber-hash) disimpan di cache, halaman selalu dari jaringan
// (data keuangan harus terbaru). Saat offline, halaman diganti pesan singkat.
const CACHE = 'keuangan-v1';
const OFFLINE_HTML =
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Offline</title><body style="font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0;text-align:center">' +
    '<div><h2>Sedang offline</h2><p>Sambungkan internet lalu muat ulang.</p><button onclick="location.reload()">Muat ulang</button></div>';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    if (url.origin === location.origin && url.pathname.startsWith('/build/assets/')) {
        event.respondWith(
            caches.match(req).then(
                (hit) =>
                    hit ||
                    fetch(req).then((res) => {
                        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
                        return res.clone();
                    }),
            ),
        );
        return;
    }

    if (req.mode === 'navigate') {
        event.respondWith(fetch(req).catch(() => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
    }
});
