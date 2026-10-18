import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { formatEur, providerCategoryMeta } from '@/lib/b2b';
import { canTransition, isOrderStatus, ORDER_STATUS_META, type OrderStatus } from '@/lib/orders';
import { rateLimit } from '@/lib/rate-limit';

// =============================================================
// AUD-FULL ⑥ — Commandes invitées du MODE HÔTE (moteur ServiceOrder)
//
// POST   body { pin }
//   → Liste des 15 dernières commandes ServiceOrder du bien
//     (montant TOTAL uniquement — commission/hostEarning JAMAIS exposés).
// PATCH  body { pin, orderId, action: 'CONFIRM' | 'CANCEL' }
//   → Transition PENDING→CONFIRMED / PENDING→CANCELLED validée par
//     canTransition (src/lib/orders.ts), avec garde d'appartenance
//     du bien (anti-IDOR). 409 si la transition est impossible.
//
// Sécurité : résolution double plaque V1 / property.qrHubSlug
// (identique /host), PIN bcrypt FAIL-CLOSED, rate-limit
// `huborders:${slug}` 10/min.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

interface OrderLineJson {
  name?: unknown;
  qty?: unknown;
}

/** Résumé lisible des lignes ("2× Menu Dégustation") — le détail JSON
 *  des items reste interne. */
function itemsSummary(items: unknown): string {
  if (!Array.isArray(items)) return 'Commande service';
  const parts = (items as OrderLineJson[])
    .map((it) => {
      const name = typeof it?.name === 'string' ? it.name : 'Article';
      const qty = typeof it?.qty === 'number' ? it.qty : 1;
      return `${qty}× ${name}`;
    })
    .slice(0, 4);
  const summary = parts.join(', ');
  return summary.length > 0 ? summary.slice(0, 140) : 'Commande service';
}

interface DemoOrder {
  id: string;
  status: OrderStatus;
  guestName: string;
  providerName: string;
  providerCategory: string;
  totalAmount: number;
  items: { name: string; qty: number }[];
  createdAt: string;
}

