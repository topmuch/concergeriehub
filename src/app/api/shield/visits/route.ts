// =============================================================
// /api/shield/visits — BOUCLIER V2 · « Ménage à faire »
// (master prompt client — FLUX B : Création de Séjour).
//
// GET  : liste des séjours planifiés de l'abonnement (A_VENIR,
//        EN_RETARD calculé à la volée) + lien magique cleaner.
// POST : crée UN SÉJOUR = 2 sessions planifiées liées :
//        · CHECK_IN  (scheduledDate = date d'entrée)  → A_VENIR ;
//        · CHECK_OUT (scheduledDate = date de sortie, lié au
//          check-in via linkedSessionId)             → A_VENIR.
//        Chaque session reçoit un publicToken → lien /s/[token]
//        pour l'agent/cleaner (capture photos fantômes + vidéo).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveShieldAccess, shieldPropertyOwned } from '@/lib/shield-access';
import { sessionRef, randomPublicToken } from '@/lib/shield-refs';

export const dynamic = 'force-dynamic';

function bad(error: string, status = 400, message?: string) {
  return NextResponse.json({ error, message }, { status });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+0-9 ().-]{7,20}$/;

/** Statut effectif (EN_RETARD calculé à la volée — zéro cron). */
function effectiveStatus(status: string, scheduledDate: Date | null): string {
  if (status === 'A_VENIR' && scheduledDate && scheduledDate.getTime() < Date.now()) {
    return 'EN_RETARD';
  }
  return status;
}

