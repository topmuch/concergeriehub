import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  TRANSACTION_STATUSES,
  type TransactionStatus,
} from '@/types/database';

// GET: Get single transaction
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const transaction = await db.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction introuvable' },
        { status: 404 }
      );
    }

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error('[transactions/:id GET] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// PATCH: Update transaction status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body as { status?: string };

    if (!status) {
      return NextResponse.json(
        { error: 'Le champ status est requis' },
        { status: 400 }
      );
    }

    if (!TRANSACTION_STATUSES.includes(status as TransactionStatus)) {
      return NextResponse.json(
        { error: 'Statut invalide. Valeurs autorisées : pending, completed, failed, refunded' },
        { status: 400 }
      );
    }

    const existing = await db.transaction.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Transaction introuvable' },
        { status: 404 }
      );
    }

    const transaction = await db.transaction.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error('[transactions/:id PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

// DELETE: Soft delete (set status='refunded' if was 'completed')
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.transaction.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Transaction introuvable' },
        { status: 404 }
      );
    }

    if (existing.status === 'refunded') {
      return NextResponse.json(
        { error: 'Cette transaction est déjà remboursée' },
        { status: 400 }
      );
    }

    const newStatus = existing.status === 'completed' ? 'refunded' : existing.status;

    const transaction = await db.transaction.update({
      where: { id },
      data: { status: newStatus },
    });

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error('[transactions/:id DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
