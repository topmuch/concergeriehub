// =============================================================
// FIX-4 (AUD-FULL action ⑤) — Workflow documents de vérification
//
//   GET  /api/provider/documents
//     → documents du prestataire connecté + état du badge.
//       Identité résolue SERVEUR : session NextAuth → User.providerProfile
//       (même pattern que /api/provider/service-orders — l'ID n'est
//       JAMAIS pris du client). 401 sans session, 404 sans profil.
//
//   POST /api/provider/documents   (multipart formData : 'file' + 'kind')
//     → upload Kbis / Assurance / Autre avec garde-fous :
//       · allowlist MIME stricte (pdf, jpeg, png, webp)
//       · 5 Mo max — vérifié sur la taille RÉELLE du fichier (file.size)
//       · 5 documents max par prestataire (409 au-delà)
//       · kind ∈ {KBIS, ASSURANCE, OTHER} sinon 400
//       · nom de fichier GÉNÉRÉ SERVEUR : `${providerId}-${random}.${ext}`
//         ext dérivée de la allowlist (jamais du client → anti
//         path-traversal) + basename() avant écriture
//       · stockage public/uploads/verification/ (mkdir recursive)
//       · ajout au JSON verificationDocuments avec status 'PENDING'
//
// Convention de stockage (partagée avec la review Superadmin dans
// /api/admin/providers-admin/[id]) :
//   verificationDocuments = JSON.stringify(Array<{
//     id: string; kind: 'KBIS'|'ASSURANCE'|'OTHER'; name: string;
//     url: string; uploadedAt: string; status: 'PENDING'|'VERIFIED'|'REJECTED';
//   }>)
//
// Règle badge (appliquée à la REVIEW, pas à l'upload) : ≥1 document
// ET aucun PENDING/REJECTED → isVerified: true ; un REJECTED → false.
// Never-throw : try/catch global → { error } 500.
// =============================================================
import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { getServerSession } from 'next-auth';
import crypto from 'crypto';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'verification');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo — contrôle sur file.size (taille réelle)
const MAX_DOCUMENTS = 5;

// SÉCURITÉ : allowlist MIME stricte. L'extension du fichier est dérivée
// du MIME détecté (jamais du nom envoyé par le client) — chaque valeur
// appartient à la allowlist { pdf, jpg, jpeg, png, webp }.
const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const ALLOWED_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);

type DocumentKind = 'KBIS' | 'ASSURANCE' | 'OTHER';
type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

interface VerificationDocument {
  id: string;
  kind: DocumentKind;
  name: string;
  url: string;
  uploadedAt: string;
  status: DocumentStatus;
}

const DOCUMENT_KINDS: DocumentKind[] = ['KBIS', 'ASSURANCE', 'OTHER'];
const DOCUMENT_STATUSES: DocumentStatus[] = ['PENDING', 'VERIFIED', 'REJECTED'];

/** Parse défensif du JSON-as-string (champ Provider.verificationDocuments).
 *  Les entrées incomplètes/corrompues sont ignorées, jamais throw. */
function parseVerificationDocuments(raw: string | null | undefined): VerificationDocument[] {
  try {
    const arr = JSON.parse(raw ?? '[]') as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((d): d is VerificationDocument => {
      if (typeof d !== 'object' || d === null) return false;
      const doc = d as Partial<VerificationDocument>;
      return (
        typeof doc.id === 'string' &&
        DOCUMENT_KINDS.includes(doc.kind as DocumentKind) &&
        typeof doc.name === 'string' &&
        typeof doc.url === 'string' &&
        typeof doc.uploadedAt === 'string' &&
        DOCUMENT_STATUSES.includes(doc.status as DocumentStatus)
      );
    });
  } catch {
    return [];
  }
}

// -------------------------------------------------------------
// GET — documents du prestataire connecté (lecture seule, même
// pour un compte désactivé : sa page portail est déjà bloquée).
// -------------------------------------------------------------
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
    }

    const provider = await db.provider.findUnique({
      where: { userId },
      select: { id: true, isVerified: true, verificationDocuments: true },
    });
    if (!provider) {
      return NextResponse.json(
        { error: 'Aucun profil prestataire pour ce compte.' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      documents: parseVerificationDocuments(provider.verificationDocuments),
      isVerified: provider.isVerified,
    });
  } catch (error) {
    console.error('[provider/documents GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez.' }, { status: 500 });
  }
}

// -------------------------------------------------------------
// POST — upload d'un document de vérification (multipart).
// -------------------------------------------------------------
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
    }

    const provider = await db.provider.findUnique({
      where: { userId },
      select: { id: true, isActive: true, verificationDocuments: true },
    });
    if (!provider) {
      return NextResponse.json(
        { error: 'Aucun profil prestataire pour ce compte.' },
        { status: 404 },
      );
    }
    if (!provider.isActive) {
      return NextResponse.json(
        { error: 'Compte prestataire désactivé — upload impossible.' },
        { status: 403 },
      );
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: 'Requête invalide (multipart attendu).' }, { status: 400 });
    }

    const file = formData.get('file');
    const kind = formData.get('kind');

    // ---- Garde-fous (dans l'ordre : kind → MIME → taille → quota) ----
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Fichier requis.' }, { status: 400 });
    }
    if (typeof kind !== 'string' || !DOCUMENT_KINDS.includes(kind as DocumentKind)) {
      return NextResponse.json(
        { error: 'Type de document invalide (KBIS, ASSURANCE ou OTHER).' },
        { status: 400 },
      );
    }
    // Allowlist MIME stricte → extension ∈ allowlist (anti path-traversal)
    const ext = MIME_TO_EXT[file.type];
    if (!ext || !ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { error: 'Format non supporté (PDF, JPG, PNG ou WebP uniquement).' },
        { status: 415 },
      );
    }
    // Taille réelle du fichier (file.size), pas un en-tête client
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 5 Mo).' }, { status: 413 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Fichier vide.' }, { status: 400 });
    }

    const documents = parseVerificationDocuments(provider.verificationDocuments);
    if (documents.length >= MAX_DOCUMENTS) {
      return NextResponse.json(
        { error: `Limite de ${MAX_DOCUMENTS} documents atteinte.` },
        { status: 409 },
      );
    }

    // ---- Stockage : nom GÉNÉRÉ SERVEUR, ext issue de la allowlist ----
    await mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${provider.id}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const filePath = join(UPLOAD_DIR, basename(filename));
    const bytes = new Uint8Array(await file.arrayBuffer());
    await writeFile(filePath, bytes);

    const doc: VerificationDocument = {
      id: crypto.randomUUID(),
      kind: kind as DocumentKind,
      // Nom d'affichage uniquement (tronqué) — JAMAIS utilisé pour le chemin
      name: file.name?.trim() ? file.name.trim().slice(0, 120) : `document.${ext}`,
      url: `/uploads/verification/${filename}`,
      uploadedAt: new Date().toISOString(),
      status: 'PENDING', // review par le Superadmin → /api/admin/providers-admin/[id]
    };

    const updated = await db.provider.update({
      where: { id: provider.id },
      data: { verificationDocuments: JSON.stringify([...documents, doc]) },
      select: { isVerified: true },
    });

    return NextResponse.json(
      { ok: true, document: doc, documents: [...documents, doc], isVerified: updated.isVerified },
      { status: 201 },
    );
  } catch (error) {
    console.error('[provider/documents POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur. Réessayez.' }, { status: 500 });
  }
}