export async function GET() {
  try {
    const access = await resolveShieldAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
    }

    const visits = await db.shieldSession.findMany({
      where: {
        status: 'A_VENIR',
        property: { subscriptionId: access.subscriptionId },
      },
      orderBy: { scheduledDate: 'asc' },
      take: 100,
      select: {
        id: true,
        type: true,
        status: true, // requis pour calculer le statut effectif (EN_RETARD)
        guestName: true,
        guestEmail: true,
        cleanerPhone: true,
        scheduledDate: true,
        sessionRef: true,
        publicToken: true,
        depositAmount: true,
        createdAt: true,
        linkedSessionId: true,
        property: { select: { id: true, propertyName: true, city: true, propertyAddress: true } },
      },
    });

    return NextResponse.json({
      visits: visits.map((s) => ({
        id: s.id,
        type: s.type,
        guestName: s.guestName,
        guestEmail: s.guestEmail,
        cleanerPhone: s.cleanerPhone,
        scheduledDate: (s.scheduledDate ?? s.createdAt).toISOString(),
        effectiveStatus: effectiveStatus(s.status, s.scheduledDate),
        sessionRef: s.sessionRef,
        publicToken: s.publicToken,
        linkedSessionId: s.linkedSessionId,
        depositAmount: s.depositAmount ?? null,
        property: s.property,
      })),
    });
  } catch (err) {
    console.error('[shield/visits GET] error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await resolveShieldAccess();
    if (!access.ok) {
      return NextResponse.json({ error: access.error, message: access.message }, { status: access.status });
    }

    const body = (await req.json().catch(() => null)) as {
      propertyId?: unknown;
      guestName?: unknown;
      guestEmail?: unknown;
      cleanerPhone?: unknown;
      checkInDate?: unknown;
      checkOutDate?: unknown;
      depositAmount?: unknown;
    } | null;
    if (!body) return bad('corps_invalide');

    // ── Validations (style v5.1 : refus explicites) ──
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId : '';
    if (!propertyId) return bad('logement_manquant', 400, 'Sélectionnez le logement concerné.');

    const property = await shieldPropertyOwned(propertyId, access.subscriptionId);
    if (!property) return bad('logement_inconnu', 404, 'Ce logement ne fait pas partie de votre abonnement.');
    // TASK 39 — bien en délégation : photos de référence pas encore
    // reçues → impossible de créer un séjour (les fantômes d'angle
    // seraient vides). Attendez la réception des photos de l'équipe.
    if (property.onboardingStatus === 'PENDING_PHOTOS') {
      return bad(
        'photos_en_attente',
        409,
        'Les photos de référence de ce logement ne sont pas encore reçues (délégation en cours). Créez le séjour une fois la bibliothèque verrouillée.',
      );
    }

    const guestName = typeof body.guestName === 'string' ? body.guestName.trim().slice(0, 80) : '';
    if (!guestName) return bad('invite_manquant', 400, "Le nom de l'invité est obligatoire.");

    const guestEmailRaw = typeof body.guestEmail === 'string' ? body.guestEmail.trim().slice(0, 160) : '';
    if (guestEmailRaw && !EMAIL_RE.test(guestEmailRaw)) {
      return bad('email_invalide', 400, "L'email de l'invité est invalide.");
    }

    const cleanerPhoneRaw = typeof body.cleanerPhone === 'string' ? body.cleanerPhone.trim().slice(0, 20) : '';
    if (cleanerPhoneRaw && !PHONE_RE.test(cleanerPhoneRaw)) {
      return bad('telephone_invalide', 400, 'Le téléphone du cleaner est invalide.');
    }

    // v4.167 — montant de la caution protégée (€ entier, optionnel).
    let depositAmount: number | null = null;
    if (body.depositAmount !== undefined && body.depositAmount !== null && body.depositAmount !== '') {
      const n = Number(body.depositAmount);
      if (!Number.isFinite(n) || n < 0 || n > 100_000) {
        return bad('caution_invalide', 400, 'Le montant de la caution doit être un nombre entre 0 et 100 000 €.');
      }
      depositAmount = Math.round(n);
    }

    const checkInDate = typeof body.checkInDate === 'string' ? new Date(body.checkInDate) : null;
    const checkOutDate = typeof body.checkOutDate === 'string' ? new Date(body.checkOutDate) : null;
    if (!checkInDate || Number.isNaN(checkInDate.getTime())) {
      return bad('date_checkin_invalide', 400, 'La date de check-in est obligatoire.');
    }
    if (!checkOutDate || Number.isNaN(checkOutDate.getTime())) {
      return bad('date_checkout_invalide', 400, 'La date de check-out est obligatoire.');
    }
    if (checkOutDate.getTime() <= checkInDate.getTime()) {
      return bad('dates_incoherentes', 400, 'La date de check-out doit être postérieure au check-in.');
    }

    // ── Références uniques (séquence = sessions du jour + retry) ──
    const makeRef = async (date: Date): Promise<string> => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const count = await db.shieldSession.count({
          where: {
            createdAt: {
              gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
              lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
            },
          },
        });
        const ref = sessionRef(property.city, date, count + 1 + attempt);
        const clash = await db.shieldSession.findUnique({ where: { sessionRef: ref }, select: { id: true } });
        if (!clash) return ref;
      }
      return sessionRef(property.city, date, Math.floor(Math.random() * 900) + 100);
    };

    const now = new Date();
    const [checkInRef, checkOutRef] = await Promise.all([makeRef(checkInDate), makeRef(checkOutDate)]);

    // ── FLUX B : création des 2 sessions planifiées liées ──
    // v4.167 — BUG « Agent À venir / 0 photos » : les sessions planifiées
    // ne naissent PLUS avec un faux nom d'agent — agentName reste vide
    // jusqu'à la capture du cleaner (qui le renseigne de manière fiable).
    const checkIn = await db.shieldSession.create({
      data: {
        propertyId: property.id,
        type: 'CHECK_IN',
        agentName: '',
        guestName,
        guestEmail: guestEmailRaw || null,
        cleanerPhone: cleanerPhoneRaw || null,
        sessionRef: checkInRef,
        status: 'A_VENIR',
        scheduledDate: checkInDate,
        depositAmount,
        publicToken: randomPublicToken(),
        completedAt: now,
      },
    });

    const checkOut = await db.shieldSession.create({
      data: {
        propertyId: property.id,
        type: 'CHECK_OUT',
        agentName: '',
        guestName,
        guestEmail: guestEmailRaw || null,
        cleanerPhone: cleanerPhoneRaw || null,
        sessionRef: checkOutRef,
        status: 'A_VENIR',
        scheduledDate: checkOutDate,
        depositAmount,
        publicToken: randomPublicToken(),
        linkedSessionId: checkIn.id,
        completedAt: now,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        checkIn: {
          id: checkIn.id,
          sessionRef: checkIn.sessionRef,
          publicToken: checkIn.publicToken,
          scheduledDate: checkInDate.toISOString(),
        },
        checkOut: {
          id: checkOut.id,
          sessionRef: checkOut.sessionRef,
          publicToken: checkOut.publicToken,
          scheduledDate: checkOutDate.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[shield/visits POST] error:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
