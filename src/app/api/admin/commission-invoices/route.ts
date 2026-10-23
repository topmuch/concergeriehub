// =============================================================
// /api/admin/commission-invoices — v4.69 PHASE 5
// « COMMISSION, CRM SUPERADMIN & FACTURATION MENSUELLE »
//
// GET    ?status= &month= &year= &search=   → factures + KPIs
// POST   { month, year, hostId? }           → génère (1 hôte ou tous
//          les hôtes actifs du mois). Idempotent : upsert — une facture
//          PAID n'est jamais écrasée ; une facture PENDING est
//          recalculée. Taux = HostSettings.commissionRate (défaut 0.20).
// PATCH  { id, status }                     → statut (paid → paidAt now)
//        { hostId, commissionRate }         → taux de commission hôte
// DELETE ?id=                               → suppression (si non payée)
//
// 🔒 Superadmin. Mutations journalisées (audit) + rate limit admin.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { mutationGuard, mutationKey, MUTATIONS_LIMIT_ADMIN } from '@/lib/mutation-guard';
import {
  computeHostMonthlyTotals,
  findActiveOwnerIds,
  getOrCreateHostSettings,
  monthDueDate,
  monthLabel,
  round2,
  DEFAULT_HOST_COMMISSION_RATE,
} from '@/lib/commission';
import { queueEmail } from '@/lib/email';
import { siteUrl } from '@/lib/site';

