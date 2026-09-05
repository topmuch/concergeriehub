// =============================================================
// /api/admin/users/[id] — Module 2 Gestion Clients : actions
//
// PATCH ?action=… :
//   - toggle-active       : activer / désactiver le compte
//   - change-plan         : selectedPlan = body.plan (et sync abonnement)
//   - change-role         : role = body.role ('user' | 'superadmin')
//   - reset-password      : génère un mot de passe temporaire réel
//                           (hash bcrypt en base + renvoyé UNE fois,
//                           email de notification mis en outbox)
// DELETE : suppression définitive du compte (confirmation côté UI).
//
// Toutes les actions sont journalisées dans audit_logs.
// 🔒 Superadmin.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit, clientIp } from '@/lib/audit';
import { queueEmail } from '@/lib/email';
import { adminPasswordResetEmail } from '@/lib/email-templates';

const VALID_PLANS = ['airbnb_solo', 'airbnb_pro', 'agency', 'free'];

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { id } = await params;
    const action = req.nextUrl.searchParams.get('action');
    const body = (await req.json().catch(() => ({}))) as { plan?: string; role?: string };

    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, email: true, fullName: true, role: true, isActive: true, selectedPlan: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }
    if (user.id === admin.id && (action === 'toggle-active' || action === 'change-role' || undefined)) {
      if (action !== 'change-plan') {
        return NextResponse.json(
          { error: 'Impossible de modifier son propre compte (verrou de sécurité)' },
          { status: 400 },
        );
      }
    }

    let message = '';
    const details: Record<string, unknown> = {};

    if (action === 'toggle-active') {
      const next = !user.isActive;
      await db.user.update({ where: { id }, data: { isActive: next } });
      message = next ? 'Compte activé' : 'Compte désactivé';
      details.isActive = next;
    } else if (action === 'change-plan') {
      const plan = String(body.plan || '');
      if (!VALID_PLANS.includes(plan)) {
        return NextResponse.json(
          { error: `Plan invalide (${VALID_PLANS.join(', ')})` },
          { status: 400 },
        );
      }
      await db.user.update({ where: { id }, data: { selectedPlan: plan } });

      // Synchronisation du seul abonnement actif de l'hôte (s'il existe)
      const activeSub = await db.subscription.findFirst({
        where: { userId: id, status: 'active' },
        orderBy: { createdAt: 'desc' },
      });
      if (activeSub && activeSub.plan !== plan) {
        await db.subscription.update({
          where: { id: activeSub.id },
          data: { plan, status: 'cancelled' },
        });
        details.subscriptionCancelled = activeSub.id;
      }
      message = `Plan changé → ${plan}`;
      details.plan = plan;
    } else if (action === 'change-role') {
      const role = String(body.role || '');
      if (!['user', 'superadmin'].includes(role)) {
        return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 });
      }
      if (user.id === admin.id && role !== 'superadmin') {
        return NextResponse.json(
          { error: 'Impossible de retirer son propre rôle Superadmin' },
          { status: 400 },
        );
      }
      await db.user.update({ where: { id }, data: { role } });
      message = `Rôle changé → ${role}`;
      details.role = role;
    } else if (action === 'reset-password') {
      const tempPassword = randomPassword();
      const passwordHash = await hash(tempPassword, 10);
      await db.user.update({ where: { id }, data: { passwordHash } });

      // Notification réelle via l'outbox (consultable dans /admin/emails)
      try {
        const template = adminPasswordResetEmail(user.email, tempPassword, admin.name ?? admin.email);
        await queueEmail({ to: user.email, subject: template.subject, html: template.html, template: 'custom' });
      } catch (e) {
        console.error('[users/[id]] outbox reset email:', e);
      }

      message = 'Mot de passe réinitialisé';
      details.tempPasswordLength = tempPassword.length;
      // Le mot de passe en clair est renvoyé UNE fois au Superadmin
      await logAudit({
        actor: admin,
        action: 'user.reset_password',
        entityType: 'user',
        entityId: id,
        details: { email: user.email, notified: true },
        ip: clientIp(req.headers),
      });
      return NextResponse.json({ ok: true, message, tempPassword });
    } else {
      return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }

    await logAudit({
      actor: admin,
      action: `user.${action.replace('-', '_')}`,
      entityType: 'user',
      entityId: id,
      details: { email: user.email, ...details },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({ ok: true, message });
  } catch (error) {
    console.error('[PATCH /api/admin/users/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { id } = await params;
    if (id === admin.id) {
      return NextResponse.json(
        { error: 'Impossible de supprimer son propre compte' },
        { status: 400 },
      );
    }
    const user = await db.user.findUnique({
      where: { id },
      select: { email: true, role: true, ownedProperties: { select: { id: true } } },
    });
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }
    if (user.ownedProperties.length > 0) {
      return NextResponse.json(
        {
          error: `Ce compte possède ${user.ownedProperties.length} bien(s). Réassignez ou supprimez les biens avant suppression.`,
        },
        { status: 409 },
      );
    }

    await db.user.delete({ where: { id } });
    await logAudit({
      actor: admin,
      action: 'user.delete',
      entityType: 'user',
      entityId: id,
      details: { email: user.email, role: user.role },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({ ok: true, message: 'Compte supprimé' });
  } catch (error) {
    console.error('[DELETE /api/admin/users/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur (dépendances du compte)' }, { status: 500 });
  }
}
