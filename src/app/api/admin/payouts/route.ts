// =============================================================
// /api/admin/payouts — Module 6 : reversements prestataires
//
// GET  : par prestataire → gains réversibles (commandes PAID non
//        encore reversées, hors plaques déjà payoutées via notes),
//        statut Stripe Connect, historique des payouts.
// POST : crée un payout { providerId, amount } :
//        - Stripe Connect actif + charges_enabled → Transfer réel
//          (source = compte plateforme, destination = compte Express)
//        - sinon → payout MANUAL (virement hors plateforme),
//          enregistré en base pour traçabilité.
//        Le payout est limité au montant réversible restant.
// 🔒 Superadmin. Mutations journalisées (audit).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit, clientIp } from '@/lib/audit';
import { getStripe, stripeConnectEnabled } from '@/lib/stripe-connect';
import { getPlatformSettings } from '@/lib/settings';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Gains reversés à date pour un prestataire (payouts PAID). */
async function paidOutTotal(providerId: string): Promise<number> {
  const agg = await db.payout.aggregate({
    where: { providerId, status: 'PAID' },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export async function GET() {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const providers = await db.provider.findMany({
      where: { isActive: true },
      select: {
        id: true,
        businessName: true,
        category: true,
        stripeAccountId: true,
        stripeChargesEnabled: true,
      },
    });

    const orders = await db.serviceOrder.findMany({
      where: { paymentStatus: 'PAID' },
      select: { providerId: true, hostEarning: true },
    });

    // Part prestataire = hostEarning (invariant : total = commission + hostEarning).
    // Le prestataire reçoit cette part une fois la commande payée.
    const earned = new Map<string, number>();
    for (const o of orders) {
      earned.set(o.providerId, (earned.get(o.providerId) ?? 0) + o.hostEarning);
    }

    const payoutHistory = await db.payout.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { provider: { select: { businessName: true } } },
    });

    const rows = await Promise.all(
      providers.map(async (p) => {
        const totalEarned = round2(earned.get(p.id) ?? 0);
        const alreadyPaid = round2(await paidOutTotal(p.id));
        return {
          id: p.id,
          businessName: p.businessName,
          category: p.category,
          stripeChargesEnabled: p.stripeChargesEnabled,
          stripeConnectEnabled,
          earnedEur: totalEarned,
          paidEur: alreadyPaid,
          reversibleEur: round2(Math.max(0, totalEarned - alreadyPaid)),
        };
      }),
    );

    return NextResponse.json({
      providers: rows.sort((a, b) => b.reversibleEur - a.reversibleEur),
      payouts: payoutHistory.map((p) => ({
        id: p.id,
        providerName: p.provider.businessName,
        amount: p.amount,
        status: p.status,
        method: p.method,
        stripeTransferId: p.stripeTransferId,
        ordersCount: p.ordersCount,
        note: p.note,
        createdAt: p.createdAt.toISOString(),
        paidAt: p.paidAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error('[GET /api/admin/payouts] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const body = (await req.json()) as { providerId?: string; amount?: number; note?: string };
    const providerId = String(body.providerId || '');
    const amount = round2(Number(body.amount) || 0);

    const provider = await db.provider.findUnique({
      where: { id: providerId },
      select: { id: true, businessName: true, stripeAccountId: true, stripeChargesEnabled: true },
    });
    if (!provider) {
      return NextResponse.json({ error: 'Prestataire introuvable' }, { status: 404 });
    }

    const settings = await getPlatformSettings();
    if (amount <= 0) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
    }
    if (amount < settings.payoutMinimumEur) {
      return NextResponse.json(
        { error: `Le montant minimum de reversement est de ${settings.payoutMinimumEur} €` },
        { status: 400 },
      );
    }

    // Plafond : jamais plus que le réversible restant
    const orders = await db.serviceOrder.findMany({
      where: { providerId, paymentStatus: 'PAID' },
      select: { hostEarning: true },
    });
    const totalEarned = round2(orders.reduce((s, o) => s + o.hostEarning, 0));
    const alreadyPaid = round2(await paidOutTotal(providerId));
    const reversible = round2(Math.max(0, totalEarned - alreadyPaid));
    if (amount > reversible + 0.001) {
      return NextResponse.json(
        { error: `Montant supérieur au réversible (${reversible.toFixed(2)} €)` },
        { status: 400 },
      );
    }

    // Payout réel : Stripe Connect si disponible, sinon manuel
    let method: 'STRIPE_CONNECT' | 'MANUAL' = 'MANUAL';
    let stripeTransferId: string | null = null;
    if (stripeConnectEnabled && provider.stripeAccountId && provider.stripeChargesEnabled) {
      const stripe = await getStripe();
      if (stripe) {
        try {
          const transfer = await stripe.transfers.create({
            amount: Math.round(amount * 100),
            currency: 'eur',
            destination: provider.stripeAccountId,
            description: `Reversement Conciergerie Hub — ${provider.businessName}`,
          });
          method = 'STRIPE_CONNECT';
          stripeTransferId = transfer.id;
        } catch (err) {
          console.error('[payouts] Stripe transfer failed:', err);
          return NextResponse.json(
            { error: 'Le transfert Stripe a échoué (voir logs). Payout non créé.' },
            { status: 502 },
          );
        }
      }
    }

    const payout = await db.payout.create({
      data: {
        providerId,
        amount,
        status: 'PAID',
        method,
        stripeTransferId,
        ordersCount: orders.length,
        note: body.note?.slice(0, 300) ?? null,
        paidAt: new Date(),
      },
    });

    await logAudit({
      actor: admin,
      action: 'payout.create',
      entityType: 'payout',
      entityId: payout.id,
      details: { provider: provider.businessName, amount, method, stripeTransferId },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({
      ok: true,
      message:
        method === 'STRIPE_CONNECT'
          ? `Transfert Stripe de ${amount.toFixed(2)} € envoyé à ${provider.businessName}`
          : `Reversement manuel de ${amount.toFixed(2)} € enregistré pour ${provider.businessName}`,
      payout: { id: payout.id, method, stripeTransferId },
    });
  } catch (error) {
    console.error('[POST /api/admin/payouts] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
