import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import {
  generateMissingCheckoutReports,
  type ReportMinibarLine,
  type ReportSignalement,
} from '@/lib/checkout-report';

// =============================================================
// v4.53 « RAPPORT DE CONSOMMATION AUTOMATIQUE AU CHECK-OUT »
// /api/airbnb/properties/[id]/checkout-reports
//
// GET → les rapports de check-out du bien (40 derniers). Au passage,
// la GÉNÉRATION PARESSEUSE crée les rapports manquants des séjours
// dont le compte à rebours est expiré (max 5 par appel) : aucun cron
// requis, l'hôte voit le rapport « net » dès qu'il ouvre son tableau
// de bord après un départ.
// Contrat ligne/JSON : miroir de src/lib/checkout-report.ts.
//
// Sécurité : session OWNER/MANAGER (canManageTeam) — identique aux
// autres routes property-scoped (minibar-ops…).
// =============================================================

type Ctx = { params: Promise<{ id: string }> };

function parseLines(raw: string): ReportMinibarLine[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
      .map((l) => ({
        name: String(l.name ?? ''),
        emoji: String(l.emoji ?? '🍷'),
        qty: Number(l.qty ?? 0),
        total: Number(l.total ?? 0),
        free: l.free === true,
      }))
      .filter((l) => l.qty > 0);
  } catch {
    return [];
  }
}

function parseSignalements(raw: string): ReportSignalement[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map((s) => ({
        category: String(s.category ?? 'OTHER'),
        label: String(s.label ?? 'Autre'),
        description: String(s.description ?? ''),
        isUrgent: s.isUrgent === true,
        status: String(s.status ?? 'OPEN'),
        createdAt: String(s.createdAt ?? ''),
      }));
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id: propertyId } = await ctx.params;
    const myRole = await getUserRoleForProperty(userId, propertyId);
    if (!myRole || !canManageTeam(myRole)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // Génération paresseuse des rapports manquants (compte à rebours
    // expiré) — la liste existante part même si cette étape échoue.
    await generateMissingCheckoutReports(propertyId, 5);

    const reports = await db.checkoutReport.findMany({
      where: { propertyId },
      orderBy: { generatedAt: 'desc' },
      take: 40,
    });

    return NextResponse.json({
      reports: reports.map((r) => ({
        id: r.id,
        bookingId: r.bookingId,
        guestName: r.guestName,
        checkIn: r.checkIn?.toISOString() ?? null,
        checkOut: r.checkOut?.toISOString() ?? null,
        minibar: parseLines(r.minibarJson),
        minibarTotal: r.minibarTotal,
        minibarCheckedAt: r.minibarCheckedAt?.toISOString() ?? null,
        signalements: parseSignalements(r.signalementsJson),
        signalementsCount: r.signalementsCount,
        cleaningValidatedAt: r.cleaningValidatedAt?.toISOString() ?? null,
        cleaningStaffName: r.cleaningStaffName,
        departedAt: r.departedAt?.toISOString() ?? null,
        restockPending: r.restockPending,
        generatedAt: r.generatedAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[airbnb/properties/[id]/checkout-reports GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
