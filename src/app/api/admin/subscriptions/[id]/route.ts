// =============================================================
// /api/admin/subscriptions/[id] — Module 4 : actions abonnement
//
// PATCH ?action=cancel   → status 'cancelled' (fin de période non
//                          forcée : arrêt administratif immédiat)
// PATCH ?action=reactivate → status 'active'
// PATCH ?action=mark-paid  → status 'active' (régularisation impayé)
// PATCH ?action=edit       → v4.71 ÉDITION COMPLÈTE (body JSON) :
//   { plan?: 'airbnb_solo'|'airbnb_pro'|'custom', billingCycle?,
//     amount?, maxProperties?, status? } — changement de plan avec
//     RECALCUL IMMÉDIAT du prix (HOST_PLANS) et des biens inclus.
//
// Chaque action est journalisée (audit). Sans clé Stripe, les
// changements restent locaux (source de vérité = base + webhook
// Stripe mettra à jour à la prochaine synchronisation).
// 🔒 Superadmin.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit, clientIp } from '@/lib/audit';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';
import { HOST_PLANS } from '@/lib/billing';
import { queueEmail } from '@/lib/email';

// v4.71 — schéma d'édition d'un abonnement (superadmin).
const editSchema = z.object({
  plan: z.enum(['airbnb_solo', 'airbnb_pro', 'custom']).optional(),
  billingCycle: z.enum(['monthly', 'annual']).optional(),
  amount: z.number().min(0).max(100_000).optional(),
  maxProperties: z.number().int().min(1).max(1000).optional(),
  status: z.enum(['active', 'past_due', 'cancelled', 'trialing']).optional(),
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// v4.73 — libellés FR pour l'email de confirmation d'édition.
const SUB_STATUS_LABEL: Record<string, string> = {
  active: 'Actif',
  past_due: 'Impayé',
  cancelled: 'Annulé',
  trialing: 'Période d\'essai',
};

/** Email à l'hôte après modification de son abonnement par le superadmin. */
function subscriptionEditEmailHtml(opts: {
  hostName: string | null;
  planLabel: string;
  amount: number;
  billingCycle: string;
  statusLabel: string;
  maxProperties: number | null;
}): string {
  const cycle = opts.billingCycle === 'monthly' ? 'par mois' : 'par an';
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 12px;color:#64748B;font-size:13px;border-bottom:1px solid #E2E8F0;">${label}</td><td style="padding:8px 12px;color:#0F172A;font-size:13px;font-weight:bold;border-bottom:1px solid #E2E8F0;text-align:right;">${value}</td></tr>`;
  return `
<div style="font-family:Tahoma,Segoe UI,sans-serif;max-width:560px;margin:0 auto;background:#F8FAFC;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;">
  <div style="background:linear-gradient(93deg,#04467a,#055492);padding:24px 28px;color:#fff;">
    <p style="margin:0;font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:.85;">RoomScan</p>
    <h1 style="margin:6px 0 0;font-size:20px;">🔄 Votre abonnement a été mis à jour</h1>
  </div>
  <div style="padding:24px 28px;">
    <p style="margin:0 0 14px;font-size:14px;color:#0F172A;line-height:1.6;">
      Bonjour ${opts.hostName ?? ''},<br/>
      l'équipe RoomScan a ajusté votre abonnement. Voici le récapitulatif de votre nouvelle formule :
    </p>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;border:1px solid #E2E8F0;">
      ${row('Formule', opts.planLabel)}
      ${row('Tarif', `${opts.amount.toFixed(2).replace('.', ',')} € ${cycle}`)}
      ${row('Biens inclus', opts.maxProperties != null ? String(opts.maxProperties) : '—')}
      ${row('Statut', opts.statusLabel)}
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#64748B;line-height:1.6;">
      Aucune action de votre part n'est nécessaire. Une question sur votre abonnement ? Répondez simplement à cet email.
    </p>
    <p style="margin:20px 0 0;font-size:12px;color:#94A3B8;">L'équipe RoomScan — l'expérience 5 étoiles pour vos invités</p>
  </div>
</div>`;
}

/** Envoi (fire-and-forget) de l'email d'édition d'abonnement à l'hôte. */
async function notifyHostSubscriptionEdit(subId: string, userId: string, data: Record<string, unknown>, before: { plan: string; amount: number; billingCycle: string; status: string }) {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true },
    });
    if (!user?.email) return;
    const planId = (data.plan as string) ?? before.plan;
    const planLabel = HOST_PLANS.find((p) => p.id === planId)?.name ?? planId;
    const amount = typeof data.amount === 'number' ? data.amount : before.amount;
    const cycle = (data.billingCycle as string) ?? before.billingCycle;
    const status = (data.status as string) ?? before.status;
    const maxProperties = typeof data.maxProperties === 'number' ? data.maxProperties : null;
    const changed: string[] = [];
    if (planLabel !== before.plan) changed.push('formule');
    if (amount !== before.amount) changed.push('tarif');
    if (cycle !== before.billingCycle) changed.push('périodicité');
    if (status !== before.status) changed.push('statut');
    await queueEmail({
      to: user.email,
      subject: `🔄 Votre abonnement RoomScan a été mis à jour${changed.length ? ` (${changed.join(', ')})` : ''}`,
      html: subscriptionEditEmailHtml({
        hostName: user.fullName,
        planLabel,
        amount,
        billingCycle: cycle,
        statusLabel: SUB_STATUS_LABEL[status] ?? status,
        maxProperties,
      }),
      text: `Votre abonnement RoomScan a été mis à jour : ${planLabel} — ${amount.toFixed(2)} € ${cycle === 'monthly' ? '/mois' : '/an'} (${SUB_STATUS_LABEL[status] ?? status}).`,
      template: 'custom',
      userId,
      referenceType: 'subscription',
      referenceId: subId,
      meta: { kind: 'subscription_edited', plan: planId, amount, cycle, status },
    });
  } catch (error) {
    // L'email ne doit JAMAIS faire échouer l'édition.
    console.error('[subscription edit] host email failed:', error);
  }
}

