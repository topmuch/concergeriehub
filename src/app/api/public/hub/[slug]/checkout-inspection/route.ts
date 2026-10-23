import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { resolveHubPropertyId } from '@/lib/hub-resolve';
import { queueEmail } from '@/lib/email';
import { siteUrl } from '@/lib/site';
import { requireHubAccess } from '@/lib/hub-access';
// v4.165 — PDF EN PIÈCE JOINTE des emails EDL (flux HUB actif) au
// modèle ROUGE « ATTESTATION D'ÉTAT DES LIEUX » (le modèle actuel du
// site — la v4.164 joignait encore l'ancien modèle bleu).
import {
  buildHubInspectionPdfBuffer,
  HUB_PDF_MAX_BYTES,
  hubInspectionPdfFilename,
} from '@/lib/hub-inspection-pdf';
// v4.81 (AUDIT QA) — notification unifiée (in-app + email + push) pour
// l'état des lieux signé : avant, la route créait la cloche en direct
// SANS push et sans couvrir les managers.
import { sendNotificationToMany, propertyOwnerAndManagers } from '@/lib/notifications';

// =============================================================
// v5.0 « ÉTAT DES LIEUX DE SORTIE » — route publique du Hub
//
// GET  ?b=<bookingId> : contexte du formulaire — inspection
//      d'ENTRÉE (MinibarCheck) du séjour si elle existe (encart
//      « Votre état des lieux d'entrée a été enregistré le … »)
//      + inventaire d'arrivée connu.
// POST : enregistre l'inspection signée par l'invité :
//   • rooms[] → 5 colonnes de statut + roomsData (détail) ;
//   • photos de dégâts (dataURL compressées client) → damagePhotos ;
//   • inventaire rendu, auto-évaluation, commentaires, signature ;
//   • publicToken UUID → preuve publique /public/inspection/[token] ;
//   • emails invité + hôte (outbox, fire-and-forget) ;
//   • notification hôte (1, plus si dégâts).
// Le PDF est généré À LA DEMANDE par /api/public/inspection/[token]/pdf.
//
// Sécurité : rate limit 3/min par slug+IP ; zod strict (dataURL) ;
// bookingId re-validé par bien (anti IDOR, dégrade sans échouer) ;
// never-throw ; mode démo (slug demo-hub) = succès sans écriture.
// =============================================================

const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

/** dataURL image (PNG signature / JPEG photo) — plafond ~700 Ko par image. */
const DATA_URL_MAX = 700_000;
const dataUrlSchema = z
  .string()
  .max(DATA_URL_MAX)
  .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=\r\n]+$/, 'Image invalide');

const roomSchema = z.object({
  id: z.enum(['entrance', 'kitchen', 'livingRoom', 'bedrooms', 'bathroom']),
  label: z.string().trim().min(1).max(60),
  status: z.enum(['good', 'dirty', 'damaged']),
  comment: z.string().trim().max(600).optional().nullable(),
  photos: z.array(dataUrlSchema).max(4).optional().nullable(),
});

const inventorySchema = z.object({
  keys: z.number().int().min(0).max(50),
  remotes: z.number().int().min(0).max(50),
  towels: z.number().int().min(0).max(200),
});

// v4.80 « MINIBAR À LA SORTIE » — déclaration par article (unités consommées).
const minibarRowSchema = z.object({
  name: z.string().trim().min(1).max(80),
  consumed: z.number().int().min(0).max(99),
});

