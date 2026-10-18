import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import {
  sendNotificationToMany,
  propertyOwnerAndManagers,
} from '@/lib/notifications';
import { INVENTORY_ITEMS } from '@/lib/inventory';

// =============================================================
// v4.54 « ALERTES STOCK » (amélioration 2.2)
// POST /api/public/hub/[slug]/staff/inventory-check
//   body: { pin: '0000', reportedBy?, items: [{item, status, note?}] }
//
// L'équipe de ménage scanne le QR « Ménage » et signale l'état du
// stock sur 4 postes (serviettes, papier toilette, savon/shampooing,
// capsules café) en 3 états : ok | low | empty. Tout signalement
// NON-OK est persisté (InventoryAlert) et déclenche une alerte
// AUTOMATIQUE à l'hôte (cloche + email, type 'inventory_alert', force).
//
// Sécurité : STAFF_PIN revérifié SERVEUR (même garde que le ménage) ;
// zod strict ; rate limit 6/min ; anti-spam par item
// (1 alerte / item / 2 h — un « low » qui se répète ne spamme pas).
// v4.81 (AUDIT QA) — le code staff est désormais configurable par la
// variable d'environnement STAFF_PIN (défaut '0000' en dev). En
// production, définir STAFF_PIN dans Coolify (4 chiffres).
// =============================================================

const STAFF_PIN = process.env.STAFF_PIN?.trim() || '0000';

const itemSchema = z.object({
  item: z.enum(['serviettes', 'papier_toilette', 'savon_shampooing', 'capsules_cafe']),
  status: z.enum(['ok', 'low', 'empty']),
  note: z.string().trim().max(300).optional().nullable(),
});

const requestSchema = z.object({
  pin: z.string().trim().regex(/^\d{4}$/, 'Code staff invalide.'),
  reportedBy: z.string().trim().max(60).optional().nullable(),
  items: z.array(itemSchema).min(1).max(8),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    // Anti-spam : 6 checks / minute / slug+IP
    // v4.76 — politique staff durcie : 5 requêtes/min/IP max (code fixe).
    if (!(await rateLimit(`inventorycheck:${slug}:${clientIp(req)}`, 5))) {
      return NextResponse.json(
        { error: 'Trop d’envois rapprochés. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    const rawBody = await req.json().catch(() => null);
    if (rawBody !== null && typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const parsed = requestSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Requête invalide.' },
        { status: 400 },
      );
    }
    const { pin, reportedBy, items } = parsed.data;

    // ── Garde-fou serveur : code staff (même règle que le ménage) ──
    if (pin !== STAFF_PIN) {
      return NextResponse.json({ error: 'Code staff incorrect.' }, { status: 403 });
    }

    // ── MODE DÉMO (vitrine demo-hub) : succès sans écriture — AVANT la
    // résolution du bien (demo-hub est un hub virtuel, pas une Property) ──
    if (slug === 'demo-hub') {
      const flagged = items.filter((i) => i.status !== 'ok');
      return NextResponse.json({
        ok: true,
        mode: 'demo',
        alertsCreated: flagged.length,
        message:
          flagged.length > 0
            ? `${flagged.length} alerte(s) envoyée(s) à l'hôte (mode démo).`
            : 'Stock OK — aucune alerte envoyée (mode démo).',
      });
    }

    // ── Résolution du bien (plaque V1 OU hub du bien) ──
    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }
    const property = await db.property.findUnique({
      where: { id: resolved.propertyId },
      select: { id: true, name: true, isActive: true, owner: { select: { id: true } } },
    });
    if (!property?.isActive) {
      return NextResponse.json({ error: 'Ce hub est introuvable ou a été désactivé.' }, { status: 404 });
    }

    // Rattache au séjour EN COURS si présent (contexte ménage de rotation).
    const now = new Date();
    const activeBooking = await db.booking.findFirst({
      where: {
        propertyId: property.id,
        status: { not: 'CANCELLED' },
        checkIn: { lte: now },
        checkOut: { gte: now },
      },
      orderBy: { checkIn: 'desc' },
      select: { id: true },
    });

    // ── Persistance : 1 InventoryAlert par item NON-OK ──
    // Anti-spam : si une alerte non résolue existe déjà pour le même
    // item depuis moins de 2 h, on ne la recrée pas.
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const recentAlerts = await db.inventoryAlert.findMany({
      where: {
        propertyId: property.id,
        createdAt: { gte: twoHoursAgo },
        resolvedAt: null,
      },
      select: { item: true, status: true },
    });
    const recentByItem = new Map(recentAlerts.map((a) => [a.item, a.status]));

    const flagged = items.filter((i) => i.status !== 'ok');
    const createdIds: string[] = [];
    for (const entry of flagged) {
      const existing = recentByItem.get(entry.item);
      // Déjà signalé non résolu ET niveau pas plus grave → on ignore.
      if (existing) {
        const rank = (s: string) => (s === 'low' ? 1 : 2);
        if (rank(entry.status) <= rank(existing)) continue;
      }
      const alert = await db.inventoryAlert.create({
        data: {
          propertyId: property.id,
          bookingId: activeBooking?.id ?? null,
          item: entry.item,
          status: entry.status,
          reportedBy: reportedBy?.slice(0, 60) ?? null,
          note: entry.note?.slice(0, 300) ?? null,
        },
      });
      createdIds.push(alert.id);
    }

    // ── Alerte AUTOMATIQUE à l'hôte (uniquement pour les nouvelles) ──
    if (createdIds.length > 0) {
      const audience = await propertyOwnerAndManagers(property.id);
      const who = reportedBy?.trim() ? ` (${reportedBy.trim()})` : '';
      const lines = flagged
        .map((i) => {
          const meta = INVENTORY_ITEMS[i.item];
          const label = meta ? `${meta.emoji} ${meta.label}` : i.item;
          return `• ${label} — ${i.status === 'empty' ? '❌ Épuisé' : '⚠️ Stock bas'}`;
        })
        .join('\n');
      const body =
        `L'équipe de ménage${who} signale un stock à compléter à ${property.name} :\n${lines}` +
        (createdIds.length < flagged.length ? '' : '');
      if (audience.length > 0) {
        await sendNotificationToMany(audience, 'inventory_alert', {
          title: `📦 Alerte stock — ${property.name}`,
          body,
          propertyId: property.id,
          propertyName: property.name,
          url: '/airbnb/menage',
          force: true, // alerte opérationnelle — court-circuite les préférences
          meta: {
            source: 'hub_staff',
            alertIds: createdIds.join(','),
            bookingId: activeBooking?.id ?? null,
            reportedBy: reportedBy ?? null,
            hubSlug: slug,
          },
        });
      } else if (property.owner?.id) {
        await db.notification
          .create({
            data: {
              userId: property.owner.id,
              type: 'inventory_alert',
              title: `📦 Alerte stock — ${property.name}`,
              body,
            },
          })
          .catch(() => undefined);
      }
    }

    return NextResponse.json({
      ok: true,
      alertsCreated: createdIds.length,
      message:
        createdIds.length > 0
          ? `${createdIds.length} alerte(s) envoyée(s) à l'hôte. Merci !`
          : 'Stock OK — rien à signaler. Merci !',
    });
  } catch (error) {
    await captureError('hub.inventory-check', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}
