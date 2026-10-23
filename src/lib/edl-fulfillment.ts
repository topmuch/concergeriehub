// =============================================================
// EDL FULFILLMENT — Capture PayPal + création de compte (v4.107)
// SERVER ONLY. Utilisé par la page /edl/paiement/retour (capture)
// et l'API /api/edl/activate (création du compte EDL-only).
// =============================================================
import { compare, hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureEdlPayPalOrder, EDL_PLAN } from '@/lib/edl-paypal';
import { queueEmail } from '@/lib/email';

// -------------------------------------------------------------
// CAPTURE (au retour PayPal — idempotent)
// -------------------------------------------------------------

export interface CaptureResult {
  ok: boolean;
  /** URL d'activation à ouvrir si la capture réussit. */
  activationUrl?: string;
  error?: 'introuvable' | 'capture_failed' | 'erreur';
  detail?: string;
}

/**
 * Capture la commande PayPal liée à orderRef et passe l'achat en
 * 'paid' (une seule fois — toute relecture renvoie le même résultat).
 */
export async function captureEdlPurchase(orderRef: string): Promise<CaptureResult> {
  try {
    const purchase = await db.edlPurchase.findUnique({ where: { orderRef } });
    if (!purchase) return { ok: false, error: 'introuvable' };

    // Déjà capturé (retour rafraîchi, double onglet…) → même lien.
    if (purchase.status === 'paid' || purchase.status === 'activated') {
      return { ok: true, activationUrl: `/edl/activer/${purchase.activationToken}` };
    }
    if (!purchase.paypalOrderId) {
      return { ok: false, error: 'capture_failed', detail: 'commande_sans_id' };
    }

    const capture = await captureEdlPayPalOrder(purchase.paypalOrderId);
    if (!capture.ok || !capture.data) {
      console.error('[edl-fulfillment] capture failed:', capture.error);
      return { ok: false, error: 'capture_failed', detail: capture.error };
    }

    const updated = await db.edlPurchase.update({
      where: { id: purchase.id },
      data: {
        status: 'paid',
        payerEmail: capture.data.payer?.email_address ?? purchase.payerEmail,
        paidAt: new Date(),
      },
      select: { activationToken: true, status: true },
    });

    return { ok: true, activationUrl: `/edl/activer/${updated.activationToken}` };
  } catch (error) {
    console.error('[edl-fulfillment] capture error:', error);
    return { ok: false, error: 'erreur' };
  }
}

// -------------------------------------------------------------
// ACTIVATION (création du compte EDL-only)
// -------------------------------------------------------------

export interface ActivateInput {
  token: string;
  email: string;
  password: string;
  fullName: string;
}

export interface ActivateResult {
  ok: boolean;
  status: 200 | 400 | 401 | 404 | 409 | 410 | 429 | 500;
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
  return typeof password === 'string' && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

/**
 * Consomme le jeton d'activation d'un achat PAYÉ : crée le compte
 * (role 'user', limité au dashboard EDL) + l'abonnement EDL d'un an,
 * ou rattache l'abonnement à un compte existant (email + mot de passe
 * corrects). Idempotent côté achat : un achat 'activated' est refusé
 * (409) pour ne jamais créer de second compte.
 */
export async function activateEdlPurchase(input: ActivateInput): Promise<ActivateResult> {
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

  const purchase = await db.edlPurchase.findUnique({ where: { activationToken: input.token } });
  if (!purchase) return { ok: false, status: 404, error: "Lien d'activation invalide." };
  if (purchase.status === 'activated') {
    return { ok: false, status: 409, error: 'Cet achat a déjà été activé. Connectez-vous.' };
  }
  if (purchase.status !== 'paid') {
    return { ok: false, status: 400, error: "Le paiement n'a pas été confirmé pour ce lien." };
  }
  if (purchase.activationExpiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      status: 410,
      error: "Ce lien d'activation a expiré (72 h). Contactez le support pour un nouveau lien.",
    };
  }

  // Rattachement à un compte existant ? (email connu + mot de passe correct)
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

    // Compte existant vérifié : rattacher l'achat + (re)mettre
    // l'abonnement EDL actif un an (sans toucher aux autres champs).
    const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await db.$transaction([
      db.inspectionSubscription.upsert({
        where: { userId: existing.id },
        update: { status: 'active', plan: EDL_PLAN, endDate },
        create: { userId: existing.id, status: 'active', plan: EDL_PLAN, endDate },
      }),
      db.edlPurchase.update({
        where: { id: purchase.id },
        data: { status: 'activated', userId: existing.id, activatedAt: new Date() },
      }),
    ]);
    void queueWelcomeEmail(existing.email, fullName, false).catch(() => undefined);
    return { ok: true, status: 200, attachedToExisting: true };
  }

  // ── Création du compte EDL-only ──
  const passwordHash = await hash(input.password, 12);
  const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  try {
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          fullName,
          passwordHash,
          role: 'user',
          isActive: true,
          selectedPlan: 'edl_standalone',
        },
        select: { id: true, email: true },
      });
      await tx.inspectionSubscription.create({
        data: { userId: created.id, status: 'active', plan: EDL_PLAN, endDate },
      });
      await tx.edlPurchase.update({
        where: { id: purchase.id },
        data: { status: 'activated', userId: created.id, activatedAt: new Date() },
      });
      return created;
    });

    void queueWelcomeEmail(user.email, fullName, true).catch(() => undefined);
    return { ok: true, status: 200 };
  } catch (error) {
    // Course unique : le même email créé entre-temps.
    console.error('[edl-fulfillment] activation error:', error);
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

function queueWelcomeEmail(to: string, fullName: string, isNew: boolean): Promise<unknown> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ||
    process.env.NEXTAUTH_URL?.replace(/\/+$/, '') ||
    '';
  const dashboardUrl = `${baseUrl}/inspection/dashboard`;
  const prenom = fullName.split(' ')[0] || 'Bonjour';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
      <h2 style="margin:0 0 4px">Bienvenue chez RoomScan, ${prenom} 👋</h2>
      <p style="color:#334155">Votre offre <strong>États des Lieux — 299 €/an</strong> est activée :
      créations illimitées, signature électronique et <strong>génération de PDF illimitée</strong>.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Votre espace</td><td><a href="${dashboardUrl}" style="color:#04467a">Tableau de bord États des Lieux</a></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Validité</td><td>12 mois (jusqu'au ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR')})</td></tr>
      </table>
      <p style="color:#334155">${isNew
        ? 'Connectez-vous avec l\'adresse et le mot de passe que vous venez de choisir.'
        : 'Votre espace existant a été prolongé d\'un an.'}</p>
      <p style="color:#94a3b8;font-size:12px">À très vite,<br/>L'équipe RoomScan</p>
    </div>`;
  return queueEmail({
    to,
    subject: '✅ Votre accès « États des Lieux » est activé — RoomScan',
    html,
    text: `Votre offre États des Lieux (299 €/an) est activée. Espace : ${dashboardUrl}`,
    template: 'custom',
    referenceType: 'edl_purchase',
  });
}

// -------------------------------------------------------------
// Rate limit partagé (route API)
// -------------------------------------------------------------

export async function edlActivateRateLimit(ip: string): Promise<boolean> {
  return rateLimit(`edl-activate:${ip}`, 6);
}