/** Échappe les caractères HTML d'un fragment texte (emails). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// v4.81 (AUDIT QA-3) — l'hôte est NOTIFIÉ de sa facture de commission :
// email HTML récapitulatif (montants, taux, breakdown, échéance) + lien
// public vers le PDF serveur (pdfToken). Fire-and-forget (outbox).
async function sendCommissionInvoiceEmail(params: {
  hostEmail: string;
  hostName: string;
  hostId: string;
  month: number;
  year: number;
  totalOrdersAmount: number;
  commissionRate: number;
  commissionOwed: number;
  ordersCount: number;
  breakdown: { minibar: number; services: number; laundry: number };
  dueDate: Date;
  pdfUrl: string;
  invoiceId: string;
}): Promise<void> {
  const mLabel = monthLabel(params.month, params.year);
  const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
  const ratePct = `${(params.commissionRate * 100).toFixed(0)} %`;
  const dashboardUrl = `${siteUrl}/airbnb/billing`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">` +
    `<h2 style="margin:0 0 6px;font-size:19px">Facture de commission — ${escapeHtml(mLabel)}</h2>` +
    `<p style="margin:0 0 16px;color:#475569;font-size:14px">Bonjour ${escapeHtml(params.hostName)}, voici le détail de la commission RoomScan sur les commandes encaissées par vos invités via le Hub.</p>` +
    `<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:0 6px">` +
    `<tr><td style="background:#f8fafc;padding:9px 12px;border-radius:6px;font-size:14px">Minibar</td><td style="background:#f8fafc;padding:9px 12px;border-radius:6px;font-size:14px;text-align:right">${eur(params.breakdown.minibar)}</td></tr>` +
    `<tr><td style="background:#f8fafc;padding:9px 12px;border-radius:6px;font-size:14px">Services (room service, expériences…)</td><td style="background:#f8fafc;padding:9px 12px;border-radius:6px;font-size:14px;text-align:right">${eur(params.breakdown.services)}</td></tr>` +
    `<tr><td style="background:#f8fafc;padding:9px 12px;border-radius:6px;font-size:14px">Pressing / blanchisserie</td><td style="background:#f8fafc;padding:9px 12px;border-radius:6px;font-size:14px;text-align:right">${eur(params.breakdown.laundry)}</td></tr>` +
    `<tr><td style="background:#f8fafc;padding:9px 12px;border-radius:6px;font-size:14px">Commandes encaissées</td><td style="background:#f8fafc;padding:9px 12px;border-radius:6px;font-size:14px;text-align:right">${params.ordersCount} commande(s)</td></tr>` +
    `<tr><td style="background:#f8fafc;padding:9px 12px;border-radius:6px;font-size:14px">Montant total encaissé</td><td style="background:#f8fafc;padding:9px 12px;border-radius:6px;font-size:14px;text-align:right"><strong>${eur(params.totalOrdersAmount)}</strong></td></tr>` +
    `<tr><td style="background:#fdf6e3;padding:11px 12px;border-radius:6px;font-size:15px"><strong>Commission due à RoomScan (${ratePct})</strong></td><td style="background:#fdf6e3;padding:11px 12px;border-radius:6px;font-size:15px;text-align:right"><strong>${eur(params.commissionOwed)}</strong></td></tr>` +
    `</table>` +
    `<p style="margin:14px 0 4px;font-size:14px">Échéance de paiement : <strong>${params.dueDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>` +
    `<p style="margin:18px 0">` +
    `<a href="${params.pdfUrl}" style="display:inline-block;background:#055492;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px">📄 Télécharger la facture PDF</a>` +
    `&nbsp;&nbsp;<a href="${dashboardUrl}" style="display:inline-block;color:#055492;text-decoration:none;padding:11px 6px;font-size:14px">Voir mon espace facturation</a>` +
    `</p>` +
    `<p style="margin:14px 0 0;color:#64748b;font-size:12px">Paiement par virement — facturation@roomscan.pro. Ce lien PDF reste consultable à vie.</p>` +
    `</div>`;
  await queueEmail({
    to: params.hostEmail,
    subject: `Facture de commission RoomScan — ${mLabel} : ${eur(params.commissionOwed)}`,
    html,
    text: `Facture de commission ${mLabel} : total encaissé ${eur(params.totalOrdersAmount)}, commission ${ratePct} = ${eur(params.commissionOwed)}. PDF : ${params.pdfUrl}`,
    template: 'commission_invoice',
    userId: params.hostId,
    referenceType: 'commission_invoice',
    referenceId: params.invoiceId,
    meta: { month: params.month, year: params.year, commissionOwed: params.commissionOwed },
  }).catch(() => undefined);
}

const monthYearSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2024).max(2100),
});

export async function GET(request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const month = searchParams.get('month') ? Number(searchParams.get('month')) : null;
    const year = searchParams.get('year') ? Number(searchParams.get('year')) : null;
    const search = searchParams.get('search')?.trim().toLowerCase() || '';

    const where: {
      status?: string;
      month?: number;
      year?: number;
      host?: { OR: Array<{ email?: object; fullName?: object }> };
    } = {};
    if (status && ['pending', 'paid', 'overdue'].includes(status)) where.status = status;
    if (month && month >= 1 && month <= 12) where.month = month;
    if (year && year >= 2024) where.year = year;
    if (search) {
      where.host = {
        OR: [{ email: { contains: search } }, { fullName: { contains: search } }],
      };
    }

    const [invoices, all] = await Promise.all([
      db.monthlyCommissionInvoice.findMany({
        where,
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
        take: 300,
        include: { host: { select: { id: true, email: true, fullName: true } } },
      }),
      db.monthlyCommissionInvoice.findMany({ select: { status: true, commissionOwed: true } }),
    ]);

    const kpis = {
      pendingTotal: round2(all.filter((i) => i.status === 'pending').reduce((s, i) => s + i.commissionOwed, 0)),
      paidTotal: round2(all.filter((i) => i.status === 'paid').reduce((s, i) => s + i.commissionOwed, 0)),
      overdueTotal: round2(all.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.commissionOwed, 0)),
      pendingCount: all.filter((i) => i.status === 'pending').length,
      overdueCount: all.filter((i) => i.status === 'overdue').length,
      paidCount: all.filter((i) => i.status === 'paid').length,
    };

    return NextResponse.json({ invoices, kpis });
  } catch {
    return NextResponse.json({ error: 'Erreur lors du chargement des factures.' }, { status: 500 });
  }
}

const generateSchema = monthYearSchema.extend({ hostId: z.string().min(1).max(60).optional() });

export async function POST(request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();
  const mutGuard = await mutationGuard(mutationKey('admin-mut', request, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard; // null = autorisé

  try {
    const body: unknown = await request.json();
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Mois/année invalide.' }, { status: 400 });
    }
    const { month, year, hostId } = parsed.data;

    const hostIds = hostId ? [hostId] : await findActiveOwnerIds(month, year);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let emailed = 0;
    // v4.81 — pour l'email final (récap de synthèse renvoyé au superadmin).
    const hostIdsEmailed: string[] = [];

    for (const hid of hostIds) {
      try {
        const settings = await getOrCreateHostSettings(hid);
        const rate = typeof settings.commissionRate === 'number' && settings.commissionRate > 0
          ? settings.commissionRate
          : DEFAULT_HOST_COMMISSION_RATE;
        const totals = await computeHostMonthlyTotals(hid, month, year);

        const existing = await db.monthlyCommissionInvoice.findUnique({
          where: { hostId_month_year: { hostId: hid, month, year } },
        });

        if (existing?.status === 'paid') {
          skipped += 1; // facture réglée → jamais écrasée
          continue;
        }
        if (totals.total <= 0) {
          // Aucune activité : supprime une facture pending vide éventuelle.
          if (existing && existing.status !== 'paid') {
            await db.monthlyCommissionInvoice.delete({ where: { id: existing.id } });
          }
          skipped += 1;
          continue;
        }

        const data = {
          totalOrdersAmount: totals.total,
          commissionRate: rate,
          commissionOwed: round2(totals.total * rate),
          ordersCount: totals.count,
          breakdown: { minibar: totals.minibar, services: totals.services, laundry: totals.laundry },
          dueDate: monthDueDate(month, year),
          status: 'pending' as const,
          paidAt: null,
        };

        // v4.81 — jeton public du PDF (48 hex) conservé entre 2 régénérations.
        const pdfToken = existing?.pdfToken ?? randomBytes(24).toString('hex');
        const pdfUrl = `${siteUrl}/api/public/commission-invoice/${pdfToken}/pdf`;
        const dataWithPdf = { ...data, pdfToken, invoicePdfUrl: pdfUrl };

        let invoiceRow: { id: string; hostId: string };
        let isNew = false;
        let changed = true;
        if (existing) {
          // Un montant inchangé ne renvoie pas d'email de relance.
          changed =
            Math.abs((existing.commissionOwed ?? 0) - data.commissionOwed) > 0.004 ||
            (existing.ordersCount ?? 0) !== data.ordersCount;
          invoiceRow = await db.monthlyCommissionInvoice.update({
            where: { id: existing.id },
            data: dataWithPdf,
            select: { id: true, hostId: true },
          });
          updated += 1;
        } else {
          invoiceRow = await db.monthlyCommissionInvoice.create({
            data: { hostId: hid, month, year, ...dataWithPdf },
            select: { id: true, hostId: true },
          });
          created += 1;
          isNew = true;
        }

        // v4.81 — email hôte : création OU changement de montant. L'envoi
        // est fire-and-forget : un échec n'annule JAMAIS la facture (outbox).
        if (isNew || changed) {
          const host = await db.user.findUnique({
            where: { id: hid },
            select: { email: true, fullName: true },
          });
          if (host?.email) {
            void sendCommissionInvoiceEmail({
              hostEmail: host.email,
              hostName: host.fullName?.trim() || host.email,
              hostId: hid,
              month,
              year,
              totalOrdersAmount: data.totalOrdersAmount,
              commissionRate: data.commissionRate,
              commissionOwed: data.commissionOwed,
              ordersCount: data.ordersCount,
              breakdown: data.breakdown as { minibar: number; services: number; laundry: number },
              dueDate: data.dueDate,
              pdfUrl,
              invoiceId: invoiceRow.id,
            });
            emailed += 1;
            hostIdsEmailed.push(hid);
          }
        }
      } catch {
        skipped += 1;
      }
    }

    await logAudit({
      actor: admin,
      action: 'commission_invoice.generate',
      entityType: 'monthly_commission_invoice',
      details: { month, year, hostId: hostId ?? 'all', created, updated, skipped, emailed },
    });

    return NextResponse.json({ ok: true, created, updated, skipped, emailed });
  } catch {
    return NextResponse.json({ error: 'Erreur lors de la génération des factures.' }, { status: 500 });
  }
}

const patchStatusSchema = z.object({
  id: z.string().min(1).max(60),
  status: z.enum(['pending', 'paid', 'overdue']),
});

const patchRateSchema = z.object({
  hostId: z.string().min(1).max(60),
  commissionRate: z.number().min(0.01, 'Taux trop bas').max(0.5, 'Taux trop élevé (max 50 %)'),
});

export async function PATCH(request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();
  const mutGuard = await mutationGuard(mutationKey('admin-mut', request, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard; // null = autorisé

  try {
    const body: unknown = await request.json();

    // 1) Changement de STATUT d'une facture.
    const asStatus = patchStatusSchema.safeParse(body);
    if (asStatus.success) {
      const { id, status } = asStatus.data;
      const invoice = await db.monthlyCommissionInvoice.findUnique({ where: { id } });
      if (!invoice) return NextResponse.json({ error: 'Facture introuvable.' }, { status: 404 });
      const updated = await db.monthlyCommissionInvoice.update({
        where: { id },
        data: { status, paidAt: status === 'paid' ? new Date() : null },
      });
      await logAudit({ actor: admin, action: 'commission_invoice.status', entityType: 'monthly_commission_invoice', entityId: id, details: { status } });
      return NextResponse.json({ ok: true, invoice: updated });
    }

    // 2) Changement du TAUX de commission d'un hôte.
    const asRate = patchRateSchema.safeParse(body);
    if (asRate.success) {
      const { hostId, commissionRate } = asRate.data;
      const rate = round2(commissionRate * 100) / 100;
      await getOrCreateHostSettings(hostId);
      const settings = await db.hostSettings.update({
        where: { userId: hostId },
        data: { commissionRate: rate },
      });
      // v4.73 — FIX « j'ai mis 10/10 et l'hôte voit 20/100 » : les
      // factures PENDING conservaient l'ancien taux (snapshot à la
      // génération) → l'hôte ne voyait JAMAIS le nouveau taux. On
      // recalcule immédiatement toutes ses factures non réglées
      // (commissionOwed = total × nouveau taux). Les factures PAYÉES
      // ne sont JAMAIS touchées.
      const pending = await db.monthlyCommissionInvoice.findMany({
        where: { hostId, status: { not: 'paid' } },
        select: { id: true, totalOrdersAmount: true },
      });
      let invoicesUpdated = 0;
      for (const inv of pending) {
        await db.monthlyCommissionInvoice.update({
          where: { id: inv.id },
          data: {
            commissionRate: rate,
            commissionOwed: round2((inv.totalOrdersAmount ?? 0) * rate),
          },
        });
        invoicesUpdated += 1;
      }
      await logAudit({ actor: admin, action: 'commission_invoice.rate', entityType: 'host_settings', entityId: hostId, details: { commissionRate: rate, invoicesUpdated } });
      return NextResponse.json({ ok: true, settings: { commissionRate: settings.commissionRate }, invoicesUpdated });
    }

    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Erreur lors de la mise à jour.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();
  const mutGuard = await mutationGuard(mutationKey('admin-mut', request, admin.id), MUTATIONS_LIMIT_ADMIN);
  if (mutGuard) return mutGuard; // null = autorisé

  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id || !/^[A-Za-z0-9_-]{6,60}$/.test(id)) {
      return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 });
    }
    const invoice = await db.monthlyCommissionInvoice.findUnique({ where: { id } });
    if (!invoice) return NextResponse.json({ error: 'Facture introuvable.' }, { status: 404 });
    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Impossible de supprimer une facture payée.' }, { status: 400 });
    }
    await db.monthlyCommissionInvoice.delete({ where: { id } });
    await logAudit({ actor: admin, action: 'commission_invoice.delete', entityType: 'monthly_commission_invoice', entityId: id });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Erreur lors de la suppression.' }, { status: 500 });
  }
}
