// =============================================================
// v4.50 « VERROUILLAGE DU HUB PAR CODE » — CÔTÉ CLIENT (hub invité)
//
// La session d'accès vit dans le localStorage du téléphone de
// l'invité : { token, endAt }.
//   • token  : renvoyé par POST /api/public/hub/[slug]/access après
//              saisie correcte du code d'activation (48 hex) ;
//   • endAt  : fin de séjour effective (ISO) — rallongée quand
//              l'hôte valide un départ tardif.
//
// Un script calcule en continu la différence entre l'heure du
// téléphone et endAt : dès que le temps est écoulé, la clé locale
// est EFFACÉE et l'écran de saisie du code s'affiche (le hub
// revient verrouillé). Côté serveur, chaque action envoie
// x-hub-token — un 403 SESSION_EXPIRED déclenche exactement le
// même verrouillage immédiat (onglet resté ouvert 10 min après le
// check-out : la requête est refusée puis l'écran de code apparaît).
// =============================================================

export interface HubAccessSessionClient {
  token: string;
  /** Fin de séjour effective (ISO 8601) — null si inconnue. */
  endAt: string | null;
  guestName?: string | null;
}

export class HubSessionExpiredError extends Error {
  constructor(message = 'Session expirée') {
    super(message);
    this.name = 'HubSessionExpiredError';
  }
}

const storageKey = (slug: string) => `hub-access-${slug}`;

export function getHubSession(slug: string): HubAccessSessionClient | null {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HubAccessSessionClient> | null;
    if (!parsed || typeof parsed.token !== 'string' || parsed.token.length < 16) return null;
    return {
      token: parsed.token,
      endAt: typeof parsed.endAt === 'string' ? parsed.endAt : null,
      guestName: typeof parsed.guestName === 'string' ? parsed.guestName : null,
    };
  } catch {
    return null;
  }
}

export function setHubSession(slug: string, session: HubAccessSessionClient): void {
  try {
    window.localStorage.setItem(storageKey(slug), JSON.stringify(session));
  } catch {
    // localStorage indisponible (navigation privée stricte) : la
    // session fonctionnera pour cet onglet mais sera redemandée au
    // prochain scan — comportement acceptable.
  }
}

export function clearHubSession(slug: string): void {
  try {
    window.localStorage.removeItem(storageKey(slug));
  } catch {
    // ignore
  }
}

/** Temps restant avant verrouillage (ms) — négatif = déjà expiré. */
export function remainingMs(endAt: string | null): number {
  if (!endAt) return Number.POSITIVE_INFINITY;
  const t = new Date(endAt).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return t - Date.now();
}

/** « Temps restant : 01j 14h 22m » (spécification client). */
export function formatRemaining(msLeft: number): string {
  if (!Number.isFinite(msLeft)) return '';
  if (msLeft <= 0) return '0m';
  const totalMin = Math.floor(msLeft / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${String(d).padStart(2, '0')}j ${h}h ${String(m).padStart(2, '0')}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

/**
 * fetch hub avec le token de session :
 *   - ajoute l'en-tête x-hub-token (le serveur vérifie systématiquement) ;
 *   - un 403 SESSION_* → clé locale effacée + HubSessionExpiredError
 *     (le hub bascule immédiatement sur l'écran de code).
 */
export async function hubFetch(
  slug: string,
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const session = getHubSession(slug);
  const headers = new Headers(init?.headers);
  if (session?.token) headers.set('x-hub-token', session.token);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 403) {
    const body = (await res
      .clone()
      .json()
      .catch(() => null)) as { error?: string; message?: string } | null;
    const code = body?.error ?? '';
    if (
      code === 'SESSION_REQUIRED' ||
      code === 'SESSION_INVALID' ||
      code === 'SESSION_EXPIRED'
    ) {
      clearHubSession(slug);
      throw new HubSessionExpiredError(body?.message ?? 'Session expirée');
    }
  }
  return res;
}
