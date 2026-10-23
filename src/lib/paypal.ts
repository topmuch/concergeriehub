// =============================================================
// PAYPAL SUBSCRIPTIONS — RoomScan Hub (v4.95)
//
// Périmètre STRICT : les ABONNEMENTS PLATEFORME des hôtes (plans
// airbnb_solo / airbnb_pro — voir lib/billing.ts) passent par
// PayPal Subscriptions. Stripe reste dédié aux paiements HÔTES
// (minibar, commandes services, Connect — lib/stripe-webhook-core.ts).
// NE JAMAIS mélanger les deux flux.
//
// Activation PAR VARIABLES D'ENV (clés fournies plus tard) :
//   - PAYPAL_CLIENT_ID       (requis)
//   - PAYPAL_CLIENT_SECRET   (requis)
//   - PAYPAL_ENV             'sandbox' | 'live' (défaut 'sandbox')
//   - PAYPAL_WEBHOOK_ID      (optionnel — vérification crypto des webhooks)
// Sans ces clés → isPayPalConfigured() = false → parcours Stripe /
// démo existant INCHANGÉ (aucun bouton PayPal affiché côté UI).
//
// Patterns respectés :
//   - fetch natif (AUCUNE dépendance npm) + timeouts AbortController ;
//   - JAMAIS de throw vers le flux métier sans capture : les fonctions
//     métier retournent null / result-objects et loggent (console +
//     captureError → AuditLog /admin/logs) ;
//   - token OAuth2 mis en cache ~9h (module-level, un process = un cache) ;
//   - IDs Product/Plans PayPal mis en cache en table SystemSetting
//     ('paypal.product_id', 'paypal.plan_<plan>_<cycle>') → créés une
//     seule fois, même après un restart.
// =============================================================
import { db } from '@/lib/db';
import { captureError } from '@/lib/error-monitor';
import {
  HOST_PLANS,
  planPrice,
  type BillingCycle,
  type HostPlan,
  type HostPlanId,
} from '@/lib/billing';

// ------------------------------------------------------------
// Configuration
// ------------------------------------------------------------

/** 'live' → api-m.paypal.com, sinon (défaut) sandbox → api-m.sandbox.paypal.com. */
export function payPalEnv(): 'sandbox' | 'live' {
  return process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
}

/** Base URL de l'API PayPal REST selon l'environnement configuré. */
export function payPalBaseURL(): string {
  return payPalEnv() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

/** PayPal est utilisable ssi les DEUX clés sont présentes. */
export function isPayPalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

// ------------------------------------------------------------
// Types PayPal (minimaux — champ par champ, pas d'any)
// ------------------------------------------------------------

interface PayPalLink {
  rel: string;
  href: string;
  method?: string;
}

interface PayPalProductPayload {
  id: string;
  name: string;
}

interface PayPalListProductsResponse {
  products?: PayPalProductPayload[];
}

interface PayPalPlanPayload {
  id: string;
  name: string;
  product_id?: string;
  status?: string;
}

interface PayPalListPlansResponse {
  plans?: PayPalPlanPayload[];
}

export interface PayPalSubscriptionView {
  id: string;
  status: string;
  custom_id?: string;
  start_time?: string;
  subscriber?: { email_address?: string; name?: { given_name?: string; surname?: string } };
  billing_info?: {
    next_billing_time?: string;
    last_payment?: { time?: string };
  };
}

interface PayPalCreateSubscriptionResponse {
  id: string;
  links?: PayPalLink[];
}

interface PayPalVerifySignatureResponse {
  verification_status?: string;
}

interface PayPalErrorResponse {
  message?: string;
  name?: string;
}

/** Résultat générique d'un appel API PayPal (jamais une exception). */
export interface PayPalRequestResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

// ------------------------------------------------------------
// fetch + timeouts (AbortController — jamais de hang)
// ------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// OAuth2 client_credentials — token mis en cache ~9h
// ------------------------------------------------------------

let cachedToken: { value: string; expiresAtMs: number } | null = null;

const TOKEN_FALLBACK_TTL_MS = 9 * 60 * 60 * 1000; // ~9h (spec)
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000; // marge anti-expiration

/**
 * Récupère (ou réutilise) un access token OAuth2 PayPal.
 * Interne : les fonctions métier capturent les erreurs — cette
 * fonction peut throw (les appelants wrappent toujours).
 */
export async function getPayPalAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now) {
    return cachedToken.value;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PayPal non configuré (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)');
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetchWithTimeout(
    `${payPalBaseURL()}/v1/oauth2/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    },
    15000,
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`PayPal OAuth échoué (${res.status}) ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('PayPal OAuth : access_token absent de la réponse');
  }

  const ttlMs =
    typeof data.expires_in === 'number' && data.expires_in > 0
      ? Math.min(data.expires_in * 1000 - TOKEN_SAFETY_MARGIN_MS, TOKEN_FALLBACK_TTL_MS)
      : TOKEN_FALLBACK_TTL_MS - TOKEN_SAFETY_MARGIN_MS;

  cachedToken = { value: data.access_token, expiresAtMs: now + Math.max(ttlMs, 60_000) };
  return cachedToken.value;
}

