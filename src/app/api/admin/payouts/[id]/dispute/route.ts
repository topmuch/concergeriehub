// =============================================================
// /api/admin/payouts/[id]/dispute — Module 6 Transactions (FIX-13)
//
//   POST /api/admin/payouts/<id>/dispute    body { reason: string }
//
// Ouvre un litige sur un reversement prestataire :
//  - 🔒 Superadmin (requireSuperadmin, même garde que /api/admin/*) ;
//  - gardes métier : 404 introuvable, 400 raison < 10 caractères,
//    409 si le payout est déjà PAID (un reversement déjà payé ne
//    s'ouvre pas en litige) ou déjà DISPUTED ;
//  - transfert Stripe déjà existant (stripeTransferId) : l'argent est
//    DÉJÀ parti du compte plateforme → le litige est PUREMENT
//    ADMINISTRATIF : aucune écriture Stripe n'est déclenchée ici
//    (ni reversal, ni clawback — à traiter manuellement dans le
//    dashboard Stripe si nécessaire). Le statut DISPUTED trace le
//    blocage de la décision et l'échange avec le prestataire ;
//  - note de litige (format canonique FIX-13, à lire partout) :
//      `[LITIGE <YYYY-MM-DD>] <raison>`   (date ISO du jour)
//    toute note d'origine est conservée sur une seconde ligne
//    `[Note d'origine] …`. La route resolve APPEND sa propre ligne
//    `[RÉSOLUTION <YYYY-MM-DD> RELEASE|REFUND] <note>` ;
//  - mutation journalisée via logAudit('payout.dispute').
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit, clientIp } from '@/lib/audit';

/** Date ISO courte (YYYY-MM-DD) pour le préfixe de note litige. */
function disputeDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { id } = await params;
    const payoutId = (id || '').trim();

    const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 10) {
      return NextResponse.json(
        { error: 'La raison du litige doit contenir au moins 10 caractères.' },
        { status: 400 },
      );
    }

    const payout = await db.payout.findUnique({
      where: { id: payoutId },
      select: {
        id: true,
        amount: true,
        status: true,
        method: true,
        stripeTransferId: true,
        note: true,
        provider: { select: { businessName: true } },
      },
    });
    if (!payout) {
      return NextResponse.json({ error: 'Reversement introuvable' }, { status: 404 });
    }
    if (payout.status === 'PAID') {
      return NextResponse.json(
        { error: 'Un reversement déjà payé ne peut pas être ouvert en litige.' },
        { status: 409 },
      );
    }
    if (payout.status === 'DISPUTED') {
      return NextResponse.json(
        { error: 'Ce reversement est déjà en litige.' },
        { status: 409 },
      );
    }

    // Format canonique de la note litige (cf. en-tête de fichier).
    const litigeNote = `[LITIGE ${disputeDate(new Date())}] ${reason.slice(0, 500)}${
      payout.note ? `\n[Note d'origine] ${payout.note}` : ''
    }`;

    const updated = await db.payout.update({
      where: { id: payout.id },
      data: { status: 'DISPUTED', note: litigeNote },
    });

    await logAudit({
      actor: admin,
      action: 'payout.dispute',
      entityType: 'payout',
      entityId: payout.id,
      details: {
        provider: payout.provider.businessName,
        amount: payout.amount,
        method: payout.method,
        // Litige purement administratif si l'argent est déjà parti via Stripe.
        hadStripeTransfer: Boolean(payout.stripeTransferId),
        reason: reason.slice(0, 500),
      },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({
      success: true,
      message: `Litige ouvert sur le reversement de ${payout.amount.toFixed(2)} € (${payout.provider.businessName})`,
      payout: {
        id: updated.id,
        status: updated.status,
        note: updated.note,
      },
    });
  } catch (error) {
    console.error('[POST /api/admin/payouts/[id]/dispute] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
