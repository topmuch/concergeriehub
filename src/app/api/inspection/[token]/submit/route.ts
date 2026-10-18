import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/audit';
import { captureError } from '@/lib/error-monitor';
import { sendInspectionCompletedEmail } from '@/lib/inspection-emails';
import { isElectronicItem } from '@/lib/inspection-template';
import { computeInspectionSha256 } from '@/lib/inspection-hash';

// =============================================================
// v4.97 MODULE STANDALONE « ÉTAT DES LIEUX » — API PUBLIQUE POST
// POST /api/inspection/[token]/submit
//   body: { rooms, cleanliness, guestSignature, approved }
//   → 200 { ok: true, completedAt }
//
// RÈGLE D'OR (validée SERVEUR, jamais confiance au client) :
//   • item state === 'MAUVAIS' → commentaire NON VIDE + photo
//     OBLIGATOIRES (sinon 400 avec pièce + élément nommés) ;
//   • cleanliness 'A_NETTOYER' | 'TRES_SALE' → photo obligatoire ;
//   • globalState d'une pièce = RECALCULÉ serveur (pire état des
//     items) — la valeur envoyée par le client est ignorée ;
//   • approved === true obligatoire ; signature PNG dataURL ≤ 400 Ko ;
//   • photos = dataURL image (jpeg/png) ≤ 500 Ko chacune (défaut,
//     ON et OFF — les preuves ON/OFF ne sont acceptées QUE pour
//     les appareils électroniques, garde serveur isElectronicItem) ;
//   • preuve & anti-fraude v4.110 : adresse IP (en-têtes), GPS
//     (optionnel, envoyé par l'invité) et SHA-256 du contenu
//     canonique du document stockés sur l'inspection.
// Sécurité : rate limit 5/min par token+IP ; token unique ; statut
// 'COMPLETED' refusé (déjà signé) ; transaction atomique ; never-throw.
// =============================================================

const PHOTO_MAX_BYTES = 500 * 1024; // 500 Ko par photo (binaire décodé)
const SIGNATURE_MAX_BYTES = 400 * 1024; // 400 Ko pour la signature

const STATE_ORDER: Record<string, number> = { TRES_BON: 0, BON: 1, MOYEN: 2, MAUVAIS: 3 };
const STATE_KEYS = ['TRES_BON', 'BON', 'MOYEN', 'MAUVAIS'] as const;

const photoSchema = z
  .string()
  .max(900_000, 'Photo trop volumineuse (500 Ko maximum).')
  .optional()
  .nullable();

const submitSchema = z.object({
  rooms: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        // Ignoré : recalculé côté serveur (pire état des items).
        globalState: z.string().optional(),
        comment: z.string().max(2000).optional().nullable(),
        items: z.array(
          z.object({
            id: z.string().min(1).max(64),
            state: z.enum(['TRES_BON', 'BON', 'MOYEN', 'MAUVAIS']),
            comment: z.string().max(2000).optional().nullable(),
            photoUrl: photoSchema,
            photoOnUrl: photoSchema,
            photoOffUrl: photoSchema,
          }),
        ),
      }),
    )
    .max(40),
  cleanliness: z.object({
    score: z.enum(['IMPECCABLE', 'CORRECT', 'A_NETTOYER', 'TRES_SALE']),
    comment: z.string().max(2000).optional().nullable(),
    photoUrl: photoSchema,
  }),
  guestSignature: z.string().max(700_000),
  approved: z.boolean(),
  // Position GPS de l'invité au moment de la signature (optionnelle,
  // format "14.7167° N, 17.4677° W") — jamais bloquante.
  gpsLocation: z.string().max(160).optional().nullable(),
});

/** Valide un dataURL image (jpeg/png) — message d'erreur FR si invalide. */
function validateDataUrl(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,([\s\S]+)$/);
  if (!match) return 'Format de photo invalide (image JPEG ou PNG attendue).';
  try {
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length === 0) return 'Photo vide.';
    if (bytes.length > PHOTO_MAX_BYTES) return 'Photo trop volumineuse (500 Ko maximum).';
    return null;
  } catch {
    return 'Photo illisible.';
  }
}

