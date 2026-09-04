// =============================================================
// POST /api/admin/emails/retry?id=… — Réessai d'un email
// FAILED/QUEUED de l'outbox (ÉTAPE 22). Un email SENT n'est
// jamais renvoyé (idempotence délivrée par deliverEmail).
//
// ⚠️ Convention sandbox : l'id passe en QUERY PARAM (?id=),
// jamais en segment dynamique.
//
// 🔒 Réservé au Superadmin (role 'superadmin').
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { retryEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Paramètre ?id= requis' }, { status: 400 });
    }

    const result = await retryEmail(id);
    if (result.notFound) {
      return NextResponse.json({ error: 'Email introuvable' }, { status: 404 });
    }
    if (result.alreadySent) {
      return NextResponse.json({ error: 'Email déjà envoyé', alreadySent: true }, { status: 409 });
    }

    return NextResponse.json({
      ok: result.status === 'SENT',
      status: result.status,
      provider: result.provider ?? null,
      error: result.error ?? null,
    });
  } catch (error) {
    console.error('[admin/emails/retry] POST failed:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