const submitSchema = z.object({
  // v4.80 — 'checkin' = état des lieux d'ARRIVÉE (après déverrouillage
  // du hub) ; 'checkout' (défaut) = état des lieux de SORTIE + minibar.
  type: z.enum(['checkin', 'checkout']).default('checkout'),
  bookingId: z.string().trim().max(60).optional().nullable(),
  guestName: z.string().trim().min(1).max(80),
  guestEmail: z
    .string()
    .trim()
    .max(120)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email invalide')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  rooms: z.array(roomSchema).length(5),
  // Arrivée : inventaire rendu / auto-évaluation non pertinents → défauts.
  inventory: inventorySchema.optional().default({ keys: 0, remotes: 0, towels: 0 }),
  minibar: z.array(minibarRowSchema).max(30).optional().nullable(),
  selfAssessment: z.number().int().min(1).max(5).optional().default(5),
  comments: z.string().trim().max(1000).optional().nullable(),
  signature: dataUrlSchema,
  checkInPublicToken: z.string().trim().max(80).optional().nullable(),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'local';
}

/**
 * v4.80 — FALLBACK SÉJOUR COUVRANT (hubs NON verrouillés, sans session) :
 * même logique que le payload du hub — séjour couvrant aujourd'hui
 * (checkIn ≤ maintenant, checkOut ≥ début du jour UTC, non annulé),
 * le plus récent par checkIn. null si aucun (dégrade sans échouer).
 */
async function resolveCoveringStayId(propertyId: string): Promise<string | null> {
  try {
    const now = new Date();
    const startOfTodayUtc = new Date(now.getTime() - (now.getTime() % 86_400_000));
    const stays = await db.booking.findMany({
      where: {
        propertyId,
        checkIn: { lte: now },
        checkOut: { gte: startOfTodayUtc },
        status: { notIn: ['CANCELLED'] },
      },
      orderBy: { checkIn: 'asc' },
      take: 20,
      select: { id: true, checkIn: true },
    });
    if (stays.length === 0) return null;
    return stays.reduce((acc, s) => (s.checkIn > acc.checkIn ? s : acc), stays[0]).id;
  } catch {
    return null;
  }
}

/** Statut lisible (emails — accents OK, jamais d'émoji dans le PDF). */
const STATUS_LABEL: Record<string, string> = {
  good: 'Bon état',
  dirty: 'Sale',
  damaged: 'Endommagé',
};

// -------------------------------------------------------------
// GET — contexte du formulaire (inspections déjà enregistrées du séjour)
// -------------------------------------------------------------
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const url = new URL(req.url);
    const rawBookingId = url.searchParams.get('b')?.trim().slice(0, 60) || null;

    if (isDemo(slug)) {
      return NextResponse.json({ demo: true, checkIn: null, checkin: null, checkout: null, inventory: null });
    }

    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    // v4.80 — résolution du séjour : ?b= explicite (app invité) OU session
    // hub (x-hub-token) OU séjour couvrant courant (hub non verrouillé).
    let bookingId: string | null = rawBookingId;
    if (!bookingId) {
      const access = await requireHubAccess(slug, req, { propertyId: resolved.propertyId });
      if (access.ok && access.bookingId) bookingId = access.bookingId;
    }
    if (!bookingId) {
      bookingId = await resolveCoveringStayId(resolved.propertyId);
    }

    let checkIn: { checkedAt: string; publicToken: string | null } | null = null;
    let checkin: { publicToken: string; signedAt: string } | null = null;
    let checkout: { publicToken: string; signedAt: string } | null = null;
    if (bookingId) {
      const booking = await db.booking.findFirst({
        where: { id: bookingId, propertyId: resolved.propertyId },
        select: { id: true },
      });
      if (booking) {
        const [entry, inspections] = await Promise.all([
          db.minibarCheck.findFirst({
            where: { bookingId: booking.id },
            orderBy: { checkedAt: 'desc' },
            select: { checkedAt: true, publicToken: true },
          }),
          db.checkOutInspection.findMany({
            where: { bookingId: booking.id },
            orderBy: { signedAt: 'desc' },
            select: { type: true, publicToken: true, signedAt: true },
          }),
        ]);
        if (entry) {
          checkIn = { checkedAt: entry.checkedAt.toISOString(), publicToken: entry.publicToken };
        }
        const checkinEntry = inspections.find((i) => i.type === 'checkin');
        const checkoutEntry = inspections.find((i) => i.type === 'checkout');
        if (checkinEntry) {
          checkin = { publicToken: checkinEntry.publicToken, signedAt: checkinEntry.signedAt.toISOString() };
        }
        if (checkoutEntry) {
          checkout = { publicToken: checkoutEntry.publicToken, signedAt: checkoutEntry.signedAt.toISOString() };
        }
      }
    }

    return NextResponse.json({ demo: false, checkIn, checkin, checkout, inventory: null });
  } catch (error) {
    await captureError('hub.checkout-inspection.GET', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez dans un instant.' }, { status: 500 });
  }
}

