// =============================================================
// POST /api/admin/emails/retry?id=… — Réessai d'un email
// FAILED/QUEUED de l'outbox (ÉTAPE 22). Un email SENT n'est
// jamais renvoyé (idempotence délivrée par deliverEmail).
//
// v4.163 — POST /api/admin/emails/retry?all=failed : renvoie EN
// MASSE tous les emails FAILED (max 100/clic, plus anciens
// d'abord). Cas d'usage : provider réparé (clé Resend nouvelle
// ou identifiants SMTP corrigés) → on récupère en un clic tous
// les emails bloqués (ex : confirmations état des lieux 535).
// Le retry auto (self-healing v4.98) ne reprend QUE les emails
// à moins de 3 tentatives et moins de 24 h — le bulk couvre le
// reste, sur décision explicite du Superadmin.
//
// ⚠️ Convention sandbox : l'id passe en QUERY PARAM (?id=),
// jamais en segment dynamique.
//
// 🔒 Réservé au Superadmin (role 'superadmin').
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { retryEmail, retryFailedEmails } from '@/lib/email';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';

export async function POST(request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  // FIX-15 — anti-abus : 60 mutations/min par admin (Console Superadmin).
  const mutGuard = await mutationGuard(mutationKey('admin-mut', request, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  try {
    const params = new URL(request.url).searchParams;

    // v4.163 — Renvoi en masse de tous les échecs (?all=failed).
    if (params.get('all') === 'failed') {
      const result = await retryFailedEmails();
      return NextResponse.json({
        ok: true,
        bulk: true,
        total: result.total,
        sent: result.sent,
        failed: result.failed,
        errors: result.errors,
      });
    }

    const id = params.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Paramètre ?id= ou ?all=failed requis' }, { status: 400 });
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
