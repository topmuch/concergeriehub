/* =============================================================
   ÉTAPE 16 (V3) — Service Worker "App Invitée" RoomScan
   =============================================================
   Objectif : le Guidebook, les règles de la maison et le Wi-Fi
   restent disponibles SANS RÉSEAU dans le logement.

   Task 42-a (PWA cleaner) — extension du périmètre à l'APP
   CLEANER (agents de ménage sur mauvaise 4G) : les liens magiques
   /s/[token] (capture check-in/out) et /upload/[token] (photos de
   délégation) doivent s'ouvrir même quand le réseau tombe, grâce
   au repli cache. Les POST (envoi des captures) ne sont JAMAIS
   interceptés — seules les navigations/GET le sont.

   Périmètre : app invitée + app cleaner :
     • navigations  /app/hub/**, /s/**, /upload/**  (PWA)
     • GET          /api/public/**       (payloads hub + guidebook)
     • GET          /api/shield/cleaner/** + /api/shield/delegation/**
                    (état de session cleaner — network-first, jamais
                    mis en cache : fraîcheur garantie)
     • GET          /_next/static/** + /fonts/**  (cache-first : les
                    chunks sont hachés/immuables, les polices fixes)
     • icônes PWA   /api/public/app-icon, /icon, /icon-*, favicon
   Tout le reste (Espace Hôte, dashboard, landing, POST…) n'est
   JAMAIS intercepté → zéro régression possible ailleurs.
   Stratégie : network-first (toujours frais en ligne) avec
   repli cache hors-ligne sur les navigations → pas de contenu
   périmé ; statiques = cache-first (rapide + économe en data).
   ============================================================= */

// v4.119 — bump : purge immédiate des caches legacy chez les clients
// (l'ancien SW « qr-domotik-v2 » et ses caches ne sont plus filtrés par
// préfixe : TOUT cache inconnu est supprimé à l'activation → un client
// ne peut plus se retrouver sur l'ancien code servi depuis un vieux cache).
// Task 42-a — bump « v4-cleaner-1 » : ajout des scopes cleaner (/s/,
// /upload/, API shield cleaner/delegation) + statiques en cache-first.
const VERSION = 'v4-cleaner-1';
const RUNTIME_CACHE = `ch-guest-runtime-${VERSION}`;
const ASSET_CACHE = `ch-guest-assets-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const RUNTIME_MAX_ENTRIES = 80;

const APP_PREFIXES = [
  // App invitée (existante, intacte)
  '/app/hub/', '/api/public/',
  // Task 42-a — app cleaner (mauvaise 4G)
  '/s/', '/upload/', '/api/shield/cleaner/', '/api/shield/delegation/',
  // Statiques + icônes (communs aux deux apps)
  '/_next/static/', '/fonts/', '/icon-', '/icon/', '/favicon',
];
const ICON_PATHS = ['/api/public/app-icon', '/icon-', '/icon/', '/favicon'];
// Statiques immuables (chunks hachés, polices) → cache-first.
const ASSET_PREFIXES = ['/_next/static/', '/fonts/'];

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

/* PHASE FINALE — activation immédiate demandée par la bannière
   « Nouvelle version disponible » (update-banner.tsx). */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* PHASE FINALE — purge FIFO du cache runtime : taille maîtrisée
   même après de nombreux hubs visités (80 entrées max). */
async function trimRuntimeCache() {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    const keys = await cache.keys();
    if (keys.length <= RUNTIME_MAX_ENTRIES) return;
    for (const key of keys.slice(0, keys.length - RUNTIME_MAX_ENTRIES)) {
      await cache.delete(key);
    }
  } catch (_) {
    /* silencieux — la purge ne doit jamais casser le service */
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // v4.119 — PURGE TOTALE : on ne conserve QUE les deux caches de la
      // version courante. Avant : seuls les caches préfixés « ch-guest- »
      // étaient purgés → les vieux caches d'itérations précédentes
      // (ex. « qr-domotik-v2 ») survivaient chez les clients PWA et
      // pouvaient resservir l'ANCIEN code après chaque déploiement.
      const keep = new Set([RUNTIME_CACHE, ASSET_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)),
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
    cache-first car immuables par nature (URL signée par slug+size).
    Task 42-a : /_next/static/ + /fonts/ passent aussi en cache-first
    (chunks hachés = immuables, polices fixes) — l'app cleaner et la
    PWA invitée démarrent même sans réseau une fois la 1re visite faite. */
async function handle(request, url) {
  const cacheable = url.pathname.startsWith('/api/public/guest-app') ||
    url.pathname.startsWith('/app/hub/') ||
    url.pathname.startsWith('/api/public/app-manifest') ||
    // Task 42-a — navigations cleaner mises en cache pour le repli
    // hors-ligne (les API shield restent network-only : fraîcheur).
    url.pathname.startsWith('/s/') ||
    url.pathname.startsWith('/upload/');

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

  // Chunks Next + polices : cache-first (immuables) → réseau
  if (ASSET_PREFIXES.some((p) => url.pathname.startsWith(p))) {
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

  // Navigations + API publiques : network-first → cache → offline
  try {
    const res = await fetch(request);
    if (res.ok && cacheable) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, res.clone());
      void trimRuntimeCache();
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
  let data = { title: 'RoomScan', body: 'Nouvelle notification', icon: '/icon-512.png' };

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
