import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  type TransactionType,
  type TransactionStatus,
} from '@/types/database';

// GET: List transactions
export async function GET(request: NextRequest) {
  try {
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
    if (payerId) where.payerId = payerId;
    if (receiverId) where.receiverId = receiverId;
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
