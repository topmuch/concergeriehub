// =============================================================
// /api/inspection/create — MODULE STANDALONE « ÉTAT DES LIEUX »
// (v4.107 — offre 299 €/an payée PayPal depuis la page d'accueil)
//
// POST : crée une inspection ENTRÉE ou SORTIE pour le compte de
// l'utilisateur connecté (session obligatoire).
//
// v4.107 — ENTITLEMENT : l'abonnement n'est PLUS créé gratuitement
// pour n'importe quel compte connecté :
//   • abonnement EDL actif (achat standalone OU création antérieure)
//     → accès normal ;
//   • compte Hub (superadmin, propriétaire, membre d'équipe) →
//     accès inclus, abonnement auto-créé à la volée (comportement
//     v4.97 préservé pour les hôtes) ;
//   • tout autre compte → 403 { error:'abonnement_requis',
//     redirect:'/edl/abonnement' } (achat PayPal 299 €/an).
// Les pièces et équipements sont pré-remplis depuis le template
// juridique FR (src/lib/inspection-template.ts).
//
// Réponse 201 : { inspection } avec publicToken + shareUrl.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveOrigin } from '@/lib/site';
import { isHubAccount } from '@/lib/edl-billing';
import {
  INSPECTION_TEMPLATE,
  inspectionShareUrl,
  isInspectionType,
} from '@/lib/inspection-template';
import { sendInspectionCreatedEmails } from '@/lib/inspection-emails';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Garde de session — renvoie l'userId ou null. */
function requireUserId(session: { user?: unknown } | null): string | null {
  const id = (session?.user as { id?: string } | undefined)?.id;
  return session?.user && id ? id : null;
}

/**
 * Résolution d'accès au module (v4.107) :
 *   'sub_active'  → abonnement EDL actif (achat ou création antérieure)
 *   'sub_created' → compte Hub : abonnement créé à la volée (inclus)
 *   'expired'     → abonnement expiré / résilié
 *   'no_access'   → ni abonnement ni compte Hub → achat requis
 */
async function ensureSubscription(
  userId: string,
  role: string | null | undefined,
): Promise<'sub_active' | 'sub_created' | 'expired' | 'no_access'> {
  const now = new Date();
  const sub = await db.inspectionSubscription.findUnique({ where: { userId } });
  if (sub && sub.status === 'active' && sub.endDate >= now) return 'sub_active';

  // Hors abonnement : le module reste INCLUS pour les comptes Hub
  // (superadmin / propriétaire / équipe) — création à la volée.
  if (await isHubAccount(userId, role)) {
    if (!sub) {
      await db.inspectionSubscription.create({
        data: {
          userId,
          status: 'active',
          plan: 'edl_annual',
          endDate: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
        },
      });
      return 'sub_created';
    }
    return 'expired';
  }

  // Compte sans bien, sans équipe, sans abonnement payé → achat EDL.
  return 'no_access';
}

/** Token public de 24 caractères A-Za-z0-9 (alphabet mélangé). */
function randomToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const uuid = crypto.randomUUID().replace(/-/g, '');
  let token = '';
  for (let i = 0; i < 24; i++) {
    const c = alphabet[Math.floor(Math.random() * alphabet.length)];
    token += c ?? uuid[i % uuid.length];
  }
  return token;
}

