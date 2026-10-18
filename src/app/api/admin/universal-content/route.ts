// =============================================================
// /api/admin/universal-content — CONTENU UNIVERSEL (Superadmin)
//
// GET  : renvoie le contenu de référence partagé par toutes les
//        maisons (Guidebook universel + Pack d'appareils).
// PUT  : enregistre les modifications (validation + audit log).
// 🔒 Superadmin. Guards identiques à /api/admin/settings.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import {
  getUniversalContent,
  saveUniversalContent,
  type UniversalContent,
} from '@/lib/universal-content';
import { logAudit, clientIp } from '@/lib/audit';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';

export async function GET() {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const content = await getUniversalContent();
    return NextResponse.json({ ok: true, content });
  } catch (error) {
    console.error('[GET /api/admin/universal-content] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  // FIX-15 — anti-abus : 60 mutations/min par admin.
  const mutGuard = await mutationGuard(mutationKey('admin-mut', req, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  try {
    const body = (await req.json()) as Partial<UniversalContent>;
    const content = await saveUniversalContent(body, admin.email);
    await logAudit({
      actor: admin,
      action: 'universal_content.update',
      entityType: 'setting',
      entityId: 'universal_content',
      details: {
        guidebookTitle: content.guidebook.title,
        guidebookSections: content.guidebook.sections.length,
        appliances: content.appliances.length,
      },
      ip: clientIp(req.headers),
    });
    return NextResponse.json({ ok: true, content, message: 'Contenu universel enregistré' });
  } catch (error) {
    console.error('[PUT /api/admin/universal-content] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