function invalidateToken(): void {
  cachedToken = null;
}

// ------------------------------------------------------------
// paypalRequest — couche unique : auth, retry 401, timeout, capture
// ------------------------------------------------------------

async function paypalRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  opts: { idempotencyKey?: string; timeoutMs?: number; retried?: boolean } = {},
): Promise<PayPalRequestResult<T>> {
  if (!isPayPalConfigured()) {
    return { ok: false, status: 0, data: null, error: 'PayPal non configuré' };
  }
  try {
    const token = await getPayPalAccessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (method === 'POST' && opts.idempotencyKey) {
      headers['PayPal-Request-Id'] = opts.idempotencyKey;
    }

    const res = await fetchWithTimeout(
      `${payPalBaseURL()}${path}`,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      opts.timeoutMs ?? 15000,
    );

    // Token expiré/révoqué en cours de vie du cache → 1 retry propre.
    if (res.status === 401 && !opts.retried) {
      invalidateToken();
      return paypalRequest<T>(method, path, body, { ...opts, retried: true });
    }

    // 204 (cancel) ou 200 avec corps vide.
    if (res.status === 204) {
      return { ok: true, status: res.status, data: null };
    }

    const text = await res.text().catch(() => '');
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = null;
      }
    }

    if (!res.ok) {
      const err = (parsed ?? {}) as PayPalErrorResponse;
      return {
        ok: false,
        status: res.status,
        data: (parsed as T) ?? null,
        error: err.message ?? err.name ?? `PayPal HTTP ${res.status}`,
      };
    }

    return { ok: true, status: res.status, data: (parsed as T) ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const aborted = error instanceof Error && error.name === 'AbortError';
    await captureError('paypal.request', error, {
      method,
      path,
      timeout: aborted || undefined,
    });
    return {
      ok: false,
      status: 0,
      data: null,
      error: aborted ? 'PayPal : délai dépassé' : `PayPal : ${message}`,
    };
  }
}

// ------------------------------------------------------------
// Catalogue — Product « RoomScan Hub » + Plans (SystemSetting cache)
// ------------------------------------------------------------

const PAYPAL_PRODUCT_NAME = 'RoomScan Hub';
const PRODUCT_KEY = 'paypal.product_id';
// v5.17 : le prix est DANS la clé de cache et dans le nom du plan —
// un changement de tarif crée forcément un plan PayPal NEUF au bon
// prix (jamais de réutilisation silencieuse d'un plan à l'ancien
// tarif, ni via cache SystemSetting ni via recherche par nom).
const planSettingKey = (plan: HostPlanId, cycle: BillingCycle, price: number) =>
  `paypal.plan_${plan}_${cycle}_${price}v2`;

/** Couple (plan, cycle) réellement proposé = prix non null dans lib/billing. */
function offeredCombos(): { plan: HostPlan; cycle: BillingCycle; price: number }[] {
  const combos: { plan: HostPlan; cycle: BillingCycle; price: number }[] = [];
  for (const plan of HOST_PLANS) {
    for (const cycle of ['monthly', 'annual'] as const) {
      const price = planPrice(plan, cycle);
      if (price !== null) combos.push({ plan, cycle, price });
    }
  }
  return combos;
}

function planName(plan: HostPlan, cycle: BillingCycle, price: number): string {
  return `RoomScan Hub — ${plan.name} · ${
    cycle === 'annual' ? 'Annuel' : 'Mensuel'
  } · ${price} €`;
}

