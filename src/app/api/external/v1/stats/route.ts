// =============================================================
// /api/external/v1/stats — API publique à clé (Module 7 Sécurité)
// Endpoint consommé par les partenaires avec x-api-key (clé créée
// dans /admin/settings → Sécurité). Vérification réelle du hash,
// lastUsedAt mis à jour, rate limit 30 req/min/clé.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey } from '@/lib/api-keys';
import { rateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const plaintext = req.headers.get('x-api-key');
  const key = await verifyApiKey(plaintext);
  if (!key) {
    return NextResponse.json({ error: 'Clé d\u2019API invalide ou révoquée' }, { status: 401 });
  }

  const allowed = await rateLimit(`apikey:${key.id}`, 30);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit atteint (30 req/min)' }, { status: 429 });
  }

  try {
    const [hosts, properties, providers, ordersPaid] = await Promise.all([
      db.user.count({ where: { role: 'user' } }),
      db.property.count(),
      db.provider.count({ where: { isActive: true } }),
      db.serviceOrder.aggregate({
        where: { paymentStatus: 'PAID' },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
    ]);

    return NextResponse.json({
      data: {
        hosts,
        properties,
        providers,
        ordersPaid: ordersPaid._count._all,
        gmvPaidEur: Math.round((ordersPaid._sum.totalAmount ?? 0) * 100) / 100,
      },
      meta: { keyName: key.name, generatedAt: new Date().toISOString() },
    });
  } catch (error) {
    console.error('[GET /api/external/v1/stats] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
