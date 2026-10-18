// =============================================================
// /api/airbnb/billing/transactions — HISTORIQUE DE PAIEMENTS (audit 4-c)
// Alimente la section « Historique des paiements » de /airbnb/billing.
// 🔒 Session hôte requise ; renvoie UNIQUEMENT les transactions du
// compte (payer OU receiver — l'hôte peut être des deux côtés :
// abonnements payés, commissions/upsells encaissés).
// Lecture seule ; l'ID de paiement Stripe sert uniquement de lien
// vers dashboard.stripe.com quand il existe.
// Never-throw (pattern des routes airbnb).
// =============================================================
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const userId = (session.user as { id: string }).id;

    const transactions = await db.transaction.findMany({
      where: { OR: [{ payerId: userId }, { receiverId: userId }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        amount: true,
        currency: true,
        status: true,
        stripePaymentId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ transactions });
  } catch (error) {
    console.error('[airbnb/billing/transactions GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
