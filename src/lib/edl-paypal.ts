// =============================================================
// PAYPAL ORDERS — MODULE EDL STANDALONE (v4.107)
//
// Périmètre STRICT : l'offre « États des Lieux — 299 €/an » vendue
// depuis la page d'accueil (paiement UNIQUE via l'API Orders v2,
// capture serveur au retour). Les ABONNEMENTS PLATEFORME des hôtes
// restent dans lib/paypal.ts (API Subscriptions) — NE JAMAIS
// mélanger les deux flux.
//
// Pourquoi Orders (et pas Subscriptions) pour l'EDL :
//   - paiement annuel simple, renouvellement = nouvel achat ;
//   - capture serveur dès le retour PayPal → pas de webhook requis
//     pour la fiabilisation du parcours d'achat ;
//   - compatible carte bancaire (guest checkout) sans compte PayPal.
//
// Activation PAR VARIABLES D'ENV (identique à lib/paypal.ts) :
//   - PAYPAL_CLIENT_ID       (requis)
//   - PAYPAL_CLIENT_SECRET   (requis)
//   - PAYPAL_ENV             'sandbox' | 'live' (défaut 'sandbox')
// Sans clés → isEdlPayPalConfigured() = false → le bouton d'achat
// affiche « paiement en cours d'activation » (aucun crash).
//
// Patterns : fetch natif + AbortController, token OAuth2 en cache
// module-level (~9 h), JAMAIS de throw vers le flux métier (retour
// d'objets résultat + console.error).
// =============================================================

// ── Offre EDL (source unique de vérité — affichée et facturée) ──
export const EDL_PRICE_EUR = 299;
export const EDL_PLAN = 'edl_annual';

/** 'live' → api-m.paypal.com, sinon (défaut) sandbox. */
export function edlPayPalEnv(): 'sandbox' | 'live' {
  return process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
}

function edlPayPalBaseURL(): string {
  return edlPayPalEnv() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

/** PayPal est utilisable ssi les DEUX clés sont présentes. */
export function isEdlPayPalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

// ── Token OAuth2 (cache ~9 h, même process) ──
let tokenCache: { value: string; at: number } | null = null;
const TOKEN_TTL_MS = 9 * 60 * 60 * 1000;

interface PayPalTokenResponse {
  access_token?: string;
}

async function getEdlPayPalToken(): Promise<string | null> {
  if (tokenCache && Date.now() - tokenCache.at < TOKEN_TTL_MS) return tokenCache.value;
  const id = process.env.PAYPAL_CLIENT_ID?.trim();
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${edlPayPalBaseURL()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      console.error('[edl-paypal] token failed:', res.status);
      return null;
    }
    const data = (await res.json()) as PayPalTokenResponse;
    const token = data.access_token ?? null;
    if (token) tokenCache = { value: token, at: Date.now() };
    return token;
  } catch (error) {
    console.error('[edl-paypal] token error:', error);
    return null;
  }
}

export interface EdlPayPalResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

async function edlPayPalRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<EdlPayPalResult<T>> {
  const token = await getEdlPayPalToken();
  if (!token) return { ok: false, status: 0, data: null, error: 'token_indisponible' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(`${edlPayPalBaseURL()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // PayPal exige un idempotency key pour POST — évite les doubles
        // commandes en cas de retry réseau.
        ...(method === 'POST' ? { 'PayPal-Request-Id': crypto.randomUUID() } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const raw = await res.text();
    const data = raw ? (JSON.parse(raw) as T) : null;
    if (!res.ok) {
      const err = data as { message?: string; name?: string } | null;
      return {
        ok: false,
        status: res.status,
        data,
        error: err?.message || err?.name || `paypal_http_${res.status}`,
      };
    }
    return { ok: true, status: res.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : 'erreur_reseau',
    };
  }
}

// ── Types PayPal Orders v2 (minimaux, champ par champ) ──

interface PayPalOrderLink {
  rel: string;
  href: string;
  method?: string;
}

export interface EdlPayPalOrder {
  id: string;
  status?: string;
  links?: PayPalOrderLink[];
}

export interface EdlPayPalCapture {
  id: string;
  status?: string;
  payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
}

export interface CreateEdlOrderInput {
  /** Référence interne unique (EdlPurchase.orderRef) → custom_id. */
  orderRef: string;
  /** URL de retour après approbation (capture serveur). */
  returnUrl: string;
  /** URL en cas d'annulation côté PayPal. */
  cancelUrl: string;
}

/**
 * Crée une commande PayPal de 299,00 € (paiement immédiat, pas de
 * livraison). Renvoie l'URL d'approbation à ouvrir côté client.
 */
export async function createEdlPayPalOrder(
  input: CreateEdlOrderInput,
): Promise<EdlPayPalResult<{ approveUrl: string; orderId: string }>> {
  const result = await edlPayPalRequest<EdlPayPalOrder>('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [
      {
        custom_id: input.orderRef,
        description: 'États des Lieux RoomScan — abonnement annuel',
        amount: { currency_code: 'EUR', value: EDL_PRICE_EUR.toFixed(2) },
      },
    ],
    application_context: {
      brand_name: 'RoomScan',
      locale: 'fr-FR',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'PAY_NOW',
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
    },
  });
  if (!result.ok || !result.data?.id) {
    return { ok: false, status: result.status, data: null, error: result.error };
  }
  const approveUrl =
    result.data.links?.find((l) => l.rel === 'approve' || l.rel === 'payer-action')?.href ?? null;
  if (!approveUrl) {
    return { ok: false, status: result.status, data: null, error: 'approve_url_absente' };
  }
  return { ok: true, status: result.status, data: { approveUrl, orderId: result.data.id } };
}

/**
 * Capture la commande (appelé serveur, une seule fois, au retour
 * PayPal). Idempotent : une commande déjà COMPLETED renvoie ok.
 */
export async function captureEdlPayPalOrder(
  orderId: string,
): Promise<EdlPayPalResult<EdlPayPalCapture>> {
  const result = await edlPayPalRequest<EdlPayPalCapture>(
    'POST',
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
  );
  if (result.ok && result.data) {
    return result;
  }
  // Commande déjà capturée → PayPal renvoie 422 UNPROCESSABLE_ENTITY
  // avec details[0].issue = ORDER_ALREADY_CAPTURED : on relit la
  // commande pour renvoyer les infos payeur (idempotence du retour).
  const read = await edlPayPalRequest<EdlPayPalOrder>(
    'GET',
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
  );
  if (
    read.ok &&
    read.data?.status === 'COMPLETED' &&
    result.error?.includes('ORDER_ALREADY_CAPTURED')
  ) {
    const unit = (read.data as unknown as {
      purchase_units?: { payments?: { captures?: { status?: string }[] } }[];
    }).purchase_units?.[0];
    if (unit?.payments?.captures?.[0]?.status === 'COMPLETED') {
      return { ok: true, status: 200, data: { id: read.data.id } };
    }
  }
  return { ok: false, status: result.status, data: null, error: result.error };
}