async function readSetting(key: string): Promise<string | null> {
  const row = await db.systemSetting.findUnique({ where: { key }, select: { value: true } });
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  await db.systemSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/** Crée (ou retrouve par nom) le Product PayPal de la plateforme. */
async function ensureProduct(productIdCache: string | null): Promise<string | null> {
  if (productIdCache) return productIdCache;

  // 1) Le produit existe peut-être déjà côté PayPal (retry après crash
  //    avant écriture du SystemSetting) → recherche par nom exact.
  const listed = await paypalRequest<PayPalListProductsResponse>(
    'GET',
    '/v1/catalogs/products?page_size=20',
  );
  if (listed.ok && listed.data?.products) {
    const found = listed.data.products.find((p) => p.name === PAYPAL_PRODUCT_NAME);
    if (found) {
      await writeSetting(PRODUCT_KEY, found.id).catch(() => undefined);
      return found.id;
    }
  }

  // 2) Sinon création (type SERVICE, monnaie de facturation EUR).
  const created = await paypalRequest<PayPalProductPayload>('POST', '/v1/catalogs/products', {
    name: PAYPAL_PRODUCT_NAME,
    description: 'Abonnements plateforme RoomScan Hub pour hôtes (Airbnb Solo / Airbnb Pro).',
    type: 'SERVICE',
  });
  if (created.ok && created.data?.id) {
    await writeSetting(PRODUCT_KEY, created.data.id).catch(() => undefined);
    return created.data.id;
  }

  await captureError('paypal.ensureProduct', new Error(created.error ?? 'échec création product'), {
    status: created.status,
  });
  return null;
}

/** Crée (ou retrouve par nom) le Plan PayPal d'un couple (plan, cycle). */
async function ensurePlan(
  productId: string,
  plan: HostPlan,
  cycle: BillingCycle,
  price: number,
  planIdCache: string | null,
): Promise<string | null> {
  if (planIdCache) return planIdCache;

  const name = planName(plan, cycle, price);

  // 1) Recherche par nom exact sur les plans du product (idempotence).
  const listed = await paypalRequest<PayPalListPlansResponse>(
    'GET',
    `/v1/billing/plans?product_id=${encodeURIComponent(productId)}&page_size=20`,
  );
  if (listed.ok && listed.data?.plans) {
    const found = listed.data.plans.find((p) => p.name === name);
    if (found) {
      await writeSetting(planSettingKey(plan.id, cycle, price), found.id).catch(
        () => undefined,
      );
      return found.id;
    }
  }

  // 2) Création — un seul cycle de facturation REGULAR, renouvellement infini.
  const created = await paypalRequest<PayPalPlanPayload>(
    'POST',
    '/v1/billing/plans',
    {
      product_id: productId,
      name,
      description: plan.description,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: {
            interval_unit: cycle === 'annual' ? 'YEAR' : 'MONTH',
            interval_count: 1,
          },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: price.toFixed(2), currency_code: 'EUR' },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: { value: '0.00', currency_code: 'EUR' },
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3,
      },
    },
    { idempotencyKey: `roomscan-plan-${plan.id}-${cycle}` },
  );
  if (created.ok && created.data?.id) {
    await writeSetting(planSettingKey(plan.id, cycle, price), created.data.id).catch(
      () => undefined,
    );
    return created.data.id;
  }

  await captureError('paypal.ensurePlan', new Error(created.error ?? 'échec création plan'), {
    plan: plan.id,
    cycle,
    status: created.status,
  });
  return null;
}

export interface PayPalPlanIds {
  /** Plan PayPal par cycle — null si non proposé ou en échec de création. */
  [planId: string]: { monthly: string | null; annual: string | null };
}

export interface EnsurePayPalPlansResult {
  ok: boolean;
  planIds: Record<HostPlanId, { monthly: string | null; annual: string | null }>;
  error?: string;
}

/**
 * Garantit Product + Plans PayPal (IDs mis en cache en SystemSetting).
 * Ne throw JAMAIS : en cas d'échec → { ok: false } (la route renvoie 502).
 */
