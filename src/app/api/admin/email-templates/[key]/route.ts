// =============================================================
// /api/admin/email-templates/[key] — un modèle éditable (FIX-12)
//
// GET : charge le modèle complet (htmlBody inclus) pour l'éditeur.
// PUT : met à jour subject / htmlBody / isActive + journal d'audit
//       (action 'email_template.update', visible /admin/logs → Audit).
//
// 🔒 Réservé au Superadmin (pattern lib/admin.ts).
// NB : le HTML est saisi par un Superadmin authentifié (compte de
// confiance) et rendu dans un email — aucune injection tierce possible
// via cette route (validation type/taille stricte malgré tout).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit, clientIp } from '@/lib/audit';
import { extractTemplateVariables } from '@/lib/email-template-defaults';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';

const MAX_SUBJECT = 300;
const MAX_HTML_BODY = 200_000;

/** Clé technique : lettres/chiffres/underscore (contrat de rendu). */
const KEY_RE = /^[a-z0-9_]{1,64}$/;

type RouteContext = { params: Promise<{ key: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  const { key } = await context.params;
  if (!KEY_RE.test(key)) {
    return NextResponse.json({ error: 'Clé invalide' }, { status: 400 });
  }

  try {
    const row = await db.emailTemplate.findUnique({ where: { key } });
    if (!row) {
      return NextResponse.json({ error: 'Modèle introuvable' }, { status: 404 });
    }
    return NextResponse.json({
      template: {
        id: row.id,
        key: row.key,
        subject: row.subject,
        htmlBody: row.htmlBody,
        description: row.description,
        isActive: row.isActive,
        updatedAt: row.updatedAt.toISOString(),
        variables: extractTemplateVariables(row.htmlBody),
      },
    });
  } catch (error) {
    console.error('[admin/email-templates/[key]] GET failed:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  // FIX-15 — anti-abus : 60 mutations/min par admin (Console Superadmin).
  const mutGuard = await mutationGuard(mutationKey('admin-mut', request, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  const { key } = await context.params;
  if (!KEY_RE.test(key)) {
    return NextResponse.json({ error: 'Clé invalide' }, { status: 400 });
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | { subject?: unknown; htmlBody?: unknown; isActive?: unknown }
      | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }

    const data: { subject?: string; htmlBody?: string; isActive?: boolean } = {};
    const changedFields: string[] = [];

    if (body.subject !== undefined) {
      if (typeof body.subject !== 'string' || !body.subject.trim()) {
        return NextResponse.json({ error: 'Le sujet ne peut pas être vide' }, { status: 400 });
      }
      // \r\n neutralisés : le sujet part tel quel dans l'en-tête email.
      data.subject = body.subject.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_SUBJECT);
      changedFields.push('subject');
    }

    if (body.htmlBody !== undefined) {
      if (typeof body.htmlBody !== 'string' || !body.htmlBody.trim()) {
        return NextResponse.json({ error: 'Le corps HTML ne peut pas être vide' }, { status: 400 });
      }
      if (body.htmlBody.length > MAX_HTML_BODY) {
        return NextResponse.json(
          { error: `Corps HTML trop long (max ${MAX_HTML_BODY} caractères)` },
          { status: 400 },
        );
      }
      data.htmlBody = body.htmlBody;
      changedFields.push('htmlBody');
    }

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') {
        return NextResponse.json({ error: 'isActive doit être un booléen' }, { status: 400 });
      }
      data.isActive = body.isActive;
      changedFields.push('isActive');
    }

    if (changedFields.length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
    }

    const existing = await db.emailTemplate.findUnique({ where: { key }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: 'Modèle introuvable' }, { status: 404 });
    }

    const updated = await db.emailTemplate.update({
      where: { key },
      data,
    });

    // Audit (pattern des ~20 call sites /admin/*) — visible /admin/logs.
    await logAudit({
      actor: admin,
      action: 'email_template.update',
      entityType: 'email_template',
      entityId: updated.id,
      details: { key, fields: changedFields, isActive: updated.isActive },
      ip: clientIp(request.headers),
    });

    return NextResponse.json({
      template: {
        id: updated.id,
        key: updated.key,
        subject: updated.subject,
        htmlBody: updated.htmlBody,
        description: updated.description,
        isActive: updated.isActive,
        updatedAt: updated.updatedAt.toISOString(),
        variables: extractTemplateVariables(updated.htmlBody),
      },
    });
  } catch (error) {
    console.error('[admin/email-templates/[key]] PUT failed:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
