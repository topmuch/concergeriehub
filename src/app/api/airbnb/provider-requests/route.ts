// =============================================================
// POST /api/airbnb/provider-requests — Dashboard Client (H4-T4c)
//
// « Demander un prestataire » : crée un SupportTicket RÉEL,
// visible par le superadmin dans /admin/logs (onglet Tickets).
//
// Champs exacts du modèle SupportTicket (prisma/schema.prisma) :
//   subject, email, priority ('NORMAL'), status ('OPEN'), body.
// Le schéma n'a NI userId NI category → traçabilité assurée dans
// `body` (user id, bien, audience, détails) et préfixe du subject.
//
// Gardes : session NextAuth + canAccessProperty (owner ou membre
// d'équipe accepté du bien).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { canAccessProperty } from '@/lib/b2b-server';
import { PROVIDER_AUDIENCES, type ProviderAudience } from '@/lib/b2b';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string; email?: string | null } | undefined;
    if (!session?.user || !user?.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body = (await req.json()) as {
      propertyId?: string;
      service?: string;
      audience?: string;
      details?: string;
    };

    const propertyId = (body.propertyId ?? '').trim();
    const service = (body.service ?? '').trim().slice(0, 120);
    const details = (body.details ?? '').trim().slice(0, 1500);
    const audience: ProviderAudience = PROVIDER_AUDIENCES.includes(
      body.audience as ProviderAudience,
    )
      ? (body.audience as ProviderAudience)
      : 'OWNER_SERVICE';

    if (!propertyId) {
      return NextResponse.json({ error: 'Bien requis.' }, { status: 400 });
    }
    if (service.length < 2) {
      return NextResponse.json(
        { error: 'Précisez le service recherché (2 caractères minimum).' },
        { status: 400 },
      );
    }
    if (!(await canAccessProperty(user.id, propertyId))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { id: true, name: true },
    });
    if (!property) {
      return NextResponse.json({ error: 'Bien introuvable.' }, { status: 404 });
    }

    const audienceLabel =
      audience === 'GUEST_EXPERIENCE' ? 'Expériences Invité' : 'Services Propriétaire';

    // Message combiné (bien / service / audience / détails) — champ `body`
    const message = [
      `Bien : ${property.name} (${propertyId})`,
      `Service recherché : ${service}`,
      `Audience : ${audienceLabel} (${audience})`,
      details ? `Détails & disponibilités : ${details}` : 'Détails : —',
      `Demande émise depuis le Dashboard Client par l'utilisateur ${user.id}${user.email ? ` (${user.email})` : ''}.`,
    ].join('\n');

    const ticket = await db.supportTicket.create({
      data: {
        subject: `[Demande prestataire] ${service}`.slice(0, 160),
        email: user.email ?? 'inconnu@conciergerie-hub.app',
        priority: 'NORMAL',
        status: 'OPEN',
        body: message.slice(0, 2000),
      },
      select: { id: true, subject: true, email: true, priority: true, status: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, ticket }, { status: 201 });
  } catch (error) {
    console.error('[airbnb/provider-requests POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
