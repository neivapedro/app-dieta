// Service worker: deixa o app abrir offline e recebe os lembretes (push).
const CACHE = 'app-dieta-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icone-192.png', '/braco.webp'])));
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
          caches.open(CACHE).then((c) => c.put('/', copia));
          return r;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
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
      icon: '/icone-192.png',
      badge: '/icone-192.png',
      tag: d.tag || 'dose',
      renotify: true,
      data: { url: d.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || '/';
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