function bad(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  try {
    const { token } = await params;
    if (!token || typeof token !== 'string' || token.length < 6) {
      return bad('Lien invalide ou expiré.');
    }

    // Anti-abus : 5 signatures/min par token+IP.
    const ip = clientIp(req.headers) ?? 'local';
    if (!(await rateLimit(`inspsub:${token}:${ip}`, 5))) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Merci de patienter une minute.' },
        { status: 429 },
      );
    }

    // ── Corps JSON ──
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return bad('Requête invalide (JSON attendu).');
    }
    const parsed = submitSchema.safeParse(raw);
    if (!parsed.success) {
      return bad('Formulaire incomplet ou invalide. Merci de vérifier les champs signalés.');
    }
    const body = parsed.data;

    // ── Inspection par token ──
    const inspection = await db.inspection.findUnique({
      where: { publicToken: token },
      include: {
        rooms: {
          orderBy: { sortOrder: 'asc' },
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!inspection) {
      return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 404 });
    }
    if (inspection.status === 'COMPLETED') {
      return bad('Cet état des lieux a déjà été signé.');
    }

    // ── Approbation explicite obligatoire ──
    if (body.approved !== true) {
      return bad("Merci de cocher la case d'approbation avant de signer.");
    }

    // ── Signature : PNG dataURL ≤ 400 Ko ──
    if (!body.guestSignature.startsWith('data:image/png;base64,')) {
      return bad('Signature invalide (image PNG attendue).');
    }
    try {
      const sigBytes = Buffer.from(body.guestSignature.slice('data:image/png;base64,'.length), 'base64');
      if (sigBytes.length === 0) return bad('Signature vide — merci de signer dans le cadre.');
      if (sigBytes.length > SIGNATURE_MAX_BYTES) return bad('Signature trop volumineuse.');
    } catch {
      return bad('Signature illisible.');
    }

    // ── Photos : toutes validées (format + taille) ──
    for (const room of body.rooms) {
      for (const item of room.items) {
        if (item.photoUrl) {
          const err = validateDataUrl(item.photoUrl);
          if (err) return bad(err);
        }
        if (item.photoOnUrl) {
          const err = validateDataUrl(item.photoOnUrl);
          if (err) return bad(`Photo ON — ${err.charAt(0).toLowerCase()}${err.slice(1)}`);
        }
        if (item.photoOffUrl) {
          const err = validateDataUrl(item.photoOffUrl);
          if (err) return bad(`Photo OFF — ${err.charAt(0).toLowerCase()}${err.slice(1)}`);
        }
      }
    }
    let cleanPhoto = body.cleanliness.photoUrl ?? null;
    if (cleanPhoto) {
      const err = validateDataUrl(cleanPhoto);
      if (err) return bad(err);
    }

    // ── RÈGLE D'OR — MAUVAIS ⇒ commentaire + photo ; propreté dégradée ⇒ photo ──
    const payloadRooms = new Map(body.rooms.map((r) => [r.id, r]));
    for (const dbRoom of inspection.rooms) {
      const payloadRoom = payloadRooms.get(dbRoom.id);
      if (!payloadRoom) {
        return bad(`La pièce « ${dbRoom.name} » est manquante dans le formulaire.`);
      }
      const payloadItems = new Map(payloadRoom.items.map((i) => [i.id, i]));
      for (const dbItem of dbRoom.items) {
        const payloadItem = payloadItems.get(dbItem.id);
        if (!payloadItem) {
          return bad(`L'élément « ${dbItem.name} » (pièce « ${dbRoom.name} ») est manquant.`);
        }
        if (payloadItem.state === 'MAUVAIS') {
          if (!payloadItem.comment || !payloadItem.comment.trim()) {
            return bad(
              `Pièce « ${dbRoom.name} » — élément « ${dbItem.name} » : merci de décrire le constat observé.`,
            );
          }
          if (!payloadItem.photoUrl) {
            return bad(
              `Pièce « ${dbRoom.name} » — élément « ${dbItem.name} » : merci de joindre une photographie du défaut.`,
            );
          }
        }
      }
    }
    if (
      (body.cleanliness.score === 'A_NETTOYER' || body.cleanliness.score === 'TRES_SALE') &&
      !cleanPhoto
    ) {
      return bad(
        'Propreté générale : une photographie est obligatoire pour justifier un logement à nettoyer ou très sale.',
      );
    }

    // ── Transaction atomique : items → rooms (état recalculé) → inspection ──
    const now = new Date();
    await db.$transaction(async (tx) => {
      for (const dbRoom of inspection.rooms) {
        const payloadRoom = payloadRooms.get(dbRoom.id);
        if (!payloadRoom) continue; // déjà validé ci-dessus

        const payloadItems = new Map(payloadRoom.items.map((i) => [i.id, i]));
        let worstRank = 0; // TRES_BON par défaut
        for (const dbItem of dbRoom.items) {
          const payloadItem = payloadItems.get(dbItem.id);
          if (!payloadItem) continue; // déjà validé ci-dessus
          // Preuves ON/OFF : réservées aux appareils électroniques
          // (garde serveur sur le NOM en base, jamais sur le payload).
          const electronic = isElectronicItem(dbItem.name);
          await tx.inspectionItem.update({
            where: { id: dbItem.id },
            data: {
              state: payloadItem.state,
              comment: payloadItem.comment?.trim() ? payloadItem.comment.trim() : null,
              photoUrl: payloadItem.photoUrl ?? null,
              photoOnUrl: electronic ? payloadItem.photoOnUrl ?? null : null,
              photoOffUrl: electronic ? payloadItem.photoOffUrl ?? null : null,
            },
          });
          const rank = STATE_ORDER[payloadItem.state] ?? 1;
          if (rank > worstRank) worstRank = rank;
        }

        // globalState RECALCULÉ serveur = pire état des items (client ignoré).
        await tx.inspectionRoom.update({
          where: { id: dbRoom.id },
          data: {
            globalState: STATE_KEYS[worstRank],
            comment: payloadRoom.comment?.trim() ? payloadRoom.comment.trim() : null,
          },
        });
      }

      await tx.inspection.update({
        where: { id: inspection.id },
        data: {
          cleanlinessScore: body.cleanliness.score,
          cleanlinessComment: body.cleanliness.comment?.trim() ? body.cleanliness.comment.trim() : null,
          cleanlinessPhotoUrl: cleanPhoto,
          guestSignature: body.guestSignature,
          signedAt: now,
          completedAt: now,
          status: 'COMPLETED',
        },
      });
    });

    // ── Empreinte SHA-256 (v4.110) + preuve IP/GPS ──
    // L'empreinte est RECALCULÉE depuis la base (état final figé)
    // pour coïncider exactement avec le hash recalculé au rendu
    // PDF, puis stockée avec l'IP (en-têtes) et le GPS (optionnel,
    // envoyé par l'invité). Jamais levant : une erreur d'empreinte
    // ne doit pas faire échouer une signature valide.
    try {
      const finalState = await db.inspection.findUnique({
        where: { id: inspection.id },
        select: {
          publicToken: true,
          propertyName: true,
          propertyAddress: true,
          ownerName: true,
          guestName: true,
          type: true,
          scheduledDate: true,
          status: true,
          signedAt: true,
          cleanlinessScore: true,
          cleanlinessComment: true,
          cleanlinessPhotoUrl: true,
          guestSignature: true,
          rooms: {
            orderBy: { sortOrder: 'asc' },
            select: {
              name: true,
              globalState: true,
              comment: true,
              items: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  name: true,
                  state: true,
                  comment: true,
                  photoUrl: true,
                  photoOnUrl: true,
                  photoOffUrl: true,
                },
              },
            },
          },
        },
      });
      if (finalState) {
        await db.inspection.update({
          where: { id: inspection.id },
          data: {
            sha256Hash: computeInspectionSha256(finalState),
            ipAddress: clientIp(req.headers) ?? null,
            gpsLocation: body.gpsLocation?.trim() ? body.gpsLocation.trim() : null,
          },
        });
      }
    } catch {
      // ignorer — l'empreinte est un plus, jamais un bloqueur.
    }

    // v4.103 — Email de confirmation HÔTE : le document est signé
    // (lien PDF direct). Fire-and-forget : la file EmailOutbox
    // journalise puis tente le SMTP — jamais bloquant, jamais levant.
    void sendInspectionCompletedEmail(
      {
        propertyName: inspection.propertyName,
        propertyAddress: inspection.propertyAddress,
        ownerName: inspection.ownerName,
        guestName: inspection.guestName,
        guestEmail: inspection.guestEmail,
        type: inspection.type,
        scheduledDate: inspection.scheduledDate,
        publicToken: inspection.publicToken,
        subscriptionId: inspection.subscriptionId,
      },
      now,
    ).catch(() => undefined);

    return NextResponse.json({ ok: true, completedAt: now.toISOString() });
  } catch (error) {
    captureError('inspection.public_submit', error);
    return NextResponse.json(
      { error: 'Erreur inattendue lors de la signature. Merci de réessayer.' },
      { status: 500 },
    );
  }
}
