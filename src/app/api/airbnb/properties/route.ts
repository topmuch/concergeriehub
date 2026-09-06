// =============================================================
// /api/airbnb/properties — ÉTAPE 12 V2 : Gestion multi-propriétés
//
// GET  : Vue "Portfolio" — tous les biens accessibles (possédés +
//        équipe acceptée) avec stats rapides par bien :
//        taux d'occupation 30j, derniers scans, revenus upsell,
//        prochain séjour, QRs, équipe. + plan & invitations.
// POST : Création d'un bien (wizard 3 étapes) — limite de plan
//        appliquée (Solo = 1 bien, Pro = 10, Découverte = 1).
//
// 🔒 Session hôte requise. Les biens dont l'invitation n'est pas
// encore acceptée n'apparaissent PAS dans le portfolio (seulement
// dans `invitations`).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import { hash } from 'bcryptjs';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  countOwnedProperties,
  generateUniquePropertySlug,
  getHostPlanLimits,
  resolveUserMemberships,
} from '@/lib/b2b-server';
import { PROPERTY_TYPE_META } from '@/lib/b2b';
import { ensureDefaultRules } from '@/lib/automations-server';

const DAYS = 30;
const MS_PER_DAY = 86_400_000;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    // Chantier ONBOARD : l'assistant se déclenche tant que false (chargé
    // depuis la base — le token JWT ne porte pas ce champ).
    const sessionUser = await db.user.findUnique({
      where: { id: userId },
      select: { onboardingCompleted: true },
    });

    const now = Date.now();
    const windowStart = new Date(now - DAYS * MS_PER_DAY);

    // ----- Biens possédés + adhésions d'équipe -----
    const [owned, memberships, planLimits, ownedCount] = await Promise.all([
      db.property.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          propertyType: true,
          address: true,
          latitude: true,
          longitude: true,
          isActive: true,
          qrHubSlug: true,
          createdAt: true,
        },
      }),
      resolveUserMemberships(userId),
      getHostPlanLimits(userId),
      countOwnedProperties(userId),
    ]);

    const accepted = memberships.filter((m) => m.acceptedAt != null);
    const invitations = memberships.filter((m) => m.acceptedAt == null);

    // ----- Stats par bien (parallèle) -----
    const ownedStats = await Promise.all(
      owned.map((p) => computePortfolioStats(p.id, windowStart, new Date(now), true)),
    );
    const memberStats = await Promise.all(
      accepted.map((m) => computePortfolioStats(m.property.id, windowStart, new Date(now), false)),
    );

    const ownedPortfolio = owned.map((p, i) => ({
      id: p.id,
      name: p.name,
      propertyType: p.propertyType,
      address: p.address,
      latitude: p.latitude,
      longitude: p.longitude,
      isActive: p.isActive,
      qrHubSlug: p.qrHubSlug,
      createdAt: p.createdAt.toISOString(),
      myRole: 'OWNER' as const,
      isOwner: true,
      stats: ownedStats[i],
    }));

    const ownedIds = new Set(owned.map((p) => p.id));
    const memberPortfolio = accepted
      .filter((m) => !ownedIds.has(m.property.id)) // ÉTAPE 12 : pas de doublon si membre OWNER d'un bien possédé
      .map((m, i) => ({
        id: m.property.id,
        name: m.property.name,
        propertyType: m.property.propertyType,
        address: m.property.address,
        latitude: m.property.latitude,
        longitude: m.property.longitude,
        isActive: true,
        qrHubSlug: m.property.qrHubSlug,
        createdAt: null as string | null,
        myRole: m.role,
        isOwner: false,
        stats: memberStats[i],
      }));

    const properties = [...ownedPortfolio, ...memberPortfolio];

    // ----- Totaux portfolio -----
    const totals = properties.reduce(
      (acc, p) => {
        acc.scans30d += p.stats.scans30d;
        acc.upsellRevenue30d += p.stats.upsellRevenue30d;
        acc.occupationSum += p.stats.occupancyRate;
        acc.qrCount += p.stats.qrCount;
        return acc;
      },
      { scans30d: 0, upsellRevenue30d: 0, occupationSum: 0, qrCount: 0 },
    );

    return NextResponse.json({
      user: {
        firstName: firstNameOf(session.user.name),
        // Chantier ONBOARD : l'assistant se déclenche tant que false.
        onboardingCompleted: sessionUser?.onboardingCompleted ?? true,
      },
      plan: {
        ...planLimits,
        ownedCount,
        canAddProperty: ownedCount < planLimits.maxProperties,
      },
      properties,
      totals: {
        propertiesCount: properties.length,
        scans30d: totals.scans30d,
        upsellRevenue30d: totals.upsellRevenue30d,
        avgOccupancy: properties.length > 0 ? totals.occupationSum / properties.length : 0,
        qrCount: totals.qrCount,
      },
      invitations: invitations.map((inv) => ({
        membershipId: inv.id,
        role: inv.role,
        invitedAt: inv.invitedAt,
        property: {
          id: inv.property.id,
          name: inv.property.name,
          propertyType: inv.property.propertyType,
          address: inv.property.address,
        },
      })),
    });
  } catch (error) {
    console.error('[airbnb/properties GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string } | undefined)?.role;
    const userId = (session?.user as { id?: string } | undefined)?.id;

    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Connexion requise' }, { status: 401 });
    }
    if (role !== 'user') {
      return NextResponse.json(
        { error: 'Réservé aux comptes hôtes' },
        { status: 403 },
      );
    }
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    // Placé après les contrôles d'autorisation (session + rôle).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const body = (await req.json()) as {
      name?: string;
      address?: string;
      propertyType?: string;
      latitude?: number | string | null;
      longitude?: number | string | null;
      hubPin?: string | null;
    };

    // ----- Validations -----
    const name = (body.name ?? '').trim();
    const address = (body.address ?? '').trim();
    const propertyType = (body.propertyType ?? 'AIRBNB').trim();

    if (name.length < 2 || name.length > 80) {
      return NextResponse.json(
        { error: 'Le nom du bien doit contenir entre 2 et 80 caractères.' },
        { status: 400 },
      );
    }
    if (!address) {
      return NextResponse.json({ error: "L'adresse du bien est requise." }, { status: 400 });
    }
    if (!PROPERTY_TYPE_META[propertyType]) {
      return NextResponse.json(
        { error: 'Type de bien invalide.' },
        { status: 400 },
      );
    }

    // Coordonnées optionnelles : absentes = OK (null) ; fournies et invalides = 400
    const latitude = parseCoord(body.latitude, -90, 90);
    const longitude = parseCoord(body.longitude, -180, 180);
    if (latitude === 'invalid' || longitude === 'invalid') {
      return NextResponse.json(
        { error: 'Coordonnées GPS invalides (latitude -90..90, longitude -180..180).' },
        { status: 400 },
      );
    }

    // ----- Limite de plan (justifie l'offre Pro) -----
    const [limits, ownedCount] = await Promise.all([
      getHostPlanLimits(userId),
      countOwnedProperties(userId),
    ]);
    if (ownedCount >= limits.maxProperties) {
      return NextResponse.json(
        {
          error: `Limite du plan ${limits.planName} atteinte (${ownedCount}/${limits.maxProperties} biens).`,
          upgrade: 'airbnb_pro',
          message:
            limits.planId === 'airbnb_solo'
              ? "Passez à l'offre Airbnb Pro (199 €/an) pour gérer jusqu'à 10 biens et une équipe."
              : 'Souscrivez un abonnement pour ajouter plusieurs biens.',
        },
        { status: 403 },
      );
    }

    // ----- PIN Mode Hôte (optionnel, 4 chiffres) -----
    let pinHash: string | null = null;
    if (body.hubPin) {
      const pin = String(body.hubPin);
      if (!/^\d{4}$/.test(pin)) {
        return NextResponse.json(
          { error: 'Le PIN du Mode Hôte doit contenir exactement 4 chiffres.' },
          { status: 400 },
        );
      }
      pinHash = await hash(pin, 10);
    }

    // ----- Création (bien + membre OWNER accepté) -----
    const qrHubSlug = await generateUniquePropertySlug(name);
    const property = await db.$transaction(async (tx) => {
      const created = await tx.property.create({
        data: {
          ownerId: userId,
          name,
          address,
          propertyType,
          latitude,
          longitude,
          qrHubSlug,
          pinHash,
        },
      });
      await tx.propertyMember.create({
        data: {
          propertyId: created.id,
          userId,
          role: 'OWNER',
          acceptedAt: new Date(),
        },
      });
      return created;
    });

    // ÉTAPE 13 : déploie le catalogue d'automatisations sur le bien
    await ensureDefaultRules(property.id);

    return NextResponse.json({ property }, { status: 201 });
  } catch (error) {
    console.error('[airbnb/properties POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// =============================================================
// Helpers
// =============================================================

interface PortfolioStats {
  occupancyRate: number; // 0..1 sur les 30 derniers jours
  bookedNights: number;
  upcomingBookings: number;
  nextBooking: { guestName: string; checkIn: string; checkOut: string } | null;
  scans30d: number;
  lastScanAt: string | null;
  upsellRevenue30d: number;
  upsellOrders30d: number;
  qrCount: number;
  membersCount: number;
  pendingInvites: number;
  unreadGuestMessages: number;
}

/** Stats rapides d'un bien pour la vue Portfolio. */
async function computePortfolioStats(
  propertyId: string,
  windowStart: Date,
  windowEnd: Date,
  isOwner: boolean,
): Promise<PortfolioStats> {
  const windowNights = Math.max(
    1,
    Math.round((windowEnd.getTime() - windowStart.getTime()) / MS_PER_DAY),
  );

  const [bookings, scans30d, lastScan, upsell, qrCount, membersCount, pendingInvites, unread] =
    await Promise.all([
      // Séjours chevauchant la fenêtre (hors annulés) + prochain séjour
      db.booking.findMany({
        where: {
          propertyId,
          status: { not: 'CANCELLED' },
          checkOut: { gt: windowStart },
        },
        orderBy: { checkIn: 'asc' },
        select: { checkIn: true, checkOut: true, guestName: true, status: true },
      }),
      db.scanLog.count({
        where: { propertyId, createdAt: { gte: windowStart } },
      }),
      db.scanLog.findFirst({
        where: { propertyId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      db.serviceRequest.aggregate({
        _sum: { finalPrice: true },
        _count: true,
        where: { propertyId, paidAt: { gte: windowStart, lte: windowEnd } },
      }),
      db.qrCode.count({ where: { propertyId, isActive: true } }),
      db.propertyMember.count({ where: { propertyId, acceptedAt: { not: null } } }),
      isOwner
        ? db.propertyMember.count({ where: { propertyId, acceptedAt: null } })
        : Promise.resolve(0),
      db.voiceMessage.count({
        where: { propertyId, senderType: 'guest', isRead: false },
      }),
    ]);

  // ----- Nuits occupées : somme des chevauchements avec la fenêtre -----
  let bookedNights = 0;
  let upcoming = 0;
  let nextBooking: PortfolioStats['nextBooking'] = null;
  for (const b of bookings) {
    const inStart = Math.max(b.checkIn.getTime(), windowStart.getTime());
    const inEnd = Math.min(b.checkOut.getTime(), windowEnd.getTime());
    if (inEnd > inStart) {
      bookedNights += Math.round((inEnd - inStart) / MS_PER_DAY);
    }
    if (b.checkIn.getTime() >= windowEnd.getTime() && b.status !== 'CANCELLED') {
      upcoming += 1;
      if (!nextBooking) {
        nextBooking = {
          guestName: b.guestName,
          checkIn: b.checkIn.toISOString(),
          checkOut: b.checkOut.toISOString(),
        };
      }
    }
  }

  return {
    occupancyRate: Math.min(1, bookedNights / windowNights),
    bookedNights,
    upcomingBookings: upcoming,
    nextBooking,
    scans30d,
    lastScanAt: lastScan?.createdAt?.toISOString() ?? null,
    upsellRevenue30d: upsell._sum.finalPrice ?? 0,
    upsellOrders30d: upsell._count,
    qrCount,
    membersCount,
    pendingInvites,
    unreadGuestMessages: unread,
  };
}

function parseCoord(
  value: number | string | null | undefined,
  min: number,
  max: number,
): number | 'invalid' | null {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num) || num < min || num > max) return 'invalid';
  return num;
}

function firstNameOf(name?: string | null): string {
  if (!name) return 'Hôte';
  return name.trim().split(/\s+/)[0];
}