export async function ensurePayPalPlans(): Promise<EnsurePayPalPlansResult> {
  const planIds: Record<HostPlanId, { monthly: string | null; annual: string | null }> = {
    airbnb_solo: { monthly: null, annual: null },
    airbnb_pro: { monthly: null, annual: null },
  };

  try {
    if (!isPayPalConfigured()) {
      return { ok: false, planIds, error: 'PayPal non configuré' };
    }

    // Cache SystemSetting : ne (re)créer qu'une seule fois.
    const keys = [
      PRODUCT_KEY,
      ...offeredCombos().map((c) => planSettingKey(c.plan.id, c.cycle, c.price)),
    ];
    const rows = await db.systemSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
    const cache = new Map(rows.map((r) => [r.key, r.value]));

    const productId = await ensureProduct(cache.get(PRODUCT_KEY) ?? null);
    if (!productId) {
      return { ok: false, planIds, error: 'Produit PayPal indisponible' };
    }

    let allOk = true;
    for (const combo of offeredCombos()) {
      const id = await ensurePlan(
        productId,
        combo.plan,
        combo.cycle,
        combo.price,
        cache.get(planSettingKey(combo.plan.id, combo.cycle, combo.price)) ?? null,
      );
      if (id) {
        planIds[combo.plan.id][combo.cycle] = id;
      } else {
        allOk = false;
      }
    }

    return { ok: allOk, planIds, error: allOk ? undefined : 'Plan PayPal indisponible' };
  } catch (error) {
    await captureError('paypal.ensurePlans', error);
    return { ok: false, planIds, error: 'PayPal indisponible' };
  }
}

// ------------------------------------------------------------
// Subscriptions — consultation / création / annulation
// ------------------------------------------------------------

/** GET /v1/billing/subscriptions/{id} — null si introuvable/erreur. */
export async function getPayPalSubscription(
  id: string,
): Promise<PayPalSubscriptionView | null> {
  if (!id) return null;
  const res = await paypalRequest<PayPalSubscriptionView>(
    'GET',
    `/v1/billing/subscriptions/${encodeURIComponent(id)}`,
  );
  if (!res.ok || !res.data) {
    console.error(`[paypal] getPayPalSubscription(${id}) → ${res.status} ${res.error ?? ''}`);
    return null;
  }
  return res.data;
}

export interface CreatePayPalSubscriptionInput {
  paypalPlanId: string;
  /** `${userId}|${plan}|${cycle}` — relu à l'activation (anti-forgery). */
  customId: string;
  /**
   * Email de l'abonné — optionnel depuis v5.17 : le parcours d'achat
   * public (sans compte) laisse PayPal collecter l'email de l'acheteur.
   */
  subscriberEmail?: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreatePayPalSubscriptionResult {
  id: string;
  approveUrl: string;
}

/**
 * POST /v1/billing/subscriptions — renvoie l'URL d'approbation PayPal
 * (redirect navigateur). null si échec (jamais de throw).
 *
 * NB : PayPal-Request-Id UNIQUE PAR TENTATIVE — une clé fixe basée sur
 * customId ferait réutiliser la MÊME souscription (p.ex. déjà annulée)
 * lors d'une re-souscription ; chaque appel doit créer un abonnement neuf.
 */
export async function createPayPalSubscription(
  input: CreatePayPalSubscriptionInput,
): Promise<CreatePayPalSubscriptionResult | null> {
  const res = await paypalRequest<PayPalCreateSubscriptionResponse>(
    'POST',
    '/v1/billing/subscriptions',
    {
      plan_id: input.paypalPlanId,
      custom_id: input.customId,
      ...(input.subscriberEmail
        ? { subscriber: { email_address: input.subscriberEmail } }
        : {}),
      application_context: {
        brand_name: 'RoomScan',
        locale: 'fr-FR',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    },
    { idempotencyKey: `roomscan-sub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` },
  );

  if (!res.ok || !res.data?.id) {
    console.error(`[paypal] createPayPalSubscription → ${res.status} ${res.error ?? ''}`);
    await captureError('paypal.createSubscription', new Error(res.error ?? 'échec création'), {
      status: res.status,
    });
    return null;
  }

  const approve = res.data.links?.find((l) => l.rel === 'approve');
  if (!approve?.href) {
    await captureError(
      'paypal.createSubscription',
      new Error('lien approve absent de la réponse PayPal'),
    );
    return null;
  }

  return { id: res.data.id, approveUrl: approve.href };
}

/**
 * POST /v1/billing/subscriptions/{id}/cancel — true si annulé OU déjà
 * annulé/introuvable côté PayPal (404/422 = convergence, pas d'erreur).
 */
export async function cancelPayPalSubscription(id: string, reason: string): Promise<boolean> {
  if (!id) return false;
  const res = await paypalRequest<null>(
    'POST',
    `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`,
    { reason },
    { timeoutMs: 20000 },
  );
  if (res.ok) return true;
  if (res.status === 404 || res.status === 422) {
    // Déjà annulée / introuvable : l'état local reste source de vérité.
    console.warn(`[paypal] cancel ${id} → ${res.status} (déjà annulée ?) — convergence locale`);
    return true;
  }
  console.error(`[paypal] cancelPayPalSubscription(${id}) → ${res.status} ${res.error ?? ''}`);
  await captureError('paypal.cancelSubscription', new Error(res.error ?? 'échec annulation'), {
    subscriptionId: id,
    status: res.status,
  });
  return false;
}

// ------------------------------------------------------------
// Webhooks — vérification de signature
// ------------------------------------------------------------

export interface PayPalWebhookEvent {
  id?: string;
  event_type?: string;
  event_version?: string;
  resource?: Record<string, unknown>;
}

export interface PayPalWebhookVerification {
  verified: boolean;
  reason?: string;
}

/**
 * POST /v1/notifications/verify-webhook-signature.
 * - PAYPAL_WEBHOOK_ID présent → vérification crypto stricte.
 * - Absent → accepté en DEV uniquement (production = rejet, sécurisé).
 * Ne throw JAMAIS : en cas d'erreur technique → verified=false.
 */
export async function verifyPayPalWebhookSignature(
  headers: Headers,
  rawBody: string,
): Promise<PayPalWebhookVerification> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;

  if (!webhookId) {
    if (process.env.NODE_ENV === 'production') {
      return {
        verified: false,
        reason: 'PAYPAL_WEBHOOK_ID manquant (rejet en production)',
      };
    }
    return { verified: true, reason: 'PAYPAL_WEBHOOK_ID absent — accepté en dev' };
  }

  const authAlgo = headers.get('paypal-auth-algo');
  const certUrl = headers.get('paypal-cert-url');
  const transmissionId = headers.get('paypal-transmission-id');
  const transmissionSig = headers.get('paypal-transmission-sig');
  const transmissionTime = headers.get('paypal-transmission-time');

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return { verified: false, reason: 'En-têtes PayPal de signature absents' };
  }

