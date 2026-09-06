import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// =============================================================
// REMÉDIATION SÉCURITÉ — Surface legacy /api/client/*
// Ces routes (espace client QRdoo historique) n'ont aucune garde
// interne. Le middleware exige une session NextAuth valide (JWT)
// pour TOUTE requête /api/client/**. Sans token → 401 JSON.
//
// Les parcours publics (hub, app invitée, view, setup) utilisent
// /api/public/* et /api/setup/* — ils ne sont pas affectés.
//
// ÉTAPE 19 (V3) — WHITE-LABEL : résolution de domaine personnalisé.
// Une requête de PAGE qui n'arrive pas sur le domaine de la
// plateforme est supposée venir d'un customDomain de conciergerie
// (ex: guests.ma-conciergerie.com). Le middleware demande alors le
// slug du bien à /api/public/domain-lookup (domaines ACTIFS et
// VÉRIFIÉS uniquement) et RÉÉCRIT (sans redirection → l'URL du
// visiteur reste propre) vers /app/hub/<slug>/guest : l'app invitée
// s'affiche sous la marque de la conciergerie, à son domaine.
// Les /api/** et assets ne sont JAMAIS réécrits. Cache mémoire
// 5 min pour ne pas taper l'API à chaque visite.
// =============================================================

/** Cache mémoire (par instance) : customDomain → slug | null. */
const domainCache = new Map<string, { slug: string | null; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// =============================================================
// AUD-FULL / FIX-8b — Content-Security-Policy stricte (nonce).
// Pattern officiel Next.js : le middleware génère un nonce unique
// par requête, le pose sur les en-têtes de la REQUÊTE (x-nonce +
// CSP) — Next le propage automatiquement à ses <script> rendus —
// et la CSP sur la réponse. 'strict-dynamic' rend obsolètes
// 'unsafe-inline' et https: pour les navigateurs modernes tout en
// servant de fallback aux anciens.
// Calibration réelle du projet (aucun script externe, Stripe 100%
// serveur) :
//   - img https://*.tile.openstreetmap.org → tuiles Leaflet
//     (admin-providers-map).
//   - style 'unsafe-inline' → <style> injectés par Next.
//   - media/blob + img data: → QR en data-URL, messages vocaux
//     MediaRecorder (blob), previews photos.
//   - dev uniquement : 'unsafe-eval' (React Refresh/Turbopack HMR)
//     + ws: (websocket HMR).
// =============================================================

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https:${
      isDev ? " 'unsafe-eval'" : ''
    }`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https://*.tile.openstreetmap.org`,
    `font-src 'self' data:`,
    `media-src 'self' blob:`,
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'self'`,
  ].join('; ');
}

function appHostnames(): Set<string> {
  const hosts = new Set<string>(['localhost', '127.0.0.1', '0.0.0.0']);
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  if (envUrl) {
    try {
      hosts.add(new URL(envUrl).hostname.toLowerCase());
    } catch {
      /* env invalide — ignorée */
    }
  }
  return hosts;
}

async function resolveCustomDomain(req: NextRequest, host: string): Promise<string | null> {
  const cached = domainCache.get(host);
  if (cached && cached.expires > Date.now()) return cached.slug;

  let slug: string | null = null;
  try {
    const url = new URL('/api/public/domain-lookup', req.nextUrl.origin);
    url.searchParams.set('host', host);
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const json = (await res.json()) as { slug?: string };
      slug = typeof json.slug === 'string' ? json.slug : null;
    }
  } catch {
    /* lookup indisponible → comportement normal (404 natif) */
  }
  domainCache.set(host, { slug, expires: Date.now() + CACHE_TTL_MS });
  return slug;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 0. CSP nonce (FIX-8b) — généré pour toute requête de page ──
  const isApiRequest = pathname.startsWith('/api/');
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const csp = isApiRequest ? null : buildCsp(nonce);
  const requestHeaders = new Headers(req.headers);
  if (csp) {
    // Next lit le nonce dans l'en-tête CSP de la requête et l'applique
    // à ses propres <script> (pattern officiel Content-Security-Policy).
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);
  }

  // ── 1. Garde legacy : session obligatoire sur /api/client/** ──
  if (pathname.startsWith('/api/client')) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
    }
    return NextResponse.next();
  }

  const withCsp = (res: NextResponse): NextResponse => {
    if (csp) res.headers.set('Content-Security-Policy', csp);
    return res;
  };

  // ── 2. White-label : pages servies depuis un domaine custom ──
  if (!pathname.startsWith('/api/')) {
    const host = (req.headers.get('host') || '').split(':')[0].toLowerCase();
    // Host sans point (localhost) ou = domaine de la plateforme → flux normal.
    if (host && !appHostnames().has(host) && host.includes('.')) {
      const slug = await resolveCustomDomain(req, host);
      if (slug) {
        const url = new URL(`/app/hub/${slug}/guest`, req.nextUrl.origin);
        // Conserve la query (?b=, ?paid=…) du domaine custom.
        req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
        return withCsp(NextResponse.rewrite(url, { request: { headers: requestHeaders } }));
      }
    }
  }

  return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  // Pages + /api/client/**. Exclut les assets Next et fichiers statiques.
  matcher: ['/api/client/:path*', '/((?!_next|favicon\\.ico|manifest\\.json|sw\\.js|uploads).*)'],
};
