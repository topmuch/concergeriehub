// =============================================================
// /api/admin/payouts/[id]/resolve — Module 6 Transactions (FIX-13)
//
//   POST /api/admin/payouts/<id>/resolve
//   body { outcome: 'RELEASE' | 'REFUND', note: string }
//
// Résout un litige de reversement (status DISPUTED uniquement) :
//  - 🔒 Superadmin (requireSuperadmin, même garde que /api/admin/*) ;
//  - gardes métier : 404 introuvable, 400 outcome/note invalides,
//    409 si le payout n'est PAS en litige (seul un payout DISPUTED
//    peut être résolu) ;
//  - RELEASE : status='PAID', paidAt=now.
//      · method MANUAL sans stripeTransferId → marqué payé
//        manuellement (même sémantique que le flux existant
//        POST /api/admin/payouts : le superadmin atteste avoir
//        exécuté le virement en dehors de la plateforme) ;
//      · method STRIPE_CONNECT : décision PUREMENT ADMINISTRATIVE —
//        aucune écriture Stripe n'est déclenchée ici. Si un
//        stripeTransferId existe déjà, l'argent est déjà parti ;
//        sinon le transfert reste à exécuter via le flux existant
//        ou le dashboard Stripe (le statut PAID atteste la décision).
//  - REFUND : status='FAILED' → le montant redevient automatiquement
//    réversible pour le prestataire (paidOutTotal / KPIs ne comptent
//    que les payouts PAID).
//  - note de résolution APPEND à la note de litige existante (format
//    canonique FIX-13) :
//      `[RÉSOLUTION <YYYY-MM-DD> RELEASE|REFUND] <note>`
//  - mutation journalisée via logAudit('payout.resolve').
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit, clientIp } from '@/lib/audit';

/** Date ISO courte (YYYY-MM-DD) pour le suffixe de résolution. */
function resolutionDate(date: Date): string {
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

    const body = (await req.json().catch(() => ({}))) as {
      outcome?: unknown;
      note?: unknown;
    };
    const outcome = body.outcome === 'RELEASE' || body.outcome === 'REFUND' ? body.outcome : null;
    if (!outcome) {
      return NextResponse.json(
        { error: "L'issue du litige doit être RELEASE ou REFUND." },
        { status: 400 },
      );
    }
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length < 3) {
      return NextResponse.json(
        { error: 'La note de résolution doit contenir au moins 3 caractères.' },
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
    if (payout.status !== 'DISPUTED') {
      return NextResponse.json(
        { error: 'Seul un reversement en litige (DISPUTED) peut être résolu.' },
        { status: 409 },
      );
    }

    // Format canonique : la résolution APPEND sa ligne à la note de litige.
    const resolvedNote = `${payout.note ?? `[LITIGE ${resolutionDate(new Date())}] (note d'ouverture absente)`}\n[RÉSOLUTION ${resolutionDate(new Date())} ${outcome}] ${note.slice(0, 500)}`;

    // RELEASE → PAID (+ paidAt) ; REFUND → FAILED (redevient réversible).
    const updated = await db.payout.update({
      where: { id: payout.id },
      data:
        outcome === 'RELEASE'
          ? { status: 'PAID', paidAt: new Date(), note: resolvedNote }
          : { status: 'FAILED', note: resolvedNote },
    });

    await logAudit({
      actor: admin,
      action: 'payout.resolve',
      entityType: 'payout',
      entityId: payout.id,
      details: {
        provider: payout.provider.businessName,
        amount: payout.amount,
        method: payout.method,
        outcome,
        // Rappel : RELEASE ne déclenche AUCUNE écriture Stripe (décision
        // administrative) — cf. en-tête de fichier.
        hadStripeTransfer: Boolean(payout.stripeTransferId),
        resolutionNote: note.slice(0, 500),
      },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({
      success: true,
      message:
        outcome === 'RELEASE'
          ? `Litige résolu : reversement de ${payout.amount.toFixed(2)} € marqué payé (${payout.provider.businessName})`
          : `Litige résolu : reversement de ${payout.amount.toFixed(2)} € annulé, montant redevient réversible (${payout.provider.businessName})`,
      payout: {
        id: updated.id,
        status: updated.status,
        paidAt: updated.paidAt?.toISOString() ?? null,
        note: updated.note,
      },
    });
  } catch (error) {
    console.error('[POST /api/admin/payouts/[id]/resolve] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
