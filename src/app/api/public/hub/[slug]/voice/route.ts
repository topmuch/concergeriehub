import { NextResponse } from 'next/server';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join, basename } from 'path';
import { db } from '@/lib/db';
import { dispatchWebhooks } from '@/lib/webhook-dispatcher';
import crypto from 'crypto';
import { compare } from 'bcryptjs';
import { rateLimit } from '@/lib/rate-limit';
// FIX-14 — monitoring d'erreurs : trace AuditLog (action='runtime.error').
import { captureError } from '@/lib/error-monitor';
// FIX-15 (C) — zod sur les champs texte du FormData + clientIp (rate-limit IP-scopé).
import { z } from 'zod';
import { clientIp } from '@/lib/audit';
// WP-BACK v4.61 — EMAIL hôte : un vocal invité (« Contacter l'hôte ») notifie
// désormais l'hôte (et managers) PAR EMAIL en plus du webhook doorbell,
// même convention que la route complaint (template hub_alert structuré).
import {
  sendNotificationToMany,
  propertyOwnerAndManagers,
} from '@/lib/notifications';
import { renderHubAlertEmail } from '@/lib/email-template-render';

const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads', 'voice');
// Répertoire historique (public/uploads/voice) : non utilisé en écriture
// (non servi en standalone + non persistant en Docker) mais conservé en
// lecture par la route /api/uploads/voice/[file] pour les anciens fichiers.
const MAX_DURATION_SEC = 30;
// FIX-32 : 500 Ko était limite pour 30 s en audio/mp4 (Safari/iOS AAC).
// 1 Mo garde une marge confortable pour un vocal de 30 s.
const MAX_FILE_SIZE_KB = 1024; // ~1MB for 30s webm/mp4
// v4.32 « AUDIO DURABLE » — plafond pour la copie dataURL EN BASE
// v4.35 « VOCAL ILLISIBLE » — le plafond dataURL (500 Ko) était INFÉRIEUR
// au plafond fichier (1 Mo) : un vocal de 500 Ko–1 Mo partait SANS copie
// en base → lecture 100 % dépendante du fichier disque (perdu au
// redéploiement Docker) → « le propriétaire ne peut pas écouter le
// vocal ». Aligné sur MAX_FILE_SIZE_KB : TOUT vocal uploadé a désormais
// sa copie base64 en base (SQLite TEXT : sans limite pratique ici).
const MAX_AUDIO_DATA_KB = 1024;

// SÉCURITÉ : allowlist stricte des extensions — empêche tout path traversal
// (l'extension client n'est JAMAIS concaténée telle quelle).
const ALLOWED_AUDIO_EXT = new Set(['webm', 'ogg', 'mp3', 'm4a', 'wav']);

// FIX-15 (C) — zod sur les champs TEXTE du FormData. Le fichier audio reste
// validé manuellement ci-dessous (type MIME + taille réelle du fichier :
// contraintes binaires hors périmètre zod propre). senderName/durationSec
// doivent être des chaînes — avant, un champ non-texte provoquait un 500.
const DEMO_SLUG = 'demo-hub';
const isDemo = (slug: string) => slug === DEMO_SLUG;

const voiceFormSchema = z.object({
  senderName: z.string().optional(),
  durationSec: z.string().optional(),
  // v4.77 « MESSAGERIE THREADÉE » — id du vocal HÔTE auquel l'invité
  // répond (bouton « 🎙️ Répondre » de l'onglet Messages). Validé
  // manuellement après résolution du bien (existe + même bien + hôte).
  replyToVoiceId: z.string().optional(),
});

