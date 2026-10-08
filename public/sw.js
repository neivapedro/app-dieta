// Service worker: deixa o app abrir offline e recebe os lembretes (push).
const CACHE = 'app-dieta-v3';
// Caminhos relativos ao escopo (ex.: /app-dieta/ no GitHub Pages)
const BASE = new URL(self.registration.scope).pathname;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([BASE, BASE + 'manifest.webmanifest', BASE + 'icone-192.png', BASE + 'braco.webp'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Páginas: rede primeiro, cache se estiver offline
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(BASE, copia));
          return r;
        })
        .catch(() => caches.match(BASE)),
    );
    return;
  }
  if (url.pathname.startsWith(BASE + 'assets/')) {
    // Arquivos com hash no nome: cache primeiro
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((r) => {
            const copia = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
            return r;
          }),
      ),
    );
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { corpo: e.data && e.data.text() };
  }
  e.waitUntil(
    self.registration.showNotification(d.titulo || 'Lembrete de aplicação', {
      body: d.corpo || 'Hora da sua aplicação.',
      icon: BASE + 'icone-192.png',
      badge: BASE + 'icone-192.png',
      tag: d.tag || 'dose',
      renotify: true,
      data: { url: new URL(d.url || './', self.registration.scope).href },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if ('focus' in c) {
          c.navigate(destino);
          return c.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
