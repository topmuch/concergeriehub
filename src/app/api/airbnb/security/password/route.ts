// =============================================================
// POST /api/airbnb/security/password — HOST-5 Paramètres → Sécurité
// Changement de mot de passe RÉEL :
//  1. vérifie le mot de passe actuel (bcrypt.compare, timing-safe)
//  2. valide le nouveau (≥ 8 caractères, 1 lettre + 1 chiffre)
//  3. hache (bcrypt 10) et met à jour users.password_hash
// 🔒 Session hôte requise. Les comptes sans mot de passe (SSO
// futur) reçoivent un 409 explicite.
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { compare, hash } from 'bcryptjs';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
      currentPassword?: string;
      newPassword?: string;
    } | null;
    const currentPassword = body?.currentPassword ?? '';
    const newPassword = body?.newPassword ?? '';

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Mot de passe actuel et nouveau mot de passe sont requis.' },
        { status: 400 },
      );
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return NextResponse.json(
        {
          error:
            'Le nouveau mot de passe doit contenir au moins 8 caractères, une lettre et un chiffre.',
        },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });
    }
    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "Ce compte n'utilise pas de mot de passe local." },
        { status: 409 },
      );
    }

    const valid = await compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: 'Le mot de passe actuel est incorrect.' },
        { status: 403 },
      );
    }
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: 'Le nouveau mot de passe doit être différent de l’actuel.' },
        { status: 400 },
      );
    }

    const newHash = await hash(newPassword, 10);
    await db.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return NextResponse.json({ ok: true, message: 'Mot de passe mis à jour.' });
  } catch (error) {
    console.error('[airbnb/security/password POST] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
