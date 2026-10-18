import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  type TransactionType,
  type TransactionStatus,
} from '@/types/database';

// GET: List transactions — chaque utilisateur ne voit que les siennes (payées ou reçues), Superadmin = tout
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    const role = (session.user as { role?: string }).role;
    const isSuperadmin = role === 'superadmin';

    const { searchParams } = new URL(request.url);
    const payerId = searchParams.get('payerId');
    const receiverId = searchParams.get('receiverId');
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (type && !TRANSACTION_TYPES.includes(type as TransactionType)) {
      return NextResponse.json(
        { error: 'Type invalide. Valeurs autorisées : flash_sale, commission, subscription, redemption' },
        { status: 400 }
      );
    }

    if (status && !TRANSACTION_STATUSES.includes(status as TransactionStatus)) {
      return NextResponse.json(
        { error: 'Statut invalide. Valeurs autorisées : pending, completed, failed, refunded' },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = {};
    if (isSuperadmin) {
      // Superadmin : vue plateforme complète (filtres optionnels)
      if (payerId) where.payerId = payerId;
      if (receiverId) where.receiverId = receiverId;
    } else {
      // Scoping strict : payées OU reçues par l'utilisateur connecté
      // (receiverId peut être un stripeAccountId 'acct_...' pour les commandes
      // service — hors scope naturel de ce filtre, ce qui est attendu)
      where.OR = [{ payerId: userId }, { receiverId: userId }];
    }
    if (type) where.type = type;
    if (status) where.status = status;

    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100),
        skip: offset,
      }),
      db.transaction.count({ where }),
    ]);

    return NextResponse.json({ transactions, total, limit, offset });
  } catch (error) {
    console.error('[transactions GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// POST: Create a transaction record
export async function POST(request: NextRequest) {
  // Sécurité (Module 7) : mutation réservée au Superadmin.
  const __admin = await requireSuperadmin();
  if (!__admin) return adminUnauthorized();
  try {
    const body = await request.json();
    const {
      type,
      payerId,
      receiverId,
      amount,
      currency,
      status,
      referenceId,
    } = body as {
      type: string;
      payerId?: string;
      receiverId?: string;
      amount: number;
      currency?: string;
      status?: string;
      referenceId?: string;
    };

    if (!type || amount === undefined) {
      return NextResponse.json(
        { error: 'Les champs type et amount sont requis' },
        { status: 400 }
      );
    }

    if (!TRANSACTION_TYPES.includes(type as TransactionType)) {
      return NextResponse.json(
        { error: 'Type invalide. Valeurs autorisées : flash_sale, commission, subscription, redemption' },
        { status: 400 }
      );
    }

    if (status && !TRANSACTION_STATUSES.includes(status as TransactionStatus)) {
      return NextResponse.json(
        { error: 'Statut invalide. Valeurs autorisées : pending, completed, failed, refunded' },
        { status: 400 }
      );
    }

    const transaction = await db.transaction.create({
      data: {
        type,
        payerId: payerId ?? null,
        receiverId: receiverId ?? null,
        amount,
        currency: currency || 'EUR',
        status: status || 'pending',
        referenceId: referenceId ?? null,
      },
    });

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    console.error('[transactions POST] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
