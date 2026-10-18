import { createHash, randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import type { GuestHubLock } from '@/lib/concierge';

// =============================================================
// v4.50 « VERROUILLAGE DU HUB PAR CODE » — CŒUR SERVEUR
//
// L'hôte peut verrouiller le hub de son bien par un code d'activation
// unique par séjour (Booking.accessCode, généré automatiquement quand
// il remplit le calendrier). Le voyageur scanne le QR → écran de
// verrouillage → saisit son code → une session hub est créée.
//
// Double vérification (spécification client) :
//   • CÔTÉ CLIENT : compte à rebours en tête du hub (badge « Temps
//     restant ») ; à zéro, la clé locale est effacée et l'écran de
//     code s'affiche (src/lib/hub-access-client.ts) ;
//   • CÔTÉ SERVEUR (indispensable) : chaque action du hub (commander
//     un petit-déjeuner, déclarer le minibar, ouvrir un ticket…)
//     envoie l'en-tête x-hub-token → requireHubAccess() rejette en
//     403 SESSION_EXPIRED dès que l'heure actuelle dépasse la fin de
//     séjour effective.
//
// Fin de séjour EFFECTIVE = Booking.lateCheckOutUntil (départ tardif
// validé par l'hôte — « prolonge le verrouillage ») ?? Booking.checkOut
// (+ 11 h UTC si checkOut stocké à minuit UTC = date seule iCal).
// La session est donc RALLONGÉE AUTOMATIQUEMENT quand l'hôte valide
// un départ tardif : le compte à rebours client suit au prochain
// rafraîchissement (endAt renvoyé par le payload).
// =============================================================

/** Lit premiumFeatures.hubLock (tolérant, jamais throw). */
export function parseHubLock(raw: unknown): GuestHubLock | null {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lock = (obj.hubLock && typeof obj.hubLock === 'object'
    ? obj.hubLock
    : {}) as Record<string, unknown>;
  if (lock.enabled !== true) return null;
  const instructions =
    typeof lock.checkoutInstructions === 'string'
      ? lock.checkoutInstructions.trim().slice(0, 600)
      : '';
  return {
    enabled: true,
    ...(instructions ? { checkoutInstructions: instructions } : {}),
    ...(lock.allowLateRequest !== false ? { allowLateRequest: true } : {}),
  };
}

// =============================================================
// v4.109 « ANIMATION PRÉ-ARRIVÉE » — la fenêtre d'ouverture du hub
// (HUB_ACCESS_WINDOW_HOURS = 2 h, hubWindowOpensAt) vit dans
// lib/hub-window.ts : module PUR importable par le CLIENT (écran
// d'animation pré-arrivée) ET le serveur. Re-exporté ici pour que
// les routes serveur gardent un seul point d'import.
// v4.109 — la fenêtre passe de 4 h à 2 h (spécification client :
// « animation jusqu'à 2 h avant l'arrivée de l'invité »).
// =============================================================

export {
  HUB_ACCESS_WINDOW_HOURS,
  hubWindowOpensAt,
} from '@/lib/hub-window';

/** Fin de séjour effective (verrouillage + compte à rebours). */
export function bookingStayEnd(b: {
  checkOut: Date;
  lateCheckOutUntil?: Date | null;
}): Date {
  if (b.lateCheckOutUntil) return b.lateCheckOutUntil;
  const co = b.checkOut;
  // Date seule (00:00:00 UTC — héritage calendrier/iCal) → l'heure de
  // check-out standard (11 h UTC ≈ midi/13 h Europe) est appliquée.
  if (co.getUTCHours() === 0 && co.getUTCMinutes() === 0 && co.getUTCSeconds() === 0) {
    return new Date(co.getTime() + 11 * 3_600_000);
  }
  return co;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function newHubAccessToken(): string {
  return randomBytes(24).toString('hex'); // 48 hex
}

/** Code 4 chiffres aléatoire (1 000–9 999 — évite les « 0123 » ambiguïtés). */
export function randomAccessCode(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

/** 4 derniers CHIFFRES du téléphone (spécification : « code d'accès =
 *  les 4 derniers chiffres du numéro de téléphone du client »). */
export function accessCodeFromPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** 4 derniers caractères alphanumériques du code de réservation
 *  plateforme (Airbnb/Booking — « évite d'inventer un nouveau code »). */
export function accessCodeFromRef(ref: string): string | null {
  const alnum = ref.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return alnum.length >= 4 ? alnum.slice(-4) : null;
}

/**
 * Génère un code d'accès UNIQUE pour un nouveau séjour du bien :
 *   1. 4 derniers chiffres du téléphone de l'invité ;
 *   2. 4 derniers caractères du code de réservation (externalRef) ;
 *   3. aléatoire.
 * Unicité parmi les séjours NON TERMINÉS du bien (pas de collision de
 * verrouillage entre deux invités simultanés ou à venir).
 */
export async function generateUniqueAccessCode(
  propertyId: string,
  guestPhone?: string | null,
  externalRef?: string | null,
): Promise<string> {
  const now = new Date();
  const candidates: string[] = [];
  const phone = guestPhone?.trim();
  if (phone) {
    const c = accessCodeFromPhone(phone);
    if (c) candidates.push(c);
  }
  const ref = externalRef?.trim();
  if (ref) {
    const c = accessCodeFromRef(ref);
    if (c) candidates.push(c);
  }
  for (let i = 0; i < 8; i++) candidates.push(randomAccessCode());

  const active = await db.booking.findMany({
    where: {
      propertyId,
      status: { notIn: ['CANCELLED'] },
      checkOut: { gte: now },
      accessCode: { not: null },
    },
    select: { accessCode: true },
    take: 200,
  });
  const taken = new Set(active.map((b) => b.accessCode));
  for (const c of candidates) {
    if (!taken.has(c)) return c;
  }
  // Extrêmement improbable (90 combos tous pris) — dernier recours.
  return randomAccessCode() + Date.now().toString(36).slice(-2);
}

export type HubAccessCheck =
  | { ok: true; propertyId: string; bookingId: string | null }
  | { ok: false; status: 403; code: 'SESSION_REQUIRED' | 'SESSION_INVALID' | 'SESSION_EXPIRED'; message: string }
  | { ok: false; status: 404; code: 'HUB_NOT_FOUND'; message: string };

/**
 * GARDE SERVEUR des actions hub quand le verrouillage est activé.
 * - Verrouillage OFF (défaut) → accès libre (rétrocompatibilité totale
 *   avec les hubs déjà en production).
 * - Verrouillage ON → l'en-tête x-hub-token doit référencer une session
 *   valide NON EXPIRÉE (fin de séjour effective vérifiée EN DIRECT :
 *   un départ tardif validé par l'hôte rallonge la session).
 */
export async function requireHubAccess(
  slug: string,
  req: Request,
  opts?: { propertyId?: string },
): Promise<HubAccessCheck> {
  // ── Résolution du bien (plaque V1 OU hub du bien) ──
  let propertyId = opts?.propertyId ?? null;
  if (!propertyId) {
    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return {
        ok: false,
        status: 404,
        code: 'HUB_NOT_FOUND',
        message: resolved.message,
      };
    }
    propertyId = resolved.propertyId;
  }

  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { id: true, premiumFeatures: true },
  });
  if (!property) {
    return { ok: false, status: 404, code: 'HUB_NOT_FOUND', message: 'Ce hub est introuvable.' };
  }

  const lock = parseHubLock(property.premiumFeatures);
  if (!lock) return { ok: true, propertyId: property.id, bookingId: null };

  const token = req.headers.get('x-hub-token')?.trim();
  if (!token) {
    return {
      ok: false,
      status: 403,
      code: 'SESSION_REQUIRED',
      message: 'Session expirée. Saisissez à nouveau votre code d’accès.',
    };
  }

  const session = await db.hubAccessSession.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: {
      id: true,
      propertyId: true,
      bookingId: true,
      hardExpiresAt: true,
      booking: { select: { id: true, checkOut: true, lateCheckOutUntil: true, status: true } },
    },
  });

  if (!session || session.propertyId !== property.id) {
    return {
      ok: false,
      status: 403,
      code: 'SESSION_INVALID',
      message: 'Session invalide. Saisissez à nouveau votre code d’accès.',
    };
  }

  const now = new Date();
  if (session.hardExpiresAt < now) {
    return {
      ok: false,
      status: 403,
      code: 'SESSION_EXPIRED',
      message: 'Session expirée. Saisissez à nouveau votre code d’accès.',
    };
  }

  if (session.booking) {
    if (session.booking.status === 'CANCELLED') {
      return {
        ok: false,
        status: 403,
        code: 'SESSION_EXPIRED',
        message: 'Ce séjour a été annulé. Contactez votre hôte.',
      };
    }
    // CŒUR DU VERROUILLAGE — heure actuelle > fin de séjour → rejet.
    const end = bookingStayEnd(session.booking);
    if (end < now) {
      return {
        ok: false,
        status: 403,
        code: 'SESSION_EXPIRED',
        message: 'Session expirée. Saisissez à nouveau votre code d’accès.',
      };
    }
  }

  // Trace d'usage (fire-and-forget — jamais bloquant).
  void db.hubAccessSession
    .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return { ok: true, propertyId: property.id, bookingId: session.bookingId };
}
