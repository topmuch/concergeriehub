// =============================================================
// /api/airbnb/properties/[id]/members — ÉTAPE 12 V2 : équipe
//
// GET                     : liste de l'équipe (membres acceptés +
//                          invitations en attente). Accessible à
//                          tout membre du bien.
// POST                    : invitation d'un membre — OWNER/MANAGER.
//                          { email, role: 'MANAGER'|'CLEANER'|
//                            'MAINTENANCE' } — compte existant
//                          requis (inscription gratuite).
// PATCH  ?memberId=<id>   : { action: 'accept' | 'decline' } (le
//                          membre invité) OU { role, permissions? }
//                          (OWNER/MANAGER — jamais le membre OWNER).
// DELETE ?memberId=<id>   : retrait de l'équipe — OWNER/MANAGER
//                          ou retrait volontaire (soi-même).
//
// ⚠️ Design note : memberId passe par un QUERY PARAM (et non un
// segment dynamique [memberId]) — le sandbox renomme certains
// dossiers bracketés, le query param est insensible à ce bug.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam, normalizeMemberRole, MEMBER_ROLES, type MemberRole } from '@/lib/team';

type Ctx = { params: Promise<{ id: string }> };

const INVITABLE_ROLES: MemberRole[] = MEMBER_ROLES.filter((r) => r !== 'OWNER');
const ASSIGNABLE_ROLES: MemberRole[] = MEMBER_ROLES.filter((r) => r !== 'OWNER');

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id: propertyId } = await ctx.params;
    const myRole = await getUserRoleForProperty(userId, propertyId);
    if (!myRole) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const members = await db.propertyMember.findMany({
      where: { propertyId },
      orderBy: [{ acceptedAt: 'asc' }, { invitedAt: 'asc' }],
      select: {
        id: true,
        role: true,
        permissions: true,
        invitedAt: true,
        acceptedAt: true,
        userId: true,
        user: { select: { id: true, email: true, fullName: true, isActive: true } },
      },
    });

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        role: normalizeMemberRole(m.role),
        permissions: m.permissions,
        invitedAt: m.invitedAt.toISOString(),
        acceptedAt: m.acceptedAt?.toISOString() ?? null,
        isOwnerUser: m.role === 'OWNER',
        isSelf: m.userId === userId,
        user: {
          id: m.user.id,
          email: m.user.email,
          fullName: m.user.fullName,
          isActive: m.user.isActive,
        },
      })),
      canManage: canManageTeam(myRole),
      myRole,
    });
  } catch (error) {
    console.error('[airbnb/properties/[id]/members GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id: propertyId } = await ctx.params;
    const myRole = await getUserRoleForProperty(userId, propertyId);
    if (!myRole || !canManageTeam(myRole)) {
      return NextResponse.json(
        { error: "Seuls le propriétaire et les gestionnaires peuvent inviter." },
        { status: 403 },
      );
    }

    const body = (await req.json()) as { email?: string; role?: string };
    const email = (body.email ?? '').trim().toLowerCase();
    const role = normalizeMemberRole(body.role ?? '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 });
    }
    if (!INVITABLE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "Rôle invalide. Rôles proposables : MANAGER, CLEANER, MAINTENANCE." },
        { status: 400 },
      );
    }

    const [property, invitedUser] = await Promise.all([
      db.property.findUnique({
        where: { id: propertyId },
        select: { id: true, name: true, ownerId: true },
      }),
      db.user.findUnique({ where: { email }, select: { id: true, isActive: true, fullName: true } }),
    ]);

    if (!property) {
      return NextResponse.json({ error: 'Bien introuvable.' }, { status: 404 });
    }
    if (!invitedUser) {
      return NextResponse.json(
        {
          error:
            "Aucun compte Conciergerie Hub avec cet email. Demandez-lui de s'inscrire (gratuit), puis invitez-le.",
        },
        { status: 404 },
      );
    }
    if (!invitedUser.isActive) {
      return NextResponse.json(
        { error: 'Ce compte a été désactivé par l’administrateur.' },
        { status: 403 },
      );
    }
    if (invitedUser.id === property.ownerId) {
      return NextResponse.json(
        { error: 'Cette personne est déjà propriétaire du bien.' },
        { status: 409 },
      );
    }

    const existing = await db.propertyMember.findUnique({
      where: { propertyId_userId: { propertyId, userId: invitedUser.id } },
      select: { id: true, acceptedAt: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: existing.acceptedAt
            ? 'Cette personne fait déjà partie de l’équipe.'
            : 'Une invitation est déjà en attente pour ce compte.',
        },
        { status: 409 },
      );
    }

    const member = await db.propertyMember.create({
      data: {
        propertyId,
        userId: invitedUser.id,
        role,
        invitedAt: new Date(),
        acceptedAt: null,
      },
      select: { id: true, role: true, invitedAt: true },
    });

    return NextResponse.json(
      {
        member: {
          ...member,
          invitedAt: member.invitedAt.toISOString(),
          acceptedAt: null,
        },
        invited: { fullName: invitedUser.fullName, email },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[airbnb/properties/[id]/members POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// =============================================================
// PATCH ?memberId=<id> — accept/decline (membre invité) ou
// changement de rôle/permissions (OWNER/MANAGER)
// =============================================================
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id: propertyId } = await ctx.params;
    const memberId = new URL(req.url).searchParams.get('memberId');
    if (!memberId) {
      return NextResponse.json(
        { error: 'Query param memberId requis.' },
        { status: 400 },
      );
    }

    const member = await db.propertyMember.findUnique({
      where: { id: memberId },
      select: { id: true, propertyId: true, userId: true, role: true, acceptedAt: true },
    });
    if (!member || member.propertyId !== propertyId) {
      return NextResponse.json({ error: 'Membre introuvable.' }, { status: 404 });
    }

    const body = (await req.json()) as {
      action?: 'accept' | 'decline';
      role?: string;
      permissions?: string | null;
    };

    // ----- Acceptation / refus : réservés au membre invité -----
    if (body.action === 'accept' || body.action === 'decline') {
      if (member.userId !== userId) {
        return NextResponse.json(
          { error: "Seul le membre invité peut répondre à l'invitation." },
          { status: 403 },
        );
      }
      if (member.acceptedAt) {
        return NextResponse.json({ error: 'Invitation déjà acceptée.' }, { status: 409 });
      }
      if (body.action === 'accept') {
        const updated = await db.propertyMember.update({
          where: { id: member.id },
          data: { acceptedAt: new Date() },
          select: { id: true, acceptedAt: true, role: true },
        });
        return NextResponse.json({
          member: { ...updated, acceptedAt: updated.acceptedAt?.toISOString() ?? null },
          accepted: true,
        });
      }
      // decline → suppression de l'adhésion en attente
      await db.propertyMember.delete({ where: { id: member.id } });
      return NextResponse.json({ declined: true });
    }

    // ----- Changement de rôle / permissions : OWNER / MANAGER -----
    const myRole = await getUserRoleForProperty(userId, propertyId);
    if (!myRole || !canManageTeam(myRole)) {
      return NextResponse.json(
        { error: 'Seuls le propriétaire et les gestionnaires peuvent modifier les rôles.' },
        { status: 403 },
      );
    }
    if (member.role === 'OWNER') {
      return NextResponse.json(
        { error: 'Le rôle du propriétaire du bien ne peut pas être modifié.' },
        { status: 403 },
      );
    }

    const data: { role?: string; permissions?: string | null } = {};
    if (body.role !== undefined) {
      const nextRole = normalizeMemberRole(body.role);
      if (!ASSIGNABLE_ROLES.includes(nextRole)) {
        return NextResponse.json(
          { error: 'Rôle invalide. Rôles assignables : MANAGER, CLEANER, MAINTENANCE.' },
          { status: 400 },
        );
      }
      data.role = nextRole;
    }
    if (body.permissions !== undefined) {
      if (body.permissions === null) {
        data.permissions = null;
      } else {
        try {
          JSON.parse(body.permissions);
          data.permissions = body.permissions;
        } catch {
          return NextResponse.json({ error: 'Permissions : JSON invalide.' }, { status: 400 });
        }
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Aucune modification fournie.' }, { status: 400 });
    }

    const updated = await db.propertyMember.update({
      where: { id: member.id },
      data,
      select: { id: true, role: true, permissions: true },
    });

    return NextResponse.json({ member: updated });
  } catch (error) {
    console.error('[airbnb/properties/[id]/members PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// =============================================================
// DELETE ?memberId=<id> — retrait d'un membre (OWNER/MANAGER)
// ou retrait volontaire (soi-même)
// =============================================================
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id: propertyId } = await ctx.params;
    const memberId = new URL(req.url).searchParams.get('memberId');
    if (!memberId) {
      return NextResponse.json(
        { error: 'Query param memberId requis.' },
        { status: 400 },
      );
    }

    const member = await db.propertyMember.findUnique({
      where: { id: memberId },
      select: { id: true, propertyId: true, userId: true, role: true },
    });
    if (!member || member.propertyId !== propertyId) {
      return NextResponse.json({ error: 'Membre introuvable.' }, { status: 404 });
    }
    if (member.role === 'OWNER') {
      return NextResponse.json(
        { error: 'Le propriétaire du bien ne peut pas être retiré de son bien.' },
        { status: 403 },
      );
    }

    // Retrait volontaire (soi-même) OU gestion (OWNER/MANAGER)
    const isSelf = member.userId === userId;
    if (!isSelf) {
      const myRole = await getUserRoleForProperty(userId, propertyId);
      if (!myRole || !canManageTeam(myRole)) {
        return NextResponse.json(
          { error: "Seuls le propriétaire et les gestionnaires peuvent retirer un membre." },
          { status: 403 },
        );
      }
    }

    await db.propertyMember.delete({ where: { id: member.id } });
    return NextResponse.json({ removed: true, self: isSelf });
  } catch (error) {
    console.error('[airbnb/properties/[id]/members DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
