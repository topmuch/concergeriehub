// =============================================================
// /api/airbnb/properties/[id]/members/[memberId] — ÉTAPE 12 V2
//
// PATCH  :
//  - { action: 'accept' }  → le MEMBRE invité accepte son
//    invitation (acceptedAt = now). Réservé à l'intéressé.
//  - { action: 'decline' } → le MEMBRE invité refuse (suppression
//    de l'adhésion). Réservé à l'intéressé.
//  - { role, permissions? } → changement de rôle / permissions —
//    OWNER/MANAGER uniquement (jamais le membre OWNER du bien).
// DELETE : retrait de l'équipe — OWNER/MANAGER (jamais le membre
//          OWNER) ou retrait volontaire (soi-même).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getUserRoleForProperty } from '@/lib/b2b-server';
import { canManageTeam, normalizeMemberRole, MEMBER_ROLES, type MemberRole } from '@/lib/team';

type Ctx = { params: Promise<{ id: string; memberId: string }> };

const ASSIGNABLE_ROLES: MemberRole[] = MEMBER_ROLES.filter((r) => r !== 'OWNER');

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id: propertyId, memberId } = await ctx.params;

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
      const role = normalizeMemberRole(body.role);
      if (!ASSIGNABLE_ROLES.includes(role)) {
        return NextResponse.json(
          { error: 'Rôle invalide. Rôles assignables : MANAGER, CLEANER, MAINTENANCE.' },
          { status: 400 },
        );
      }
      data.role = role;
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
    console.error('[airbnb/properties/[id]/members/[memberId] PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id: propertyId, memberId } = await ctx.params;

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
    console.error('[airbnb/properties/[id]/members/[memberId] DELETE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
