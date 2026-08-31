/* =============================================================
   ÉTAPE 16 (V3) — Service Worker "App Invitée" Conciergerie Hub
   =============================================================
   Objectif : le Guidebook, les règles de la maison et le Wi-Fi
   restent disponibles SANS RÉSEAU dans le logement.

   Périmètre STRICTEMENT limité à l'expérience invitée :
     • navigations  /app/hub/**          (l'app guest PWA)
     • GET          /api/public/**       (payloads hub + guidebook)
     • GET          /_next/static/**     (chunks de l'app)
     • icônes PWA   /api/public/app-icon, /icon-*, favicon
   Tout le reste (Espace Hôte, dashboard, landing, POST…) n'est
   JAMAIS intercepté → zéro régression possible ailleurs.
   Stratégie : network-first (toujours frais en ligne) avec
   repli cache hors-ligne → pas de contenu périmé.
   ============================================================= */

const VERSION = 'v3-guest-1';
const RUNTIME_CACHE = `ch-guest-runtime-${VERSION}`;
const ASSET_CACHE = `ch-guest-assets-${VERSION}`;
const OFFLINE_URL = '/offline.html';

const APP_PREFIXES = ['/app/hub/', '/api/public/', '/_next/static/', '/icon-', '/favicon'];
const ICON_PATHS = ['/api/public/app-icon', '/icon-', '/favicon'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.add(new Request(OFFLINE_URL, { cache: 'reload' })).catch(() => {});
      } catch (_) {
        /* offline.html optionnel */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('ch-guest-') && !k.endsWith(VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isRelevant(url) {
  return APP_PREFIXES.some((p) => url.pathname.startsWith(p));
}

function isIcon(url) {
  return ICON_PATHS.some((p) => url.pathname.startsWith(p));
}

/** Network-first avec repli cache. Assets (icônes, favicon) :
    cache-first car immuables par nature (URL signée par slug+size). */
async function handle(request, url) {
  const cacheable = url.pathname.startsWith('/api/public/guest-app') ||
    url.pathname.startsWith('/app/hub/') ||
    url.pathname.startsWith('/api/public/app-manifest');

  // Icônes PWA : cache-first (déterministes)
  if (isIcon(url)) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const res = await fetch(request);
      if (res.ok) {
        const cache = await caches.open(ASSET_CACHE);
        cache.put(request, res.clone());
      }
      return res;
    } catch (_) {
      return new Response('', { status: 504 });
    }
  }

  // Chunks Next : network-first → cache (offline)
  if (url.pathname.startsWith('/_next/static/')) {
    try {
      const res = await fetch(request);
      if (res.ok) {
        const cache = await caches.open(ASSET_CACHE);
        cache.put(request, res.clone());
      }
      return res;
    } catch (_) {
      const cached = await caches.match(request);
      if (cached) return cached;
      return new Response('', { status: 504 });
    }
  }

  // Navigations + API publiques : network-first → cache → offline
  try {
    const res = await fetch(request);
    if (res.ok && cacheable) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    return new Response(JSON.stringify({ error: 'offline', message: 'Hors-ligne — rouvrez l’app avec du réseau.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Seules les requêtes GET de l'expérience invitée sont interceptées.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!isRelevant(url)) return;

  // Nouvelle application Shell → laisser le navigateur gérer.
  if (url.pathname.startsWith('/app/hub/sw.js')) return;

  event.respondWith(handle(request, url));
});

/* ─────────────────────────────────────────────────────────────
   Notifications push (feature V1 — espace client, web-push).
   Conservées à l'identique : le nouveau SW remplace l'ancien
   "qr-domotik-v2" qui les portait déjà.
   ───────────────────────────────────────────────────────────── */

self.addEventListener('push', (event) => {
  let data = { title: 'Conciergerie Hub', body: 'Nouvelle notification', icon: '/icon-512.png' };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-512.png',
    badge: '/icon-512.png',
    vibrate: [100, 50, 100],
    data: data.data || {},
    actions: data.actions || [],
    tag: data.tag || 'ch-notification',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      return self.clients.openWindow(urlToOpen);
    }),
  );
});