const DEMO_ORDERS: DemoOrder[] = [
  {
    id: 'demo-order-1',
    status: 'PENDING',
    guestName: 'Pierre (voyageur)',
    providerName: 'Morning Box Paris',
    providerCategory: 'BREAKFAST',
    totalAmount: 24,
    items: [{ name: 'Petit-déjeuner Continental', qty: 2 }],
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'demo-order-2',
    status: 'CONFIRMED',
    guestName: 'Camille (voyageuse)',
    providerName: 'CleanSuite Paris',
    providerCategory: 'CLEANING',
    totalAmount: 56,
    items: [{ name: 'Ménage de séjour', qty: 1 }],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'demo-order-3',
    status: 'DELIVERED',
    guestName: 'Pierre (voyageur)',
    providerName: 'Paris Transfer Premium',
    providerCategory: 'TRANSPORT',
    totalAmount: 45,
    items: [{ name: 'Transfert gare → logement', qty: 1 }],
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
];

/** Sérialisation hôte d'une commande : statut libellé + badge,
 *  montant TOTAL formaté (jamais le split financier commission/hôte). */
function serializeOrder(o: {
  id: string;
  status: string;
  totalAmount: number;
  guestName: string;
  items: unknown;
  createdAt: Date;
  provider: { businessName: string; category: string } | null;
}) {
  const status: OrderStatus = isOrderStatus(o.status) ? o.status : 'PENDING';
  const meta = ORDER_STATUS_META[status];
  return {
    id: o.id,
    status,
    statusLabel: meta.label,
    statusBadge: meta.badge,
    statusEmoji: meta.emoji,
    totalEur: formatEur(o.totalAmount),
    itemsSummary: itemsSummary(o.items),
    providerName: o.provider?.businessName ?? 'Prestataire',
    providerEmoji: o.provider ? providerCategoryMeta(o.provider.category).emoji : '🛠️',
    guestName: o.guestName,
    createdAt: o.createdAt.toISOString(),
  };
}

/** Résolution du bien : plaque V1 (hubSlug) OU hub du bien (qrHubSlug).
 *  Identique à /host — les biens créés par wizard n'ont pas de plaque. */
async function resolvePropertyId(
  slug: string,
): Promise<{ ok: true; propertyId: string } | { ok: false; status: number; error: string }> {
  const plaque = await db.physicalQrCode.findUnique({
    where: { hubSlug: slug },
    select: { propertyId: true, isClaimed: true, status: true },
  });
  if (plaque) {
    if (!plaque.isClaimed || !plaque.propertyId) {
      return { ok: false, status: 404, error: 'Hub non trouvé' };
    }
    if (plaque.status !== 'active') {
      return { ok: false, status: 410, error: 'Cette plaque QR est désactivée.' };
    }
    return { ok: true, propertyId: plaque.propertyId };
  }
  const propertyBySlug = await db.property.findUnique({
    where: { qrHubSlug: slug },
    select: { id: true, isActive: true },
  });
  if (!propertyBySlug) {
    return { ok: false, status: 404, error: 'Hub non trouvé' };
  }
  if (!propertyBySlug.isActive) {
    return { ok: false, status: 410, error: 'Ce bien a été désactivé par son hôte.' };
  }
  return { ok: true, propertyId: propertyBySlug.id };
}

/** Garde PIN du mode hôte : format 4 chiffres, FAIL-CLOSED (sans
 *  pinHash tout est refusé), rate-limit 10/min/slug, bcrypt. */
async function verifyHostPin(
  slug: string,
  pin: string,
): Promise<{ ok: true; propertyId: string } | { ok: false; status: number; error: string }> {
  if (!pin || !/^\d{4}$/.test(pin)) {
    return { ok: false, status: 400, error: 'PIN requis (4 chiffres)' };
  }
  const resolved = await resolvePropertyId(slug);
  if (!resolved.ok) return resolved;

  const property = await db.property.findUnique({
    where: { id: resolved.propertyId },
    select: { id: true, pinHash: true },
  });
  if (!property) {
    return { ok: false, status: 404, error: 'Logement non trouvé' };
  }
  if (!property.pinHash) {
    return {
      ok: false,
      status: 403,
      error:
        "Aucun PIN n'est configuré pour ce logement. Le mode hôte est verrouillé jusqu'à sa définition dans l'espace hôte.",
    };
  }
  if (!(await rateLimit(`huborders:${slug}`, 10))) {
    return { ok: false, status: 429, error: 'Trop de tentatives. Réessayez dans un instant.' };
  }
  const isValid = await compare(pin, property.pinHash);
  if (!isValid) {
    return { ok: false, status: 401, error: 'PIN incorrect' };
  }
  return { ok: true, propertyId: property.id };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = (await req.json().catch(() => null)) as { pin?: unknown } | null;
    const pin = typeof body?.pin === 'string' ? body.pin : '';

    // ── DEMO MODE : n'importe quel PIN à 4 chiffres ──
    if (isDemo(slug)) {
      if (!/^\d{4}$/.test(pin)) {
        return NextResponse.json({ error: 'PIN requis (4 chiffres)' }, { status: 400 });
      }
      return NextResponse.json({
        orders: DEMO_ORDERS.map((o) =>
          serializeOrder({
            id: o.id,
            status: o.status,
            totalAmount: o.totalAmount,
            guestName: o.guestName,
            items: o.items,
            createdAt: new Date(o.createdAt),
            provider: { businessName: o.providerName, category: o.providerCategory },
          }),
        ),
      });
    }

    const guard = await verifyHostPin(slug, pin);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    // ── 15 dernières commandes du bien (montant TOTAL, jamais le split) ──
    const orders = await db.serviceOrder.findMany({
      where: { propertyId: guard.propertyId },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { provider: { select: { businessName: true, category: true } } },
    });

    return NextResponse.json({ orders: orders.map(serializeOrder) });
  } catch (error) {
    console.error('Hub ORDERS list error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = (await req.json().catch(() => null)) as {
      pin?: unknown;
      orderId?: unknown;
      action?: unknown;
    } | null;
    const pin = typeof body?.pin === 'string' ? body.pin : '';
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    const action = typeof body?.action === 'string' ? body.action : '';

    if (action !== 'CONFIRM' && action !== 'CANCEL') {
      return NextResponse.json(
        { error: 'Action invalide (CONFIRM ou CANCEL attendu)' },
        { status: 400 },
      );
    }
    const target: OrderStatus = action === 'CONFIRM' ? 'CONFIRMED' : 'CANCELLED';

    // ── DEMO MODE : mêmes transitions sur le jeu de démonstration ──
    if (isDemo(slug)) {
      if (!/^\d{4}$/.test(pin)) {
        return NextResponse.json({ error: 'PIN requis (4 chiffres)' }, { status: 400 });
      }
      const demo = DEMO_ORDERS.find((o) => o.id === orderId);
      if (!demo) {
        return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 });
      }
      if (!canTransition(demo.status, target)) {
        return NextResponse.json(
          { error: `Transition impossible : commande ${ORDER_STATUS_META[demo.status].label.toLowerCase()}.` },
          { status: 409 },
        );
      }
      demo.status = target;
      return NextResponse.json({
        ok: true,
        order: serializeOrder({
          id: demo.id,
          status: demo.status,
          totalAmount: demo.totalAmount,
          guestName: demo.guestName,
          items: demo.items,
          createdAt: new Date(demo.createdAt),
          provider: { businessName: demo.providerName, category: demo.providerCategory },
        }),
      });
    }

    const guard = await verifyHostPin(slug, pin);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    if (!orderId) {
      return NextResponse.json({ error: 'Commande non précisée' }, { status: 400 });
    }

    // ── Anti-IDOR : la commande DOIT appartenir à CE bien (404 sinon,
    //    pour ne pas révéler l'existence d'une commande ailleurs) ──
    const order = await db.serviceOrder.findFirst({
      where: { id: orderId, propertyId: guard.propertyId },
      include: { provider: { select: { businessName: true, category: true } } },
    });
    if (!order) {
      return NextResponse.json({ error: 'Commande non trouvée pour ce logement' }, { status: 404 });
    }

    // ── Transition validée par le moteur métier (409 si interdite) ──
    const current: OrderStatus = isOrderStatus(order.status) ? order.status : 'PENDING';
    if (!canTransition(current, target)) {
      return NextResponse.json(
        {
          error: `Transition impossible : la commande est ${ORDER_STATUS_META[current].label.toLowerCase()}.`,
        },
        { status: 409 },
      );
    }

    const updated = await db.serviceOrder.update({
      where: { id: order.id },
      data: { status: target },
      include: { provider: { select: { businessName: true, category: true } } },
    });

    return NextResponse.json({ ok: true, order: serializeOrder(updated) });
  } catch (error) {
    console.error('Hub ORDERS patch error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
