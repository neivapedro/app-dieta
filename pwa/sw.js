// Service worker: deixa o app abrir offline e recebe os lembretes (push).
// __VERSAO__ é trocado a cada publicação (vite.config.ts): o iPhone percebe a versão nova
const VERSAO = '__VERSAO__';
const CACHE = 'app-dieta-' + VERSAO;
// Caminhos relativos ao escopo (ex.: /app-dieta/ no GitHub Pages)
const BASE = new URL(self.registration.scope).pathname;

// Arquivos da versão (vite.config.ts injeta a lista na publicação)
const ARQUIVOS = ['__ARQUIVOS__'];
const FIXOS = ['manifest.webmanifest', 'icone-192.png', 'braco.webp'];

self.addEventListener('install', (e) => {
  // Guarda a versão inteira antes de assumir: se algo falhar, a versão anterior continua valendo
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      const pagina = await fetch(BASE, { cache: 'no-store' });
      if (!pagina.ok) throw new Error('página indisponível');
      const html = await pagina.clone().text();
      await c.put(BASE, pagina);
      const doHtml = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map((m) => new URL(m[1], self.registration.scope).pathname);
      const lista = [...FIXOS.map((f) => BASE + f), ...ARQUIVOS.filter((f) => f !== '__ARQUIVOS__').map((f) => BASE + f), ...doHtml];
      await c.addAll([...new Set(lista)]);
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

function guardar(req, r) {
  // Só guarda resposta boa (uma página de erro 503 não pode virar a cópia offline)
  if (r.ok && r.type === 'basic') {
    const copia = r.clone();
    caches.open(CACHE).then((c) => c.put(req, copia));
  }
  return r;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Páginas: rede primeiro, sem cópia do navegador (senão o app reabre na versão antiga); cache se estiver offline
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((r) => guardar(BASE, r))
        .catch(() => caches.match(BASE)),
    );
    return;
  }
  if (url.pathname.startsWith(BASE + 'assets/') || FIXOS.some((f) => url.pathname === BASE + f)) {
    // Arquivos com hash no nome e fixos: cache primeiro
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => guardar(req, r))));
    return;
  }
  // Demais arquivos: rede, e a cópia guardada se estiver sem internet
  if (!url.pathname.endsWith('versao.json')) e.respondWith(fetch(req).catch(() => caches.match(req).then((hit) => hit || Response.error())));
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
