import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/audit';

// =============================================================
// v4.69 — PHASE 4 « NOTIFICATIONS COMMANDES » (côté invité)
// GET /api/public/hub/[slug]/order-updates
//
// Flux léger de STATUTS des commandes récentes du bien, consommé par
// l'onglet « Messages de l'hôte » du Hub invité : quand l'hôte passe
// une commande en PREPARING (« En préparation »), l'invité voit la
// carte « 🧺 Votre commande est en préparation ! » — la rassurance
// demandée par le client (PHASE 4 : notification in-app dans Messages).
//
// Sources fusionnées (14 derniers jours, jamais CANCELLED) :
//   • ServiceOrder  (room service / prestataires) — PENDING…DELIVERED
//   • MinibarOrder  (honesty bar) — OPEN / PAID (« validée par l'hôte »)
//   • LaundryOrder  (pressing) — REQUESTED…DELIVERED (IN_PROGRESS =
//     « En préparation »)
// Vie privée : uniquement le bien résolu par le slug (plaque V1 OU
// qrHubSlug) ; jamais d'email invité, jamais de note, jamais d'id
// Stripe. Rate limit 30/min/slug+IP ; never-throw.
// =============================================================

const WINDOW_DAYS = 14;

/** Statut service → libellé invité. */
const SERVICE_META: Record<string, { label: string; emoji: string; preparing: boolean }> = {
  PENDING: { label: 'Enregistrée — en attente de votre hôte', emoji: '⏳', preparing: false },
  CONFIRMED: { label: 'Confirmée par votre hôte', emoji: '✅', preparing: false },
  PREPARING: { label: 'En cours de préparation', emoji: '🧑‍🍳', preparing: true },
  DELIVERED: { label: 'Livrée — bon appétit !', emoji: '🎉', preparing: false },
};

/** Statut pressing → libellé invité. */
const LAUNDRY_META: Record<string, { label: string; emoji: string; preparing: boolean }> = {
  REQUESTED: { label: 'Demande envoyée à votre hôte', emoji: '⏳', preparing: false },
  PAID: { label: 'Paiement confirmé', emoji: '💳', preparing: false },
  IN_PROGRESS: { label: 'En cours de préparation', emoji: '🧺', preparing: true },
  READY: { label: 'Prête — votre hôte vous la remet', emoji: '✅', preparing: false },
  DELIVERED: { label: 'Livrée', emoji: '🎉', preparing: false },
};

export interface HubOrderUpdate {
  id: string;
  kind: 'service' | 'minibar' | 'laundry';
  title: string;
  summary: string;
  statusLabel: string;
  statusEmoji: string;
  /** true → l'onglet Messages du hub affiche l'alerte « En préparation ». */
  preparing: boolean;
  totalEur: number | null;
  at: string;
}

