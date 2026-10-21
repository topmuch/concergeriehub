import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// =============================================================
// PWA (Task 42-a) — Vérification PUBLIQUE d'un logement
//
// Cible des QR codes des badges marketing : quelqu'un scanne le
// badge à l'entrée d'un logement → la page /verify/[propertyId]
// affiche le statut de vérification (nom du logement, type,
// suivi Bouclier : référence d'onboarding, abonnement actif,
// derniers contrôles photo/vidéo).
//
// IDENTITÉ : la QR encode l'ID du logement du dashboard hôte
// (model Property). Le suivi Bouclier est dérivé de l'abonnement
// du propriétaire (InspectionSubscription.userId unique → 1 fiche
// ShieldProperty). Un logement sans Bouclier reste vérifiable
// (déclaré) mais sans contrôles.
//
// CONFIDENTIALITÉ : aucune donnée sensible ne quitte le serveur —
// ni email, ni téléphone, ni adresse exacte, ni nom du propriétaire.
// Seuls les champs publics listés dans la réponse sont renvoyés.
// Réponse no-store (état toujours frais) ; 404 JSON si id inconnu.
// =============================================================

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;

  if (!propertyId || propertyId.length > 64) {
    return NextResponse.json({ found: false }, { status: 404, headers: NO_STORE });
  }

  try {
    // 1) Identité primaire : le logement du dashboard hôte.
    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { name: true, propertyType: true, isActive: true, ownerId: true, createdAt: true },
    });

    if (!property || !property.isActive) {
      return NextResponse.json({ found: false }, { status: 404, headers: NO_STORE });
    }

    // 2) Enrichissement Bouclier via l'abonnement du propriétaire.
    const subscription = await db.inspectionSubscription.findUnique({
      where: { userId: property.ownerId },
      select: { id: true, status: true, endDate: true },
    });

    let shield: {
      active: boolean;
      subscriptionStatus: string;
      onboardingRef: string;
      onboardingStatus: string;
      onboardedAt: string;
      city: string;
      lastSessions: { type: string; status: string; completedAt: string }[];
    } | null = null;

    if (subscription) {
      const shieldProperty = await db.shieldProperty.findFirst({
        where: { subscriptionId: subscription.id },
        select: {
          id: true,
          propertyName: true,
          city: true,
          onboardingRef: true,
          onboardingStatus: true,
          onboardedAt: true,
        },
      });

      if (shieldProperty) {
        const lastSessions = await db.shieldSession.findMany({
          where: { propertyId: shieldProperty.id },
          orderBy: { completedAt: 'desc' },
          take: 3,
          select: { type: true, status: true, completedAt: true },
        });

        shield = {
          active:
            subscription.status === 'active' && subscription.endDate.getTime() > Date.now(),
          subscriptionStatus: subscription.status,
          onboardingRef: shieldProperty.onboardingRef,
          onboardingStatus: shieldProperty.onboardingStatus,
          onboardedAt: shieldProperty.onboardedAt.toISOString(),
          city: shieldProperty.city,
          lastSessions: lastSessions.map((session) => ({
            type: session.type,
            status: session.status,
            completedAt: session.completedAt.toISOString(),
          })),
        };
      }
    }

    return NextResponse.json(
      {
        found: true,
        propertyName: property.name,
        propertyType: property.propertyType,
        createdAt: property.createdAt.toISOString(),
        shield,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error('[public/verify] erreur de lecture :', error);
    return NextResponse.json(
      { found: false, error: 'server_error' },
      { status: 500, headers: NO_STORE },
    );
  }
}
