// =============================================================
// HUB FULFILLMENT — Achat PUBLIC Solo/Pro via PayPal (v5.17)
// SERVER ONLY. Utilisé par la page /paypal/activer (vérif du retour)
// et l'API /api/paypal/public-activate (création du compte hôte).
//
// Même philosophie que le parcours EDL (lib/edl-fulfillment.ts) :
//   1. l'acheteur paie sur PayPal depuis la page d'accueil (sans
//      compte) — trace PayPalPendingSubscription + custom_id
//      `public:<pendingId>` ;
//   2. au retour, VÉRIFICATION SERVEUR de la souscription PayPal
//      (statut ACTIVE requis — un abonnement APPROVAL_PENDING n'a
//      PAS été payé, on n'active jamais sur cette foi) ;
//   3. création du compte hôte (ou rattachement après vérification
//      email + mot de passe) + Subscription Prisma + Transaction
//      comptable + User.selectedPlan (même logique que le webhook
//      Stripe / la route /api/paypal/activate).
// =============================================================
import { compare, hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { getHostPlan, planPrice, type BillingCycle } from '@/lib/billing';
import { getPayPalSubscription } from '@/lib/paypal';
import { queueEmail } from '@/lib/email';

export type PendingStatus = 'created' | 'approved' | 'activated' | 'cancelled';

// -------------------------------------------------------------
// VÉRIFICATION du retour PayPal (page /paypal/activer)
// -------------------------------------------------------------

export interface PendingCheckResult {
  ok: boolean;
  /** 'not_found' | 'expired' | 'activated' | 'pending_paypal' | 'not_paid' | 'erreur' */
  state:
    | 'ok'
    | 'not_found'
    | 'expired'
    | 'activated'
    | 'pending_paypal'
    | 'not_paid'
    | 'erreur';
  plan?: string;
  billingCycle?: string;
  /** Email PayPal de l'acheteur (pré-remplit le formulaire). */
  payerEmail?: string | null;
  detail?: string;
}

/**
 * Vérifie l'état d'une trace d'achat public + la souscription PayPal
 * côté API (source de vérité). Idempotent — ne modifie RIEN.
 */
export async function checkHubPending(activationToken: string): Promise<PendingCheckResult> {
  try {
    const pending = await db.payPalPendingSubscription.findUnique({
      where: { activationToken },
    });
    if (!pending) return { ok: false, state: 'not_found' };
    if (pending.status === 'activated') {
      return { ok: true, state: 'activated', plan: pending.plan, billingCycle: pending.billingCycle };
    }
    if (pending.activationExpiresAt.getTime() < Date.now()) {
      return { ok: false, state: 'expired', plan: pending.plan };
    }
    if (!pending.paypalSubscriptionId) {
      return { ok: false, state: 'not_paid', plan: pending.plan };
    }

    const remote = await getPayPalSubscription(pending.paypalSubscriptionId);
    if (!remote) {
      return { ok: false, state: 'erreur', plan: pending.plan, detail: 'souscription_introuvable' };
    }

    // Anti-forgery : le custom_id doit pointer CETTE trace.
    if ((remote.custom_id ?? '') !== `public:${pending.id}`) {
      console.error(
        `[hub-fulfillment] custom_id mismatch — pending ${pending.id}, custom_id ${remote.custom_id ?? ''}`,
      );
      return { ok: false, state: 'erreur', plan: pending.plan, detail: 'custom_id_mismatch' };
    }

    const status = (remote.status ?? '').toUpperCase();
    if (status === 'APPROVAL_PENDING') {
      // Pas encore approuvé/payé — jamais d'activation sur cette foi.
      return {
        ok: false,
        state: 'pending_paypal',
        plan: pending.plan,
        billingCycle: pending.billingCycle,
      };
    }
    if (status !== 'ACTIVE') {
      return { ok: false, state: 'not_paid', plan: pending.plan, detail: status || 'inconnu' };
    }

    // Souscription ACTIVE — trace locale passée en 'approved' (une fois).
    const payerEmail = remote.subscriber?.email_address ?? null;
    if (pending.status === 'created') {
      await db.payPalPendingSubscription.update({
        where: { id: pending.id },
        data: { status: 'approved', payerEmail },
      });
    }
    return {
      ok: true,
      state: 'ok',
      plan: pending.plan,
      billingCycle: pending.billingCycle,
      payerEmail: payerEmail ?? pending.payerEmail,
    };
  } catch (error) {
    console.error('[hub-fulfillment] checkHubPending error:', error);
    return { ok: false, state: 'erreur' };
  }
}

// -------------------------------------------------------------
// ACTIVATION (création / rattachement du compte hôte)
// -------------------------------------------------------------

export interface HubActivateInput {
  token: string;
  email: string;
  password: string;
  fullName: string;
}

export interface HubActivateResult {
  ok: boolean;
  status: 200 | 400 | 401 | 402 | 404 | 409 | 410 | 429 | 500;
  error?: string;
  /** Email existant + mot de passe correct → compte rattaché. */
  attachedToExisting?: boolean;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Politique mot de passe identique à /api/auth/register. */
function validPassword(password: string): boolean {
  return (
    typeof password === 'string' && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
  );
}

export async function activateHubPurchase(input: HubActivateInput): Promise<HubActivateResult> {
  const email = normalizeEmail(input.email ?? '');
  const fullName = (input.fullName ?? '').trim();

  if (!input.token) return { ok: false, status: 400, error: 'Jeton manquant.' };
  if (!email || !validEmail(email)) {
    return { ok: false, status: 400, error: 'Indiquez une adresse email valide.' };
  }
  if (!validPassword(input.password)) {
    return {
      ok: false,
      status: 400,
      error: 'Mot de passe : 8 caractères minimum, avec lettres et chiffres.',
    };
  }
  if (!fullName || fullName.length < 2 || fullName.length > 80) {
    return { ok: false, status: 400, error: 'Indiquez votre nom complet.' };
  }

  const pending = await db.payPalPendingSubscription.findUnique({
    where: { activationToken: input.token },
  });
  if (!pending) return { ok: false, status: 404, error: "Lien d'activation invalide." };
  if (pending.status === 'activated') {
    return { ok: false, status: 409, error: 'Cet achat a déjà été activé. Connectez-vous.' };
  }
  if (pending.activationExpiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      status: 410,
      error: "Ce lien d'activation a expiré (72 h). Contactez le support pour un nouveau lien.",
    };
  }

  // ── Vérification PayPal (source de vérité — statut ACTIVE requis) ──
  const check = await checkHubPending(input.token);
  if (check.state === 'pending_paypal') {
    return {
      ok: false,
      status: 409,
      error:
        "Votre paiement est encore en cours de confirmation chez PayPal. Attendez quelques secondes puis réessayez.",
    };
  }
  if (check.state === 'not_paid') {
    return {
      ok: false,
      status: 402,
      error: "Le paiement n'a pas été confirmé pour ce lien.",
    };
  }
  if (check.state !== 'ok' && check.state !== 'activated') {
    return {
      ok: false,
      status: check.state === 'expired' ? 410 : 400,
      error: "Impossible de confirmer l'abonnement PayPal pour ce lien. Réessayez.",
    };
  }

  const plan = getHostPlan(pending.plan);
  const cycle: BillingCycle = pending.billingCycle === 'annual' ? 'annual' : 'monthly';
  if (!plan || planPrice(plan, cycle) === null) {
    return { ok: false, status: 400, error: 'Offre inconnue dans la souscription.' };
  }
  const price = planPrice(plan, cycle) as number;
  const paypalSubscriptionId = pending.paypalSubscriptionId as string;

  // ── Rattachement à un compte existant ? ──
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.passwordHash) {
      return {
        ok: false,
        status: 409,
        error: 'Un compte existe déjà avec cet email. Connectez-vous ou utilisez un autre email.',
      };
    }
    const match = await compare(input.password, existing.passwordHash).catch(() => false);
    if (!match) {
      return {
        ok: false,
        status: 401,
        error: 'Un compte existe déjà avec cet email — mot de passe incorrect.',
      };
    }
  }

  // ── Période : next_billing_time PayPal sinon +1 cycle ──
  const remote = await getPayPalSubscription(paypalSubscriptionId);
  const now = new Date();
  let periodEnd: Date | null = null;
  if (remote?.billing_info?.next_billing_time) {
    const parsed = new Date(remote.billing_info.next_billing_time);
    if (!Number.isNaN(parsed.getTime())) periodEnd = parsed;
  }
  if (!periodEnd) {
    periodEnd = new Date(now);
    if (cycle === 'annual') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  try {
    await db.$transaction(async (tx) => {
      // Compte : rattaché (existant vérifié) ou créé.
      const userId =
        existing?.id ??
        (
          await tx.user.create({
            data: {
              email,
              fullName,
              passwordHash: await hash(input.password, 12),
              role: 'user',
              isActive: true,
              selectedPlan: plan.id,
            },
            select: { id: true },
          })
        ).id;

      // Un seul abonnement actif à la fois (idempotent pour CET id PayPal).
      await tx.subscription.updateMany({
        where: {
          userId,
          status: 'active',
          NOT: { paypalSubscriptionId },
        },
        data: { status: 'cancelled' },
      });

      const subExisting = await tx.subscription.findFirst({
        where: { paypalSubscriptionId },
        select: { id: true },
      });
      if (subExisting) {
        await tx.subscription.update({
          where: { id: subExisting.id },
          data: {
            plan: plan.id,
            amount: price,
            currency: 'EUR',
            billingCycle: cycle,
            maxProperties: plan.maxProperties,
            paymentProvider: 'paypal',
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      } else {
        await tx.subscription.create({
          data: {
            subscriberType: 'user',
            userId,
            plan: plan.id,
            amount: price,
            currency: 'EUR',
            billingCycle: cycle,
            maxProperties: plan.maxProperties,
            paymentProvider: 'paypal',
            paypalSubscriptionId,
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      }

      // Transaction comptable idempotente (referenceId = id PayPal).
      const existingTx = await tx.transaction.findFirst({
        where: { type: 'subscription', referenceId: paypalSubscriptionId },
        select: { id: true },
      });
      if (!existingTx) {
        await tx.transaction.create({
          data: {
            type: 'subscription',
            payerId: userId,
            amount: price,
            currency: 'EUR',
            status: 'completed',
            referenceId: paypalSubscriptionId,
          },
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: { selectedPlan: plan.id },
      });

      await tx.payPalPendingSubscription.update({
        where: { id: pending.id },
        data: { status: 'activated', userId, payerEmail: pending.payerEmail ?? email },
      });
    });

    void queueHubWelcomeEmail(email, fullName, plan.name, !existing).catch(() => undefined);
    return { ok: true, status: 200, attachedToExisting: Boolean(existing) };
  } catch (error) {
    console.error('[hub-fulfillment] activation error:', error);
    return {
      ok: false,
      status: 409,
      error: 'Un compte existe déjà avec cet email. Connectez-vous.',
    };
  }
}

// -------------------------------------------------------------
// Email de bienvenue (file outbox → Resend) — fire-and-forget
// -------------------------------------------------------------

function queueHubWelcomeEmail(
  to: string,
  fullName: string,
  planName: string,
  isNew: boolean,
): Promise<unknown> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ||
    process.env.NEXTAUTH_URL?.replace(/\/+$/, '') ||
    '';
  const dashboardUrl = `${baseUrl}/airbnb/dashboard`;
  const prenom = fullName.split(' ')[0] || 'Bonjour';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
      <h2 style="margin:0 0 4px">Bienvenue chez RoomScan, ${prenom} 👋</h2>
      <p style="color:#334155">Votre offre <strong>${planName}</strong> est activée :
      votre Hub est prêt — plaque QR, guidebook, Wi-Fi et vos modules d'expérience invité.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Votre espace</td><td><a href="${dashboardUrl}" style="color:#04467a">Tableau de bord Hub</a></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Facturation</td><td>PayPal — renouvellement mensuel, résiliable à tout moment</td></tr>
      </table>
      <p style="color:#334155">${isNew
        ? 'Connectez-vous avec l\'adresse et le mot de passe que vous venez de choisir.'
        : 'Votre espace existant a été mis à jour avec votre nouvelle offre.'}</p>
      <p style="color:#94a3b8;font-size:12px">À très vite,<br/>L'équipe RoomScan</p>
    </div>`;
  return queueEmail({
    to,
    subject: '✅ Votre abonnement RoomScan est activé',
    html,
    text: `Votre offre ${planName} est activée. Espace : ${dashboardUrl}`,
    template: 'custom',
    referenceType: 'paypal_pending_subscription',
  });
}
