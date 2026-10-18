// =============================================================
// /api/admin/email-templates — Modèles d'emails éditables (FIX-12)
//
// GET  : liste des modèles (key, sujet, actif, updatedAt, variables
//        {{…}} réellement présentes dans le corps). Le corps HTML
//        complet est chargé via GET /api/admin/email-templates/[key].
// POST : non — création interdite (les modèles sont seedés par
//        scripts/seed-email-templates.ts, clé = contrat de rendu).
//
// 🔒 Réservé au Superadmin (pattern lib/admin.ts).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { extractTemplateVariables } from '@/lib/email-template-defaults';

export async function GET(_request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const rows = await db.emailTemplate.findMany({
      orderBy: { key: 'asc' },
      select: {
        id: true,
        key: true,
        subject: true,
        description: true,
        isActive: true,
        htmlBody: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      items: rows.map((row) => ({
        id: row.id,
        key: row.key,
        subject: row.subject,
        description: row.description,
        isActive: row.isActive,
        updatedAt: row.updatedAt.toISOString(),
        // Variables réelles du template (jetons {{…}} du corps).
        variables: extractTemplateVariables(row.htmlBody),
      })),
    });
  } catch (error) {
    console.error('[admin/email-templates] GET failed:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
