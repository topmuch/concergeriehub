// =============================================================
// /api/admin/emails — Outbox transactionnel (ÉTAPE 22)
//
// GET  : liste paginée des emails + stats (statut global + 24 h).
//        ?status=SENT|FAILED|QUEUED  ?template=…  ?limit=…  ?id=…
//        → avec ?id= : renvoie la ligne complète (htmlBody inclus)
//          pour l'aperçu dans la Console Superadmin.
// POST : non — le retry est dans /api/admin/emails/retry (query
//        param, convention sandbox).
//
// 🔒 Réservé au Superadmin (role 'superadmin').
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const EMAIL_STATUSES = ['QUEUED', 'SENT', 'FAILED'] as const;
type EmailStatus = (typeof EMAIL_STATUSES)[number];

export async function GET(request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // ── Aperçu d'un email (contenu HTML complet) ──
    if (id) {
      const row = await db.emailOutbox.findUnique({ where: { id } });
      if (!row) {
        return NextResponse.json({ error: 'Email introuvable' }, { status: 404 });
      }
      return NextResponse.json({ email: row });
    }

    const statusParam = searchParams.get('status');
    const templateParam = searchParams.get('template');
    const limitRaw = Number(searchParams.get('limit') ?? 50);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);

    const where = {
      ...(statusParam && EMAIL_STATUSES.includes(statusParam as EmailStatus)
        ? { status: statusParam }
        : {}),
      ...(templateParam ? { template: templateParam } : {}),
    };

    const [items, total, sent, failed, queued, sent24h, failed24h] = await Promise.all([
      db.emailOutbox.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          to: true,
          subject: true,
          template: true,
          status: true,
          provider: true,
          attempts: true,
          lastError: true,
          sentAt: true,
          createdAt: true,
          referenceType: true,
          referenceId: true,
          metaJson: true,
        },
      }),
      db.emailOutbox.count(),
      db.emailOutbox.count({ where: { status: 'SENT' } }),
      db.emailOutbox.count({ where: { status: 'FAILED' } }),
      db.emailOutbox.count({ where: { status: 'QUEUED' } }),
      db.emailOutbox.count({ where: { status: 'SENT', createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
      db.emailOutbox.count({ where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    ]);

    const processed24h = sent24h + failed24h;

    return NextResponse.json({
      stats: {
        total,
        sent,
        failed,
        queued,
        sent24h,
        failed24h,
        // Taux de succès sur les emails traités des 24 dernières heures
        successRate24h: processed24h > 0 ? round2((sent24h / processed24h) * 100) : null,
      },
      items,
    });
  } catch (error) {
    console.error('[admin/emails] GET failed:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
