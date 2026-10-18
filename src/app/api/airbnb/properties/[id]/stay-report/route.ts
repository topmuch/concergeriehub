import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam } from '@/lib/team';
import { pickupSlotLabel, laundryServiceLabel } from '@/lib/laundry';

// =============================================================
// v4.54 « JOURNAL DE SÉJOUR » (amélioration 2.1)
// GET /api/airbnb/properties/[id]/stay-report?bookingId=xxx
//
// Agrège TOUTES les données facturables d'un séjour pour le PDF
// « Journal de Séjour » (comptabilité hôte) :
//   • séjour : invité, arrivée, départ, nuits, source ;
//   • minibar : lignes agrégées + total (CheckoutReport) ;
//   • départ tardif : Transaction type 'late_checkout' (Stripe) ;
//   • pressing : LaundryOrder rattachés au séjour (statut + montant) ;
//   • services : ServiceOrder payés du séjour (transferts, shop…) ;
//   • ménage : preuve de rotation horodatée (CheckoutReport).
//
// Sécurité : session OWNER/MANAGER (canManageTeam) + booking
// re-validé par bien (anti IDOR).
// =============================================================

type Ctx = { params: Promise<{ id: string }> };

function parseLines(raw: string): { name: string; emoji: string; qty: number; total: number; free: boolean }[] {
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

function parseServiceItems(items: unknown): { name: string; qty: number }[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i) => ({
      name: String(i.offerName ?? i.name ?? 'Service'),
      qty: Number(i.qty ?? 1),
    }));
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

    const bookingId = req.nextUrl.searchParams.get('bookingId')?.trim().slice(0, 60) ?? '';
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId requis' }, { status: 400 });
    }

    // Booking re-validé par bien (anti IDOR inter-bien).
    const booking = await db.booking.findFirst({
      where: { id: bookingId, propertyId },
      select: {
        id: true,
        guestName: true,
        guestEmail: true,
        checkIn: true,
        checkOut: true,
        guests: true,
        source: true,
        status: true,
        lateCheckoutStatus: true,
        lateCheckOutUntil: true,
      },
    });
    if (!booking) {
      return NextResponse.json({ error: 'Séjour introuvable' }, { status: 404 });
    }

    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { name: true, address: true },
    });

    const nights = Math.max(
      1,
      Math.ceil((booking.checkOut.getTime() - booking.checkIn.getTime()) / 86_400_000),
    );

    // Rapport de fin de séjour (minibar + ménage).
    const report = await db.checkoutReport.findUnique({
      where: { propertyId_bookingId: { propertyId, bookingId } },
    });

    // Départ tardif payé (Transaction Stripe type 'late_checkout').
    const lateCheckoutTx = await db.transaction.findFirst({
      where: { type: 'late_checkout', referenceId: bookingId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { amount: true, currency: true, createdAt: true, stripePaymentId: true },
    });

    // Commandes pressing rattachées au séjour.
    const laundryOrders = await db.laundryOrder.findMany({
      where: { bookingId, propertyId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        serviceType: true,
        pieces: true,
        pickupSlot: true,
        amountEur: true,
        payment: true,
        status: true,
        paidAt: true,
      },
    });

    // Commandes services (transferts, boutique, expériences…) payées.
    const serviceOrders = await db.serviceOrder.findMany({
      where: { bookingId, propertyId, paymentStatus: 'PAID', status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, items: true, totalAmount: true, paidAt: true, createdAt: true },
    });

    // Total des extras facturables (minibar dû + late checkout + pressing
    // réglé + services payés).
    const lateCheckoutAmount = lateCheckoutTx?.amount ?? 0;
    const laundryPaid = laundryOrders
      .filter((o) => o.status === 'PAID')
      .reduce((sum, o) => sum + o.amountEur, 0);
    const servicesTotal = serviceOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const grandTotal =
      (report?.minibarTotal ?? 0) + lateCheckoutAmount + laundryPaid + servicesTotal;

    return NextResponse.json({
      property: {
        name: property?.name ?? '',
        address: property?.address ?? null,
      },
      booking: {
        id: booking.id,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        checkIn: booking.checkIn.toISOString(),
        checkOut: booking.checkOut.toISOString(),
        lateCheckOutUntil: booking.lateCheckOutUntil?.toISOString() ?? null,
        nights,
        guests: booking.guests,
        source: booking.source,
        status: booking.status,
      },
      minibar: {
        lines: parseLines(report?.minibarJson ?? '[]'),
        total: report?.minibarTotal ?? 0,
        checkedAt: report?.minibarCheckedAt?.toISOString() ?? null,
      },
      lateCheckout: {
        status: booking.lateCheckoutStatus,
        amount: lateCheckoutTx?.amount ?? null,
        paidAt: lateCheckoutTx?.createdAt.toISOString() ?? null,
      },
      laundry: laundryOrders.map((o) => ({
        id: o.id,
        label: laundryServiceLabel(o.serviceType),
        pieces: o.pieces,
        pickupSlotLabel: pickupSlotLabel(o.pickupSlot),
        amount: o.amountEur,
        payment: o.payment,
        status: o.status,
      })),
      services: serviceOrders.map((o) => ({
        id: o.id,
        items: parseServiceItems(o.items),
        total: o.totalAmount,
        paidAt: o.paidAt?.toISOString() ?? o.createdAt.toISOString(),
      })),
      cleaning: {
        validatedAt: report?.cleaningValidatedAt?.toISOString() ?? null,
        staffName: report?.cleaningStaffName ?? null,
      },
      totals: {
        minibar: report?.minibarTotal ?? 0,
        lateCheckout: lateCheckoutAmount,
        laundry: laundryPaid,
        services: servicesTotal,
        grandTotal,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[airbnb/properties/[id]/stay-report GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
