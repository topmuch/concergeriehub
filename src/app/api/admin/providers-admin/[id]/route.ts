// =============================================================
// /api/admin/providers-admin/[id] — ÉTAPE 9
//
// GET    : documents de vérification d'un prestataire + état du
//          badge (FIX-4 — alimente la section « Documents de
//          vérification » de la fiche Superadmin ; la liste
//          GET /api/admin/providers-admin n'expose pas ce JSON).
// PATCH  : modification d'un prestataire (géoloc, audience,
//          statut actif/inactif, champs métier).
//          + FIX-4 (AUD-FULL ⑤) : action 'review-document' —
//          review d'un document de vérification (Kbis/assurance)
//          avec pilotage automatique du badge isVerified.
// DELETE : suppression — supprime le Provider ET le User porteur
//          en transaction (les demandes de service liées partent
//          en cascade).
//
// 🔒 Réservé au Superadmin (role 'superadmin').
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import { db } from '@/lib/db';
import { PROVIDER_AUDIENCES } from '@/lib/b2b';
import { logAudit, clientIp } from '@/lib/audit';

// ---------- FIX-4 : convention documents de vérification ----------
// (identique à /api/provider/documents)
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

interface UpdateBody {
  // --- action spéciale FIX-4 (review d'un document) ---
  action?: string;
  documentId?: string;
  decision?: string;
  // --- champs classiques (ÉTAPE 9, inchangés) ---
  businessName?: string;
  category?: string;
  subcategory?: string | null;
  description?: string | null;
  location?: string | null;
  latitude?: number | string;
  longitude?: number | string;
  serviceRadiusKm?: number | string;
  audience?: string;
  hourlyRate?: number | string | null;
  isUrgentAvailable?: boolean;
  isVerified?: boolean;
  isActive?: boolean;
  portfolioImages?: string[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { id } = await params;
    const provider = await db.provider.findUnique({
      where: { id },
      select: { id: true, isVerified: true, verificationDocuments: true },
    });
    if (!provider) {
      return NextResponse.json({ error: 'Prestataire introuvable' }, { status: 404 });
    }
    return NextResponse.json({
      isVerified: provider.isVerified,
      documents: parseVerificationDocuments(provider.verificationDocuments),
    });
  } catch (error) {
    console.error('[GET /api/admin/providers-admin/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/** FIX-4 — review d'un document de vérification (action PATCH dédiée).
 *  Met à jour le status du document DANS le JSON (reste intact), puis
 *  applique la règle badge : décision REJECTED → isVerified false ;
 *  décision VERIFIED et tous les documents validés → isVerified true.
 *  Les actions classiques (champs, isVerified toggle…) restent inchangées. */
async function handleReviewDocument(
  req: NextRequest,
  admin: { id: string; email: string; name: string | null },
  id: string,
  body: UpdateBody
) {
  const documentId = typeof body.documentId === 'string' ? body.documentId.trim() : '';
  const decision = body.decision;
  if (!documentId) {
    return NextResponse.json({ error: 'Identifiant de document manquant' }, { status: 400 });
  }
  if (decision !== 'VERIFIED' && decision !== 'REJECTED') {
    return NextResponse.json({ error: 'Décision invalide (VERIFIED ou REJECTED)' }, { status: 400 });
  }

  const provider = await db.provider.findUnique({
    where: { id },
    select: { id: true, verificationDocuments: true },
  });
  if (!provider) {
    return NextResponse.json({ error: 'Prestataire introuvable' }, { status: 404 });
  }

  const documents = parseVerificationDocuments(provider.verificationDocuments);
  const doc = documents.find((d) => d.id === documentId);
  if (!doc) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
  }

  // Mise à jour du status du document seul — le reste du JSON est intact
  doc.status = decision as DocumentStatus;

  // Règle badge : REJECTED → false ; VERIFIED + aucun PENDING/REJECTED
  // (≥1 document garanti ici) → true ; sinon on ne touche pas au badge.
  const allVerified = documents.every((d) => d.status === 'VERIFIED');
  const data: Record<string, unknown> = {
    verificationDocuments: JSON.stringify(documents),
  };
  if (decision === 'REJECTED') {
    data.isVerified = false;
  } else if (allVerified) {
    data.isVerified = true;
  }

  const updated = await db.provider.update({ where: { id }, data, select: { isVerified: true } });

  await logAudit({
    actor: admin,
    action: 'provider.document.review',
    entityType: 'provider',
    entityId: id,
    details: {
      documentId,
      decision,
      kind: doc.kind,
      name: doc.name,
      documentsCount: documents.length,
    },
    ip: clientIp(req.headers),
  });

  return NextResponse.json({ ok: true, documents, isVerified: updated.isVerified });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { id } = await params;
    const existing = await db.provider.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: 'Prestataire introuvable' }, { status: 404 });
    }

    const body = (await req.json()) as UpdateBody;

    // --- FIX-4 : action 'review-document' (branche dédiée, court-circuit) ---
    if (body.action === 'review-document') {
      return await handleReviewDocument(req, admin, id, body);
    }

    const data: Record<string, unknown> = {};

    if (body.businessName !== undefined) {
      const name = body.businessName.trim();
      if (name.length < 2) {
        return NextResponse.json({ error: 'Nom trop court' }, { status: 400 });
      }
      data.businessName = name;
    }
    if (body.category !== undefined) data.category = body.category;
    if (body.subcategory !== undefined) data.subcategory = body.subcategory?.trim() || null;
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.location !== undefined) data.location = body.location?.trim() || null;

    if (body.latitude !== undefined) {
      const lat = Number(body.latitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        return NextResponse.json({ error: 'Latitude invalide' }, { status: 400 });
      }
      data.latitude = lat;
    }
    if (body.longitude !== undefined) {
      const lng = Number(body.longitude);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        return NextResponse.json({ error: 'Longitude invalide' }, { status: 400 });
      }
      data.longitude = lng;
    }
    if (body.serviceRadiusKm !== undefined) {
      data.serviceRadiusKm = Math.min(Math.max(Math.round(Number(body.serviceRadiusKm) || 10), 1), 200);
    }
    if (body.audience !== undefined) {
      if (!PROVIDER_AUDIENCES.includes(body.audience as never)) {
        return NextResponse.json({ error: 'Audience invalide' }, { status: 400 });
      }
      data.audience = body.audience;
    }
    if (body.hourlyRate !== undefined) {
      data.hourlyRate =
        body.hourlyRate === null || body.hourlyRate === ''
          ? null
          : Math.max(0, Number(body.hourlyRate) || 0);
    }
    if (body.isUrgentAvailable !== undefined) data.isUrgentAvailable = body.isUrgentAvailable;
    if (body.isVerified !== undefined) data.isVerified = body.isVerified;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.portfolioImages !== undefined) {
      data.portfolioImages = JSON.stringify(
        Array.isArray(body.portfolioImages) ? body.portfolioImages.slice(0, 6) : [],
      );
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Aucune modification fournie' }, { status: 400 });
    }

    await db.provider.update({ where: { id }, data });
    await logAudit({
      actor: admin,
      action: 'provider.update',
      entityType: 'provider',
      entityId: id,
      details: data,
      ip: clientIp(req.headers),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[PATCH /api/admin/providers-admin/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const { id } = await params;
    const provider = await db.provider.findUnique({
      where: { id },
      select: { id: true, userId: true, businessName: true },
    });
    if (!provider) {
      return NextResponse.json({ error: 'Prestataire introuvable' }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      await tx.provider.delete({ where: { id: provider.id } });
      await tx.user.delete({ where: { id: provider.userId } });
    });

    await logAudit({
      actor: admin,
      action: 'provider.delete',
      entityType: 'provider',
      entityId: provider.id,
      details: { businessName: provider.businessName },
      ip: clientIp(_req.headers),
    });

    return NextResponse.json({ ok: true, deleted: provider.businessName });
  } catch (error) {
    console.error('[DELETE /api/admin/providers-admin/[id]] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