const ACTIONS = {
  cancel: { status: 'cancelled' },
  reactivate: { status: 'active' },
  'mark-paid': { status: 'active' },
} as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  // FIX-15 — anti-abus : 60 mutations/min par admin (Console Superadmin).
  const mutGuard = await mutationGuard(mutationKey('admin-mut', req, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard;

  try {
    const { id } = await params;
    const action = req.nextUrl.searchParams.get('action') ?? '';

    // ── v4.71 — ÉDITION COMPLÈTE (plan / cycle / montant / statut) ──
    if (action === 'edit') {
      const body = (await req.json().catch(() => null)) as unknown;
      const parsed = editSchema.safeParse(body ?? {});
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Formulaire invalide — vérifiez plan, cycle, montant et statut.' },
          { status: 400 },
        );
      }
      const d = parsed.data;
      const sub = await db.subscription.findUnique({
        where: { id },
        // v4.73 — userId récupéré pour notifier l'hôte par email.
        select: { id: true, plan: true, status: true, amount: true, billingCycle: true, maxProperties: true, userId: true },
      });
      if (!sub) {
        return NextResponse.json({ error: 'Abonnement introuvable' }, { status: 404 });
      }

      const data: Record<string, unknown> = {};
      if (d.plan && d.plan !== 'custom') {
        const hp = HOST_PLANS.find((p) => p.id === d.plan);
        if (hp) {
          data.plan = hp.id;
          data.maxProperties = hp.maxProperties;
          const cycle = d.billingCycle ?? (sub.billingCycle as 'monthly' | 'annual');
          const price = hp.prices[cycle] ?? hp.prices.annual; // Pro : mensuel absent → annual
          data.billingCycle = hp.prices[cycle] != null ? cycle : 'annual';
          data.amount = price;
        }
      } else {
        // Édition libre (plan conservé ou « custom ») : on applique les
        // champs fournis sans recalcul forcé.
        if (d.plan === 'custom') data.plan = sub.plan; // plan inchangé, édition manuelle
        if (d.billingCycle) data.billingCycle = d.billingCycle;
        if (d.amount != null) data.amount = round2(d.amount);
        if (d.maxProperties != null) data.maxProperties = d.maxProperties;
      }
      if (d.status) data.status = d.status;

      if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: 'Aucune modification fournie.' }, { status: 400 });
      }

      await db.subscription.update({ where: { id }, data });
      // v4.73 — notification par EMAIL à l'hôte après chaque édition
      // (plan / tarif / statut / biens inclus) — demandé par le client.
      if (sub.userId) {
        await notifyHostSubscriptionEdit(id, sub.userId, data, {
          plan: sub.plan,
          amount: sub.amount,
          billingCycle: sub.billingCycle,
          status: sub.status,
        });
      }
      await logAudit({
        actor: admin,
        action: 'subscription.edit',
        entityType: 'subscription',
        entityId: id,
        details: {
          plan: (data.plan as string) ?? sub.plan,
          from: { plan: sub.plan, amount: sub.amount, cycle: sub.billingCycle, status: sub.status, max: sub.maxProperties },
          to: data,
        },
        ip: clientIp(req.headers),
      });

      return NextResponse.json({ ok: true, message: 'Abonnement mis à jour ✓' });
    }

    const mapping = (ACTIONS as Record<string, { status: string }>)[action];
    if (!mapping) {
      return NextResponse.json(
        { error: 'Action inconnue (cancel | reactivate | mark-paid | edit)' },
        { status: 400 },
      );
    }

    const sub = await db.subscription.findUnique({
      where: { id },
      select: { id: true, plan: true, status: true, userId: true, subscriberId: true },
    });
    if (!sub) {
      return NextResponse.json({ error: 'Abonnement introuvable' }, { status: 404 });
    }

    await db.subscription.update({ where: { id }, data: { status: mapping.status } });
    await logAudit({
      actor: admin,
      action: `subscription.${action.replace('-', '_')}`,
      entityType: 'subscription',
      entityId: id,
      details: { plan: sub.plan, from: sub.status, to: mapping.status },
      ip: clientIp(req.headers),
    });

    return NextResponse.json({ ok: true, message: `Abonnement ${action === 'cancel' ? 'annulé' : 'réactivé'}` });
  } catch (error) {
    console.error('[PATCH /api/admin/subscriptions/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