// POST: Upload a voice message for a hub
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    // FIX-15 (B) — Anti-spam par IP (10 messages/min) ; le quota slug global
    // serait un vecteur de DoS : un tiers pouvait épuiser `voice:<slug>`
    // et bloquer les messages vocaux des invités légitimes.
    if (!(await rateLimit(`voice:${slug}:${clientIp(req.headers) ?? 'local'}`, 10))) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }
    const formData = await req.formData();
    const audio = formData.get('audio') as File | null;
    // FIX-15 (C) — validation zod des champs texte du formulaire (400 si
    // champ non-texte ; comportement des clients valides inchangé).
    const parsedForm = voiceFormSchema.safeParse({
      senderName: formData.get('senderName') ?? undefined,
      durationSec: formData.get('durationSec') ?? undefined,
      replyToVoiceId: formData.get('replyToVoiceId') ?? undefined,
    });
    if (!parsedForm.success) {
      return NextResponse.json({ error: 'Formulaire invalide.' }, { status: 400 });
    }
    const senderName = parsedForm.data.senderName || 'Invité';
    const durationSec = parseInt(parsedForm.data.durationSec ?? '', 10) || 0;

    // Validate
    if (!audio) {
      return NextResponse.json({ error: 'Fichier audio requis' }, { status: 400 });
    }
    if (!audio.type.startsWith('audio/')) {
      return NextResponse.json({ error: 'Format audio uniquement' }, { status: 400 });
    }
    const fileSizeKb = Math.round(audio.size / 1024);
    // FIX (AUD-FULL) : la limite effective est MAX_FILE_SIZE_KB (500 Ko),
    // l'ancien `* 10` autorisait 5 Mo malgré la doc.
    if (fileSizeKb > MAX_FILE_SIZE_KB) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 1 Mo)' }, { status: 400 });
    }
    if (durationSec > MAX_DURATION_SEC) {
      return NextResponse.json({ error: `Max ${MAX_DURATION_SEC} secondes` }, { status: 400 });
    }

    // Find the home via hubSlug (plaque V1) OU qrHubSlug du bien (ÉTAPE 12/16 —
    // l'app invitée PWA poste avec le slug du bien)
    const plaque = await db.physicalQrCode.findUnique({
      where: { hubSlug: slug },
      select: { propertyId: true, isClaimed: true },
    });
    let resolvedPropertyId: string | null =
      plaque && plaque.isClaimed && plaque.propertyId ? plaque.propertyId : null;
    if (!resolvedPropertyId && !plaque) {
      const propertyBySlug = await db.property.findUnique({
        where: { qrHubSlug: slug },
        select: { id: true, isActive: true },
      });
      if (propertyBySlug?.isActive) resolvedPropertyId = propertyBySlug.id;
    }
    if (!resolvedPropertyId) {
      // v4.32 — bypass démo aligné sur la route complaint : le hub de
      // démonstration accepte l'envoi (succès sans écriture) au lieu
      // d'un 404 qui faisait « ne marche pas » pour tout le flux vocal.
      if (isDemo(slug)) {
        return NextResponse.json({
          success: true,
          id: `demo-voice-${Date.now()}`,
          message: 'Message envoyé (mode démo).',
        }, { status: 201 });
      }
      return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
    }
    const propertyId = resolvedPropertyId;

    // ── v4.77 « MESSAGERIE THREADÉE » — validation du vocal HÔTE auquel
    // l'invité répond : il doit exister, appartenir à CE bien et être un
    // vocal hôte (jamais le vocal d'un autre invité — vie privée).
    const rawReplyTo = parsedForm.data.replyToVoiceId?.trim() || '';
    let replyToId: string | null = null;
    if (rawReplyTo) {
      if (!/^[A-Za-z0-9_-]{6,60}$/.test(rawReplyTo)) {
        return NextResponse.json({ error: 'Référence de réponse invalide.' }, { status: 400 });
      }
      const target = await db.voiceMessage.findFirst({
        where: { id: rawReplyTo, propertyId, senderType: { in: ['HOST', 'host'] } },
        select: { id: true },
      });
      if (!target) {
        return NextResponse.json({ error: 'Vocal introuvable — réponse impossible.' }, { status: 404 });
      }
      replyToId = target.id;
    }

    // Ensure upload dir exists
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Generate unique filename — extension issue d'une allowlist, jamais du client
    const clientExt = (audio.name?.split('.').pop() || '').toLowerCase();
    const ext = ALLOWED_AUDIO_EXT.has(clientExt) ? clientExt : 'webm';
    const filename = `${propertyId}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const filePath = join(UPLOAD_DIR, basename(filename));

    // Save file
    const bytes = new Uint8Array(await audio.arrayBuffer());
    await writeFile(filePath, bytes);

    // v4.32 « AUDIO DURABLE » — copie base64 EN BASE : la lecture du
    // dashboard / mode hôte privilégie audioData (voicePlaybackSrc) et
    // survit aux redéploiements où le fichier disque disparaissait.
    const audioData =
      fileSizeKb <= MAX_AUDIO_DATA_KB
        ? `data:${audio.type.split(';')[0].trim() || 'audio/webm'};base64,${Buffer.from(bytes).toString('base64')}`
        : null;

    // Create DB record
    const voiceMsg = await db.voiceMessage.create({
      data: {
        propertyId: propertyId,
        senderName: senderName.trim().slice(0, 50),
        senderType: 'guest',
        audioUrl: `/uploads/voice/${filename}`,
        audioData,
        durationSec: Math.min(durationSec, MAX_DURATION_SEC),
        fileSizeKb,
        // v4.77 — réponse threadée au vocal hôte (null = message libre).
        ...(replyToId ? { replyToId } : {}),
      },
    });

    // AUDIT PRÉ-PROD (Module 5) — WEBHOOK SORTANT 'doorbell' (HMAC) :
    // message vocal invité = sonnette du Hub. Dispatcher branché.
    void dispatchWebhooks(propertyId, 'doorbell', {
      event: 'voice_message.created',
      voiceMessageId: voiceMsg.id,
      senderName: senderName.trim().slice(0, 50),
      durationSec: voiceMsg.durationSec,
    });

    // ── WP-BACK v4.61 — EMAIL + cloche hôte (fire-and-forget, jamais
    // bloquant pour la réponse invité). Le vocal invité était notifié
    // uniquement via le webhook doorbell + la liste du Mode Hôte : l'hôte
    // ne recevait AUCUN email. Convention identique à la route complaint :
    // template hub_alert structuré + audience OWNER + managers. ──
    try {
      const propertyRow = await db.property.findUnique({
        where: { id: propertyId },
        select: { name: true },
      });
      const propertyName = propertyRow?.name ?? 'Votre logement';
      const receivedAtLabel = new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(voiceMsg.createdAt);
      const guestLabel = senderName.trim().slice(0, 50);
      const hubEmail = await renderHubAlertEmail({
        heading: '🎙️ Nouveau message vocal',
        propertyName,
        guestName: guestLabel,
        rows: [
          { label: 'De', value: guestLabel },
          { label: 'Durée', value: `${voiceMsg.durationSec} s` },
          { label: 'Reçu le', value: receivedAtLabel },
        ],
        introNote: 'Un invité vous a laissé un message vocal depuis le hub — répondez vite, un invité écouté est un invité rassuré.',
        ctaLabel: 'Écouter dans la messagerie',
        ctaUrl: '/airbnb/messages',
        footerNote: 'Email envoyé automatiquement depuis le Hub invité.',
      });
      const audience = await propertyOwnerAndManagers(propertyId);
      if (audience.length > 0) {
        await sendNotificationToMany(audience, 'voice_message', {
          title: '🎙️ Nouveau message vocal',
          body: `Un invité vous a laissé un message vocal (${voiceMsg.durationSec} s) depuis le hub — ${propertyName}.`,
          propertyId,
          propertyName,
          url: '/airbnb/messages',
          email: {
            subject: `🎙️ Nouveau message vocal — ${propertyName}`,
            html: hubEmail.html,
            text: hubEmail.text,
          },
          meta: { source: 'hub', voiceMessageId: voiceMsg.id, hubSlug: slug },
        });
      }
    } catch (error) {
      // Jamais bloquant : un échec de notification n'invalide pas le vocal.
      console.error('[voice] notification hôte failed:', error);
    }

    return NextResponse.json({
      success: true,
      id: voiceMsg.id,
      audioUrl: voiceMsg.audioUrl,
      durationSec: voiceMsg.durationSec,
      createdAt: voiceMsg.createdAt,
    }, { status: 201 });
  } catch (error) {
    // FIX-14 — captureError console.error + trace AuditLog, ne jette jamais.
    await captureError('hub.voice.upload', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// GET: List voice messages for a hub — RÉSERVÉ À L'HÔTE (AUD-FULL/FIX-1) :
// PIN bcrypt obligatoire (fail-closed) car les messages contiennent la voix
// des invités. Résolution double plaque V1 / property.qrHubSlug (É12).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const url = new URL(req.url);
    const parsedLimit = parseInt(url.searchParams.get('limit') || '20', 10);
    const limit = Math.min(Number.isFinite(parsedLimit) ? parsedLimit : 20, 50) || 20;
    // v4.76 — le PIN arrive dans le header `x-hub-pin` (jamais loggé par
    // les serveurs/proxies) ; repli query pour compat ascendante.
    const pin = req.headers.get('x-hub-pin') || url.searchParams.get('pin') || '';

    // ── Résolution du bien : plaque V1 OU hub du bien (property.qrHubSlug) ──
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
      if (!propertyBySlug) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      if (!propertyBySlug.isActive) {
        return NextResponse.json({ error: 'Ce bien a été désactivé par son hôte.' }, { status: 410 });
      }
      propertyId = propertyBySlug.id;
    }

    // ── Garde PIN (FAIL-CLOSED) : sans PIN configuré, accès refusé ──
    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { id: true, pinHash: true },
    });
    if (!property) {
      return NextResponse.json({ error: 'Logement non trouvé' }, { status: 404 });
    }
    if (!property.pinHash) {
      return NextResponse.json(
        { error: "Aucun PIN n'est configuré pour ce logement." },
        { status: 403 },
      );
    }
    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN requis (4 chiffres)' }, { status: 400 });
    }
    // FIX-15 (B) — Anti brute-force par IP (10 tentatives/min) ; le quota
    // slug global serait un vecteur de DoS du mode hôte : un tiers pouvait
    // épuiser `hubvoicepin:<slug>` et verrouiller l'hôte légitime.
    if (!(await rateLimit(`hubvoicepin:${slug}:${clientIp(req.headers) ?? 'local'}`, 10))) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }
    const isValid = await compare(pin, property.pinHash);
    if (!isValid) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 });
    }

    const messages = await db.voiceMessage.findMany({
      where: { propertyId: property.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        senderName: true,
        senderType: true,
        audioUrl: true,
        // v4.35 « VOCAL ILLISIBLE » — la copie dataURL DOIT voyager vers
        // le Mode Hôte du hub : sans elle, la lecture retombait sur le
        // fichier disque (404 après redéploiement) → vocaux injouables.
        audioData: true,
        durationSec: true,
        fileSizeKb: true,
        isRead: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    // FIX-14 — captureError console.error + trace AuditLog, ne jette jamais.
    await captureError('hub.voice.list', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/** Supprime le fichier disque d'un vocal (data/uploads/voice/<fichier>)
 *  — best-effort try/catch : l'audio vit aussi en base (audioData v4.32),
 *  un fichier absent ne doit JAMAIS faire échouer la suppression. */
async function unlinkVoiceFileSafely(audioUrl: string | null | undefined): Promise<void> {
  if (!audioUrl) return;
  try {
    // audioUrl = '/uploads/voice/<fichier>' — basename seul (allowlist
    // path traversal : jamais concaténer une chaîne client telle quelle).
    const filename = basename(audioUrl);
    if (!filename || filename.includes('/')) return;
    await unlink(join(UPLOAD_DIR, filename));
  } catch {
    /* fichier déjà absent ou non supprimable — suppression DB quand même */
  }
}

// DELETE ?id=&pin= — Suppression d'un vocal PAR L'HÔTE depuis le MODE
// HÔTE du hub (même garde que le GET : PIN bcrypt 4 chiffres FAIL-CLOSED,
// rate-limit anti brute-force). Le vocal doit appartenir au bien résolu ;
// la ligne DB ET le fichier disque (si présent) sont supprimés.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const url = new URL(req.url);
    const id = (url.searchParams.get('id') || '').trim();
    // v4.76 — PIN en header `x-hub-pin` (jamais loggé) ; repli query compat.
    const pin = req.headers.get('x-hub-pin') || url.searchParams.get('pin') || '';

    if (!id || !pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'Paramètres invalides (id et PIN requis)' }, { status: 400 });
    }

    // ── Résolution du bien : identique au GET (plaque V1 OU qrHubSlug) ──
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
      if (!propertyBySlug) {
        return NextResponse.json({ error: 'Hub non trouvé' }, { status: 404 });
      }
      if (!propertyBySlug.isActive) {
        return NextResponse.json({ error: 'Ce bien a été désactivé par son hôte.' }, { status: 410 });
      }
      propertyId = propertyBySlug.id;
    }

    // ── Garde PIN (FAIL-CLOSED) + anti brute-force, mêmes clés que GET ──
    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { id: true, pinHash: true },
    });
    if (!property?.pinHash) {
      return NextResponse.json(
        { error: "Aucun PIN n'est configuré pour ce logement." },
        { status: 403 },
      );
    }
    if (!(await rateLimit(`hubvoicepin:${slug}:${clientIp(req.headers) ?? 'local'}`, 10))) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }
    const isValid = await compare(pin, property.pinHash);
    if (!isValid) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 });
    }

    // Le vocal DOIT appartenir au bien résolu (jamais supprimer chez le voisin).
    const voiceMsg = await db.voiceMessage.findFirst({
      where: { id, propertyId: property.id },
      select: { id: true, audioUrl: true },
    });
    if (!voiceMsg) {
      return NextResponse.json({ error: 'Message vocal introuvable' }, { status: 404 });
    }

    await db.voiceMessage.delete({ where: { id: voiceMsg.id } });
    await unlinkVoiceFileSafely(voiceMsg.audioUrl);

    return NextResponse.json({ ok: true });
  } catch (error) {
    // FIX-14 — captureError console.error + trace AuditLog, ne jette jamais.
    await captureError('hub.voice.delete', error, undefined, req);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