  let eventJson: unknown;
  try {
    eventJson = JSON.parse(rawBody) as unknown;
  } catch {
    return { verified: false, reason: 'Corps webhook illisible (JSON invalide)' };
  }

  const res = await paypalRequest<PayPalVerifySignatureResponse>(
    'POST',
    '/v1/notifications/verify-webhook-signature',
    {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: eventJson,
    },
    { timeoutMs: 20000 },
  );

  if (!res.ok || !res.data) {
    return { verified: false, reason: `Vérification PayPal impossible (${res.status})` };
  }

  if (res.data.verification_status === 'SUCCESS') {
    return { verified: true };
  }
  return { verified: false, reason: `Statut PayPal : ${res.data.verification_status ?? 'inconnu'}` };
}

// ------------------------------------------------------------
// Handlers webhook (source de vérité unique — cf. stripe-webhook-core)
// ------------------------------------------------------------

interface PayPalSaleResource {
  id?: string;
  billing_agreement_id?: string;
  amount?: { total?: string; currency?: string };
}

interface PayPalSubscriptionResource {
  id?: string;
}

/** PAYMENT.SALE.COMPLETED — prolonge la période, réactive si past_due. */
async function handlePaymentSaleCompleted(resource: Record<string, unknown>): Promise<void> {
  const sale = resource as PayPalSaleResource;
  const saleId = sale.id;
  const billingAgreementId = sale.billing_agreement_id;
  if (!saleId || !billingAgreementId) {
    console.warn('[paypal webhook] PAYMENT.SALE.COMPLETED sans id/billing_agreement_id');
    return;
  }

  // Idempotence : une Transaction de référence saleId = déjà traitée
  // (PayPal rejoue les webhooks — jamais de prolongation en double).
  const existingTx = await db.transaction.findFirst({
    where: { type: 'subscription', referenceId: saleId },
    select: { id: true },
  });
  if (existingTx) {
    console.log(`[paypal webhook] Vente ${saleId} déjà traitée (idempotent)`);
    return;
  }

  const sub = await db.subscription.findFirst({
    where: { paypalSubscriptionId: billingAgreementId },
  });
  if (!sub) {
    console.warn(
      `[paypal webhook] Abonnement PayPal ${billingAgreementId} absent en base (vente ${saleId} ignorée)`,
    );
    return;
  }

  const amount = sale.amount?.total ? Number.parseFloat(sale.amount.total) : 0;
  const currency = (sale.amount?.currency ?? 'EUR').toUpperCase();
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  // Période : next_billing_time autoritaire (fonctionne aussi pour le
  // 1er prélèvement déjà compté à l'activation — pas de sur-prolongation).
  // Fallback : prolongation d'un cycle depuis max(now, période courante).
  let periodEnd: Date | null = null;
  const remote = await getPayPalSubscription(billingAgreementId);
  const nextBilling = remote?.billing_info?.next_billing_time;
  if (nextBilling) {
    const parsed = new Date(nextBilling);
    if (!Number.isNaN(parsed.getTime())) periodEnd = parsed;
  }
  if (!periodEnd) {
    const now = new Date();
    const base = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
    periodEnd = new Date(base);
    if (sub.billingCycle === 'annual') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  await db.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'active', // réactive aussi un abonnement past_due
        currentPeriodStart: sub.currentPeriodStart ?? new Date(),
        currentPeriodEnd: periodEnd,
      },
    });

    await tx.transaction.create({
      data: {
        type: 'subscription',
        payerId: sub.userId,
        amount: safeAmount,
        currency,
        status: 'completed',
        referenceId: saleId,
      },
    });

    // Réactive le plan sur le compte hôte (miroir du webhook Stripe).
    if (sub.userId) {
      await tx.user.update({
        where: { id: sub.userId },
        data: { selectedPlan: sub.plan },
      });
    }
  });

  console.log(
    `[paypal webhook] PAYMENT.SALE.COMPLETED — abonnement ${billingAgreementId} prolongé jusqu'au ${periodEnd.toISOString()}`,
  );
}

