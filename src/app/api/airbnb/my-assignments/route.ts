// =============================================================
// /api/airbnb/my-assignments — ÉTAPE 12 V2 : vues rôle
// Alimente la vue "Mes interventions" des membres d'équipe qui ne
// possèdent aucun bien :
//  - CLEANER     → séjours à venir + statut ménage (par bien)
//  - MAINTENANCE → réclamations techniques ouvertes (par bien)
//  - MANAGER/OWNER → les deux sections (résumé)
// 🔒 Session hôte requise ; seules les adhésions ACCEPTÉES sont
// renvoyées (les invitations en attente passent par le portfolio).
// =============================================================
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveUserMemberships } from '@/lib/b2b-server';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const memberships = (await resolveUserMemberships(userId)).filter(
      (m) => m.acceptedAt != null,
    );
    if (memberships.length === 0) {
      return NextResponse.json({ assignments: [] });
    }

    const now = new Date();

    const assignments = await Promise.all(
      memberships.map(async (m) => {
        const [upcomingBookings, openRequests] = await Promise.all([
          m.role === 'MAINTENANCE'
            ? Promise.resolve([])
            : db.booking.findMany({
                where: {
                  propertyId: m.property.id,
                  status: { not: 'CANCELLED' },
                  checkOut: { gte: now },
                },
                orderBy: { checkIn: 'asc' },
                take: 30,
                select: {
                  id: true,
                  guestName: true,
                  checkIn: true,
                  checkOut: true,
                  guests: true,
                  cleaningStatus: true,
                  status: true,
                },
              }),
          m.role === 'CLEANER'
            ? Promise.resolve([])
            : db.serviceRequest.findMany({
                where: {
                  propertyId: m.property.id,
                  status: { in: ['pending', 'accepted', 'in_progress'] },
                },
                orderBy: { createdAt: 'desc' },
                take: 20,
                select: {
                  id: true,
                  description: true,
                  status: true,
                  urgencyLevel: true,
                  preferredDate: true,
                  createdAt: true,
                  provider: { select: { businessName: true, category: true } },
                },
              }),
        ]);

        return {
          property: m.property,
          role: m.role,
          cleaning: {
            upcoming: upcomingBookings.map((b) => ({
              ...b,
              checkIn: b.checkIn.toISOString(),
              checkOut: b.checkOut.toISOString(),
            })),
          },
          maintenance: {
            open: openRequests.map((r) => ({
              ...r,
              preferredDate: r.preferredDate?.toISOString() ?? null,
              createdAt: r.createdAt.toISOString(),
            })),
          },
        };
      }),
    );

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error('[airbnb/my-assignments GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