/** Génère un token dont l'unicité est vérifiée en base. */
async function uniquePublicToken(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomToken();
    const exists = await db.inspection.findUnique({
      where: { publicToken: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  // Probabilité négligeable — dernier recours : suffixe horodaté.
  return `${randomToken().slice(0, 16)}${Date.now().toString(36).slice(-8)}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = requireUserId(session);
    if (!userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const role = (session?.user as { role?: string } | undefined)?.role ?? null;

    // ── Entitlement au module (v4.107) ──
    const access = await ensureSubscription(userId, role);
    if (access === 'no_access') {
      return NextResponse.json(
        {
          error: 'abonnement_requis',
          message: "L'offre États des Lieux (299 €/an, PDF illimités) est requise.",
          redirect: '/edl/abonnement',
        },
        { status: 403 },
      );
    }
    if (access === 'expired') {
      return NextResponse.json(
        { error: 'Votre abonnement au module État des Lieux a expiré.' },
        { status: 403 },
      );
    }
    // access ∈ {sub_active, sub_created} → la ligne existe forcément.
    const subscription = await db.inspectionSubscription.findUniqueOrThrow({
      where: { userId },
    });

    // ── Validation du payload ──
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }

    const str = (key: string): string =>
      typeof body[key] === 'string' ? (body[key] as string).trim() : '';

    const propertyName = str('propertyName');
    const propertyAddress = str('propertyAddress');
    const ownerName = str('ownerName');
    const guestName = str('guestName');
    const guestEmail = str('guestEmail') || undefined;
    const guestPhone = str('guestPhone') || undefined;
    const city = str('city') || undefined; // « Fait à [Ville] » du PDF
    const type = body.type;
    const linkedInspectionId = str('linkedInspectionId') || undefined;

    if (propertyName.length < 1 || propertyName.length > 160) {
      return NextResponse.json(
        { error: 'Le nom du logement est requis (160 caractères maximum).' },
        { status: 400 },
      );
    }
    if (propertyAddress.length < 1 || propertyAddress.length > 300) {
      return NextResponse.json(
        { error: "L'adresse du logement est requise (300 caractères maximum)." },
        { status: 400 },
      );
    }
    if (ownerName.length < 1 || ownerName.length > 120) {
      return NextResponse.json(
        { error: 'Le nom du propriétaire est requis (120 caractères maximum).' },
        { status: 400 },
      );
    }
    if (guestName.length < 1 || guestName.length > 120) {
      return NextResponse.json(
        { error: "Le nom de l'invité est requis (120 caractères maximum)." },
        { status: 400 },
      );
    }
    if (guestEmail && !EMAIL_RE.test(guestEmail)) {
      return NextResponse.json({ error: 'Adresse email de l’invité invalide.' }, { status: 400 });
    }
    if (city && city.length > 120) {
      return NextResponse.json(
        { error: 'La ville est trop longue (120 caractères maximum).' },
        { status: 400 },
      );
    }
    if (!isInspectionType(type)) {
      return NextResponse.json(
        { error: "Le type d'inspection doit être ENTRÉE ou SORTIE." },
        { status: 400 },
      );
    }

    const scheduledRaw = body.scheduledDate;
    const scheduledDate =
      typeof scheduledRaw === 'string' || scheduledRaw instanceof Date
        ? new Date(scheduledRaw)
        : null;
    if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json(
        { error: 'La date visée est requise (format de date valide).' },
        { status: 400 },
      );
    }

    // ── Liaison sortie → entrée (même abonnement, type ENTREE) ──
    if (linkedInspectionId) {
      const linked = await db.inspection.findUnique({
        where: { id: linkedInspectionId },
        select: { subscriptionId: true, type: true },
      });
      if (!linked || linked.subscriptionId !== subscription.id) {
        return NextResponse.json(
          { error: "L'inspection d'entrée à lier est introuvable dans votre module." },
          { status: 400 },
        );
      }
      if (linked.type !== 'ENTREE') {
        return NextResponse.json(
          { error: "Seul un état des lieux d'entrée peut être lié à une sortie." },
          { status: 400 },
        );
      }
    }

    // ── Création (inspection + pièces + équipements du template) ──
    const publicToken = await uniquePublicToken();
    const inspection = await db.inspection.create({
      data: {
        subscriptionId: subscription.id,
        propertyName,
        propertyAddress,
        ownerName,
        guestName,
        guestEmail: guestEmail || null,
        guestPhone: guestPhone || null,
        type,
        scheduledDate,
        status: 'PENDING',
        publicToken,
        city: city ?? null,
        linkedInspectionId: linkedInspectionId ?? null,
        rooms: {
          create: INSPECTION_TEMPLATE.map((room, roomIndex) => ({
            name: room.name,
            sortOrder: roomIndex,
            items: {
              create: room.items.map((item, itemIndex) => ({
                name: item.name,
                state: 'BON',
                sortOrder: itemIndex,
              })),
            },
          })),
        },
      },
      include: {
        rooms: { orderBy: { sortOrder: 'asc' }, include: { _count: { select: { items: true } } } },
      },
    });

    // v4.103 — Emails de confirmation : INVITÉ (invitation à compléter)
    // + HÔTE (confirmation de création). Fire-and-forget : la file
    // EmailOutbox journalise puis tente le SMTP — un échec email ne
    // casse jamais la création (jamais levant).
    void db.user
      .findUnique({ where: { id: userId }, select: { email: true } })
      .then((host) =>
        sendInspectionCreatedEmails(
          {
            propertyName: inspection.propertyName,
            propertyAddress: inspection.propertyAddress,
            ownerName: inspection.ownerName,
            guestName: inspection.guestName,
            guestEmail: inspection.guestEmail,
            type: inspection.type,
            scheduledDate: inspection.scheduledDate,
            publicToken: inspection.publicToken,
            subscriptionId: inspection.subscriptionId,
          },
          host?.email ?? '',
        ),
      )
      .catch(() => undefined);

    return NextResponse.json(
      {
        inspection: {
          id: inspection.id,
          propertyName: inspection.propertyName,
          propertyAddress: inspection.propertyAddress,
          ownerName: inspection.ownerName,
          guestName: inspection.guestName,
          guestEmail: inspection.guestEmail,
          guestPhone: inspection.guestPhone,
          city: inspection.city,
          type: inspection.type,
          scheduledDate: inspection.scheduledDate.toISOString(),
          status: inspection.status,
          publicToken: inspection.publicToken,
          shareUrl: inspectionShareUrl(inspection.publicToken, resolveOrigin(req)),
          linkedInspectionId: inspection.linkedInspectionId,
          createdAt: inspection.createdAt.toISOString(),
          rooms: inspection.rooms.map((r) => ({
            id: r.id,
            name: r.name,
            itemCount: r._count.items,
          })),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[inspection/create POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