// -------------------------------------------------------------
// POST — enregistrement de l'inspection de sortie
// -------------------------------------------------------------
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    if (!(await rateLimit(`hubcoi:${slug}:${clientIp(req)}`, 3))) {
      return NextResponse.json(
        { error: 'Trop d’envois rapprochés. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }
    const parsed = submitSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // ── DEMO MODE : succès sans écriture (le formulaire dégrade) ──
    if (isDemo(slug)) {
      return NextResponse.json({ success: true, demo: true });
    }

    // ── Résolution du bien (plaque V1 OU hub du bien) ──
    const resolved = await resolveHubPropertyId(slug);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    }

    const property = await db.property.findUnique({
      where: { id: resolved.propertyId },
      select: {
        id: true,
        name: true,
        address: true,
        owner: { select: { id: true, email: true, fullName: true } },
      },
    });
    if (!property) {
      return NextResponse.json({ error: 'Ce hub est introuvable.' }, { status: 404 });
    }

    // ── bookingId re-validé par bien (anti IDOR) — dégrade sans échouer.
    // v4.80 — si le hub ne connaît pas son bookingId, la SESSION HUB
    // (x-hub-token) le fournit (même garde verrouillage que le minibar).
    let bookingId: string | null = null;
    let bookingEmail: string | null = null;
    let bookingDates: { checkIn: Date; checkOut: Date } | null = null;
    const rawBookingId = data.bookingId?.trim().slice(0, 60) || null;
    if (rawBookingId) {
      const booking = await db.booking.findFirst({
        where: { id: rawBookingId, propertyId: property.id },
        select: { id: true, guestEmail: true, checkIn: true, checkOut: true },
      });
      if (booking) {
        bookingId = booking.id;
        bookingEmail = booking.guestEmail;
        bookingDates = { checkIn: booking.checkIn, checkOut: booking.checkOut };
      }
    }
    if (!bookingId) {
      const access = await requireHubAccess(slug, req, { propertyId: property.id });
      if (!access.ok) {
        return NextResponse.json({ error: access.code, message: access.message }, { status: access.status });
      }
      if (access.bookingId) {
        const booking = await db.booking.findFirst({
          where: { id: access.bookingId, propertyId: property.id },
          select: { id: true, guestEmail: true, checkIn: true, checkOut: true },
        });
        if (booking) {
          bookingId = booking.id;
          bookingEmail = booking.guestEmail;
          bookingDates = { checkIn: booking.checkIn, checkOut: booking.checkOut };
        }
      }
    }
    // v4.80 — dernier recours (hub NON verrouillé, sans session) : le
    // séjour couvrant courant (le plus récent par checkIn), même logique
    // que le payload du hub — rattache le document au séjour affiché.
    if (!bookingId) {
      const coveringId = await resolveCoveringStayId(property.id);
      if (coveringId) {
        const booking = await db.booking.findFirst({
          where: { id: coveringId, propertyId: property.id },
          select: { id: true, guestEmail: true, checkIn: true, checkOut: true },
        });
        if (booking) {
          bookingId = booking.id;
          bookingEmail = booking.guestEmail;
          bookingDates = { checkIn: booking.checkIn, checkOut: booking.checkOut };
        }
      }
    }

    // ── Mapping rooms[] → colonnes + détail JSON ──
    const byId = new Map(data.rooms.map((r) => [r.id, r]));
    const statusOf = (id: 'entrance' | 'kitchen' | 'livingRoom' | 'bedrooms' | 'bathroom') =>
      byId.get(id)?.status ?? 'good';
    const roomsData = data.rooms.map((r) => ({
      id: r.id,
      label: r.label,
      status: r.status,
      comment: r.comment ?? null,
      photoCount: (r.photos ?? []).length,
    }));
    const photos = data.rooms.flatMap((r) => r.photos ?? []);
    const notGood = data.rooms.filter((r) => r.status !== 'good');
    const damagesSummary =
      notGood.length === 0
        ? null
        : notGood
            .map((r) => `${r.label} : ${STATUS_LABEL[r.status]}${r.comment ? ` — ${r.comment}` : ''}`)
            .join('\n');
    const issuesSummary =
      [
        ...data.rooms
          .filter((r) => r.comment && r.status === 'good')
          .map((r) => `${r.label} : ${r.comment}`),
        data.comments ? `Commentaires : ${data.comments}` : '',
      ]
        .filter(Boolean)
        .join('\n') || null;

    const publicToken = crypto.randomUUID();
    const isCheckin = data.type === 'checkin';

    // ── v4.81 (AUDIT QA) — Garde anti-doublon : 2 appareils (ou double
    // soumission réseau) ne doivent JAMAIS créer 2 documents pour le même
    // séjour. Si une inspection du même type existe déjà pour ce booking,
    // on renvoie SUCCÈS idempotent avec le token EXISTANT (le 2ᵉ appareil
    // affiche la preuve déjà enregistrée, pas un doublon).
    if (bookingId) {
      const duplicate = await db.checkOutInspection.findFirst({
        where: { bookingId, type: data.type },
        select: { publicToken: true, signedAt: true },
        orderBy: { signedAt: 'desc' },
      });
      if (duplicate) {
        return NextResponse.json({
          ok: true,
          idempotent: true,
          publicToken: duplicate.publicToken,
          publicPath: `/public/inspection/${duplicate.publicToken}`,
          message: 'Cet état des lieux a déjà été enregistré pour ce séjour.',
        });
      }
    }

    const inspection = await db.checkOutInspection.create({
      data: {
        propertyId: property.id,
        bookingId,
        type: data.type,
        guestName: data.guestName.slice(0, 80),
        guestEmail: (data.guestEmail ?? bookingEmail) || null,
        entranceStatus: statusOf('entrance'),
        kitchenStatus: statusOf('kitchen'),
        livingRoomStatus: statusOf('livingRoom'),
        bedroomsStatus: statusOf('bedrooms'),
        bathroomStatus: statusOf('bathroom'),
        issues: issuesSummary,
        damages: damagesSummary,
        ...(photos.length > 0 ? { damagePhotos: photos } : {}),
        roomsData,
        inventoryCheck: data.inventory,
        ...(data.minibar && data.minibar.length > 0 ? { minibarData: data.minibar } : {}),
        selfAssessment: data.selfAssessment,
        guestSignature: data.signature,
        signedAt: new Date(),
        ipAddress: clientIp(req),
        publicToken,
        status: 'pending',
      },
      select: { id: true, signedAt: true },
    });

    const publicPath = `/public/inspection/${publicToken}`;
    const publicUrl = `${siteUrl}${publicPath}`;
    const pdfUrl = `${siteUrl}/api/public/inspection/${publicToken}/pdf`;

    // ── Inspection d'entrée liée au séjour (comparaison / preuve) ──
    let checkInPublicToken: string | null = null;
    let checkInCheckedAt: string | null = null;
    if (bookingId) {
      const entry = await db.minibarCheck.findFirst({
        where: { bookingId },
        orderBy: { checkedAt: 'desc' },
        select: { checkedAt: true, publicToken: true },
      });
      if (entry) {
        checkInPublicToken = entry.publicToken;
        checkInCheckedAt = entry.checkedAt.toISOString();
      }
    }

    // ── v4.165 — PDF EN PIÈCE JOINTE des emails (flux HUB) ──
    // Modèle ROUGE « ATTESTATION D'ÉTAT DES LIEUX » (le modèle actuel
    // du site) — même rendu que la route PDF publique. Garde-fous :
    // échec de rendu ou PDF > 7 Mo → emails SANS pièce jointe (les
    // liens directs restent) — jamais bloquant, jamais levant.
    let pdfAttachment: { filename: string; mime: string; data: Buffer } | null = null;
    try {
      const buffer = await buildHubInspectionPdfBuffer(publicToken);
      if (buffer && buffer.byteLength <= HUB_PDF_MAX_BYTES) {
        pdfAttachment = {
          filename: hubInspectionPdfFilename(data.type, data.guestName, inspection.id),
          mime: 'application/pdf',
          data: buffer,
        };
      } else if (buffer) {
        console.warn(
          `[checkout-inspection] PDF ${buffer.byteLength} o > 7 Mo — emails sans pièce jointe (${publicToken})`,
        );
      }
    } catch (error) {
      console.error('[checkout-inspection] PDF joint échoué (emails sans pièce jointe) :', error);
      pdfAttachment = null;
    }

    // ── Emails (outbox, fire-and-forget — jamais bloquant) ──
    const frDate = (d: Date) =>
      d.toLocaleString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    const stayLabel = bookingDates
      ? `Séjour du ${frDate(bookingDates.checkIn)} au ${frDate(bookingDates.checkOut)}`
      : null;
    const roomsSummaryHtml = data.rooms
      .map(
        (r) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${r.label}</td>` +
          `<td style="padding:4px 0;font-weight:${r.status === 'good' ? '400' : '700'};color:${
            r.status === 'good' ? '#055492' : r.status === 'dirty' ? '#b45309' : '#b91c1c'
          }">${STATUS_LABEL[r.status]}${r.comment ? ` — ${r.comment.replace(/</g, '&lt;')}` : ''}</td></tr>`,
      )
      .join('');
    // v4.80 — minibar déclaré (sortie uniquement) : lignes « 2 × Coca ».
    const minibarRows = (data.minibar ?? []).filter((m) => m.consumed > 0);
    const minibarHtml =
      minibarRows.length === 0
        ? ''
        : `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Minibar</td><td style="padding:4px 0">${minibarRows
            .map((m) => `${m.consumed} × ${m.name.replace(/</g, '&lt;')}`)
            .join(', ')}</td></tr>`;
    const linksHtml =
      `<p style="margin:18px 0">` +
      `<a href="${publicUrl}" style="display:inline-block;background:#055492;color:#ffffff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:bold;margin-right:10px">Voir la preuve publique</a>` +
      `<a href="${pdfUrl}" style="display:inline-block;background:#ffffff;color:#055492;border:2px solid #055492;padding:8px 16px;border-radius:10px;text-decoration:none;font-weight:bold">Télécharger le PDF</a>` +
      `</p>`;
    const inventoryLine = `${data.inventory.keys} clé(s), ${data.inventory.remotes} télécommande(s), ${data.inventory.towels} serviette(s)`;
    // v4.80 — libellés du document selon le type (entrée vs sortie).
    const docTitle = isCheckin ? "État des lieux d'arrivée" : 'État des lieux de sortie';
    const guestRowsHtml =
      roomsSummaryHtml +
      (isCheckin ? '' : `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Inventaire rendu</td><td style="padding:4px 0">${inventoryLine}</td></tr>`) +
      (isCheckin ? '' : `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Auto-évaluation</td><td style="padding:4px 0">${data.selfAssessment}/5</td></tr>`);

    if (data.guestEmail) {
      void queueEmail({
        to: data.guestEmail,
        subject: `${docTitle} enregistré — ${property.name}`,
        html:
          `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">` +
          `<h2 style="color:#0f172a">${docTitle} enregistré</h2>` +
          `<p style="color:#334155">Merci <strong>${data.guestName.replace(/</g, '&lt;')}</strong> — votre document signé pour « ${property.name} » a bien été enregistré le ${frDate(inspection.signedAt)}.</p>` +
          (stayLabel ? `<p style="color:#64748b;font-size:13px">${stayLabel}</p>` : '') +
          `<table style="border-collapse:collapse;margin:16px 0">${guestRowsHtml}${minibarHtml}` +
          `</table>` +
          (pdfAttachment
            ? `<p style="color:#334155;font-size:13px">📎 Le document PDF signé est <strong>joint à cet email</strong> — conservez-le : il a valeur juridique.</p>`
            : '') +
          linksHtml +
          `<p style="color:#94a3b8;font-size:12px">Document horodaté et signé électroniquement — preuve publique : ${publicUrl}</p>` +
          `</div>`,
        text: `${docTitle} enregistré pour ${property.name}.${pdfAttachment ? ' Le PDF signé est joint à cet email.' : ''} Preuve publique : ${publicUrl} — PDF : ${pdfUrl}`,
        template: 'custom',
        propertyId: property.id,
        referenceType: 'check_out_inspection',
        referenceId: inspection.id,
        attachment: pdfAttachment,
      });
    }

    const hasDamages = notGood.length > 0;

    if (property.owner?.email) {
      void queueEmail({
        to: property.owner.email,
        subject: hasDamages
          ? `⚠️ Dégâts signalés — ${docTitle.toLowerCase()} — ${property.name}`
          : `✅ ${docTitle} reçu — ${property.name}`,
        html:
          `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">` +
          `<h2 style="color:${hasDamages ? '#b45309' : '#055492'}">${hasDamages ? '⚠️ Dégâts signalés par l’invité' : `${docTitle} reçu`}</h2>` +
          `<p style="color:#334155"><strong>${data.guestName.replace(/</g, '&lt;')}</strong> a signé ${isCheckin ? "l'état des lieux d'arrivée" : "l'état des lieux de sortie"} de « ${property.name} » le ${frDate(inspection.signedAt)}.</p>` +
          (stayLabel ? `<p style="color:#64748b;font-size:13px">${stayLabel}</p>` : '') +
          `<table style="border-collapse:collapse;margin:16px 0">${roomsSummaryHtml}${minibarHtml}` +
          (isCheckin ? '' : `<tr><td style="padding:4px 12px 4px 0;color:#64748b">Auto-évaluation</td><td style="padding:4px 0">${data.selfAssessment}/5</td></tr>`) +
          `</table>` +
          (data.comments
            ? `<p style="color:#334155;background:#f8fafc;padding:10px;border-radius:8px">« ${data.comments.replace(/</g, '&lt;')} »</p>`
            : '') +
          (pdfAttachment
            ? `<p style="color:#334155;font-size:13px">📎 Le document PDF signé est <strong>joint à cet email</strong>.</p>`
            : '') +
          linksHtml +
          `<p style="color:#94a3b8;font-size:12px">Retrouvez la liste dans le Dashboard → Invités → États des lieux.</p>` +
          `</div>`,
        text: `${hasDamages ? 'Dégâts signalés' : `${docTitle} reçu`} — ${property.name} (${data.guestName}).${pdfAttachment ? ' Le PDF signé est joint à cet email.' : ''} Preuve : ${publicUrl}`,
        template: 'custom',
        propertyId: property.id,
        referenceType: 'check_out_inspection',
        referenceId: inspection.id,
        attachment: pdfAttachment,
      });
    }

    // ── v4.81 — Notification hôte + managers UNIFIÉE (cloche + email
    // court + PUSH Web Push VAPID). Le push est critique : un dégât
    // signalé doit sonner immédiatement sur le téléphone de l'hôte.
    const damagedLabels = notGood.map((r) => r.label).join(', ');
    const inspectionAudience = await propertyOwnerAndManagers(property.id).catch(
      () => [property.owner.id] as string[],
    );
    await sendNotificationToMany(
      inspectionAudience.length > 0 ? inspectionAudience : [property.owner.id],
      'checkout_inspection',
      {
        title: hasDamages
          ? `⚠️ Dégâts signalés — ${docTitle.toLowerCase()} — ${property.name}`
          : `🧾 ${docTitle} reçu — ${property.name}`,
        body: hasDamages
          ? `${data.guestName} a signalé : ${damagedLabels}.`
          : `${data.guestName} a signé ${isCheckin ? "l'état des lieux d'arrivée" : "l'état des lieux de sortie"} (aucun dégât signalé).`,
        url: publicPath,
        propertyId: property.id,
        propertyName: property.name,
        force: hasDamages, // dégâts = alerte critique (email+push forcés)
        meta: {
          source: 'hub',
          publicToken,
          inspectionId: inspection.id,
          bookingId,
          guestName: data.guestName,
          inspectionType: data.type,
          hasDamages,
          damagedRooms: notGood.map((r) => r.id),
          selfAssessment: data.selfAssessment,
          hubSlug: slug,
        },
      },
    ).catch(() => undefined);

    return NextResponse.json({
      success: true,
      publicToken,
      publicUrl,
      checkInPublicToken,
      checkInCheckedAt,
    });
  } catch (error) {
    await captureError('hub.checkout-inspection.POST', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}