/**
 * PAYMENT.BILLING.SUBSCRIPTION.CANCELLED / EXPIRED → 'cancelled'
 * PAYMENT.BILLING.SUBSCRIPTION.SUSPENDED → 'past_due' (prélèvement en échec).
 */
async function handleSubscriptionTerminated(
  resource: Record<string, unknown>,
  targetStatus: 'cancelled' | 'past_due',
): Promise<void> {
  const subResource = resource as PayPalSubscriptionResource;
  const paypalSubId = subResource.id;
  if (!paypalSubId) {
    console.warn('[paypal webhook] événement subscription sans resource.id');
    return;
  }

  const sub = await db.subscription.findFirst({
    where: { paypalSubscriptionId: paypalSubId },
  });
  if (!sub) {
    console.warn(`[paypal webhook] Abonnement PayPal ${paypalSubId} absent en base (${targetStatus})`);
    return;
  }

  // Idempotent par nature : réappliquer le même statut est un no-op.
  await db.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: targetStatus },
    });
    if (targetStatus === 'cancelled' && sub.userId) {
      await tx.user.update({
        where: { id: sub.userId },
        data: { selectedPlan: 'free' },
      });
    }
  });

  console.log(`[paypal webhook] Abonnement ${paypalSubId} → ${targetStatus}`);
}

/**
 * Point d'entrée webhook PayPal — route mince /api/paypal/webhook.
 * Gère les événements d'abonnement plateforme ; inconnus → log + 200
 * (PayPal retenterait indéfiniment sinon).
 */
export async function handlePayPalWebhookEvent(event: PayPalWebhookEvent): Promise<void> {
  switch (event.event_type) {
    case 'PAYMENT.SALE.COMPLETED':
      await handlePaymentSaleCompleted(event.resource ?? {});
      break;
    case 'PAYMENT.BILLING.SUBSCRIPTION.CANCELLED':
    case 'PAYMENT.BILLING.SUBSCRIPTION.EXPIRED':
      await handleSubscriptionTerminated(event.resource ?? {}, 'cancelled');
      break;
    case 'PAYMENT.BILLING.SUBSCRIPTION.SUSPENDED':
      await handleSubscriptionTerminated(event.resource ?? {}, 'past_due');
      break;
    default:
      console.log(`[paypal webhook] Événement non géré: ${event.event_type ?? '?'}`);
  }
}
