// =============================================================
// PATCH /api/airbnb/profile — HOST-5 Paramètres → onglet Profil
// Met à jour : fullName (users), phone/address (profiles, upsert).
// 🔒 Session hôte requise. Le rôle superadmin est refusé (sa console
// a ses propres réglages).
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { mutationGuard, mutationKey } from '@/lib/mutation-guard';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string; role?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    // FIX-15 — anti-abus : 30 mutations/min par hôte (userId, sinon IP).
    const mutGuard = await mutationGuard(mutationKey('airbnb-mut', req, userId));
    if (mutGuard) return mutGuard;

    const body = (await req.json().catch(() => null)) as {
      fullName?: string;
      phone?: string;
      address?: string;
    } | null;

    const fullName = (body?.fullName ?? '').trim();
    const phone = (body?.phone ?? '').trim() || null;
    const address = (body?.address ?? '').trim() || null;

    if (fullName.length < 2 || fullName.length > 80) {
      return NextResponse.json(
        { error: 'Le nom complet doit contenir entre 2 et 80 caractères.' },
        { status: 400 },
      );
    }
    if (phone && !/^[+0-9 ().-]{6,20}$/.test(phone)) {
      return NextResponse.json(
        { error: 'Numéro de téléphone invalide (6 à 20 caractères, chiffres et +().- autorisés).' },
        { status: 400 },
      );
    }

    const user = await db.user.update({
      where: { id: userId },
      data: { fullName },
      select: { id: true, fullName: true },
    });

    if (phone !== null || address !== null) {
      const existing = await db.profile.findUnique({ where: { userId } });
      if (existing) {
        await db.profile.update({
          where: { userId },
          data: {
            phone: phone !== null ? phone : existing.phone,
            address: address !== null ? address : existing.address,
          },
        });
      } else if (phone || address) {
        await db.profile.create({ data: { userId, phone, address } });
      }
    }

    return NextResponse.json({
      profile: { fullName: user.fullName, phone, address },
    });
  } catch (error) {
    console.error('[airbnb/profile PATCH] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const [user, profile] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true } }),
      db.profile.findUnique({ where: { userId }, select: { phone: true, address: true } }),
    ]);
    return NextResponse.json({
      profile: {
        email: user?.email ?? '',
        fullName: user?.fullName ?? '',
        phone: profile?.phone ?? '',
        address: profile?.address ?? '',
      },
    });
  } catch (error) {
    console.error('[airbnb/profile GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