/** Résume des lignes [{name, qty}] en « 2× Café, 1× Thé ». */
function summarizeItems(raw: unknown, max = 3): string {
  try {
    if (!Array.isArray(raw)) return '';
    const arr = raw as Array<{ name?: unknown; qty?: unknown }>;
    const parts = arr
      .filter((it) => it && typeof it.name === 'string')
      .map((it) => `${typeof it.qty === 'number' && it.qty > 1 ? `${it.qty}× ` : ''}${String(it.name).slice(0, 40)}`)
      .slice(0, max);
    const rest = arr.length - parts.length;
    if (rest > 0) parts.push(`+${rest} autre(s)`);
    return parts.join(', ');
  } catch {
    return '';
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!(await rateLimit(`huborderupd:${slug}:${clientIp(req.headers) ?? 'local'}`, 30))) {
      return NextResponse.json({ error: 'Trop de requêtes. Réessayez dans un instant.' }, { status: 429 });
    }

    // ── Résolution du bien : plaque V1 OU hub du bien (identique aux
    //    autres routes hub — guest-messages, voice-replies, etc.) ──
    let propertyId: string | null = null;
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true },
    });
    if (plaque) {
      if (!plaque.isClaimed || !plaque.propertyId) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      propertyId = plaque.propertyId;
    } else {
      const propertyBySlug = await db.property.findUnique({
        where: { qrHubSlug: slug },
        select: { id: true, isActive: true },
      });
      if (!propertyBySlug || !propertyBySlug.isActive) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      propertyId = propertyBySlug.id;
    }
    if (!propertyId) {
      return NextResponse.json({ updates: [] });
    }

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);

    const [serviceOrders, minibarOrders, laundryOrders] = await Promise.all([
      db.serviceOrder.findMany({
        where: { propertyId, status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'DELIVERED'] }, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, items: true, totalAmount: true, status: true, createdAt: true, provider: { select: { businessName: true } } },
      }),
      db.minibarOrder.findMany({
        where: { propertyId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, itemsJson: true, totalEur: true, status: true, createdAt: true },
      }),
      db.laundryOrder.findMany({
        where: { propertyId, status: { in: ['REQUESTED', 'PAID', 'IN_PROGRESS', 'READY', 'DELIVERED'] }, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, serviceType: true, pieces: true, amountEur: true, status: true, createdAt: true },
      }),
    ]);

    const updates: HubOrderUpdate[] = [];

    for (const o of serviceOrders) {
      const meta = SERVICE_META[o.status] ?? SERVICE_META.PENDING;
      updates.push({
        id: `svc-${o.id}`,
        kind: 'service',
        title: o.provider?.businessName ? `Room Service — ${o.provider.businessName}` : 'Room Service',
        summary: summarizeItems(o.items),
        statusLabel: meta.label,
        statusEmoji: meta.emoji,
        preparing: meta.preparing,
        totalEur: typeof o.totalAmount === 'number' ? Math.round(o.totalAmount * 100) / 100 : null,
        at: o.createdAt.toISOString(),
      });
    }

    for (const o of minibarOrders) {
      let items: unknown = null;
      try {
        items = JSON.parse(o.itemsJson ?? '[]');
      } catch {
        items = null;
      }
      const paid = o.status === 'PAID';
      updates.push({
        id: `mnb-${o.id}`,
        kind: 'minibar',
        title: 'Minibar',
        summary: summarizeItems(items),
        statusLabel: paid ? 'Validée par votre hôte — merci !' : 'Enregistrée — en attente de votre hôte',
        statusEmoji: paid ? '✅' : '⏳',
        preparing: false,
        totalEur: typeof o.totalEur === 'number' ? Math.round(o.totalEur * 100) / 100 : null,
        at: o.createdAt.toISOString(),
      });
    }

    for (const o of laundryOrders) {
      const meta = LAUNDRY_META[o.status] ?? LAUNDRY_META.REQUESTED;
      const typeLabel =
        o.serviceType === 'ironing' ? 'Repassage' : o.serviceType === 'washing' ? 'Lavage' : 'Nettoyage à sec';
      updates.push({
        id: `ldr-${o.id}`,
        kind: 'laundry',
        title: 'Pressing & Blanchisserie',
        summary: `${typeLabel} — ${o.pieces} pièce(s)`,
        statusLabel: meta.label,
        statusEmoji: meta.emoji,
        preparing: meta.preparing,
        totalEur: typeof o.amountEur === 'number' ? Math.round(o.amountEur * 100) / 100 : null,
        at: o.createdAt.toISOString(),
      });
    }

    // Les « En préparation » remontent en tête, puis du plus récent au plus ancien.
    updates.sort((a, b) => {
      if (a.preparing !== b.preparing) return a.preparing ? -1 : 1;
      return b.at.localeCompare(a.at);
    });

    return NextResponse.json(
      { updates: updates.slice(0, 20) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    // never-throw : l'onglet Messages doit rester fonctionnel même si
    // ce flux optionnel échoue.
    return NextResponse.json({ updates: [] });
  }
}
