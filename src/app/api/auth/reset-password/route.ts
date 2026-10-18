import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { captureError } from '@/lib/error-monitor';
import { clientIp } from '@/lib/audit';

// =============================================================
// AUDIT PRÉ-PROD — NOUVEAU MOT DE PASSE (Module 3.1)
//   POST /api/auth/reset-password   body: { token, password }
//
// 1. Token validé contre son HASH (SHA-256) — non utilisé, non expiré ;
// 2. Politique mot de passe : 8 caractères min + lettres + chiffres ;
// 3. Le token est consommé (usedAt) + tous les autres invalidés ;
// 4. Réponse générique : un token invalide/expiré → même message.
// Ne lève jamais (captureError).
// =============================================================

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function POST(req: Request) {
  try {
    // v4.81 (AUDIT QA) — rate limit PAR IP (avant : clé globale 'resetpw'
    // = 10 resets/min pour TOUTE la plateforme → DoS des réinitialisations).
    const ip = clientIp(req.headers) ?? 'unknown';
    if (!(await rateLimit(`resetpw:${ip}`, 5))) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans un instant.' },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => null)) as { token?: unknown; password?: unknown } | null;
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!token) {
      return NextResponse.json({ error: 'Lien invalide ou expiré. Refaites une demande.' }, { status: 400 });
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 8 caractères, avec des lettres et des chiffres.' },
        { status: 400 },
      );
    }

    const record = await db.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Lien invalide ou expiré. Refaites une demande.' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: record.userId },
      select: { id: true, isActive: true },
    });
    if (!user?.isActive) {
      return NextResponse.json({ error: 'Lien invalide ou expiré. Refaites une demande.' }, { status: 400 });
    }

    const passwordHash = await hash(password, 12);
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash } }),
      // Single-use + révoque tout autre token en circulation
      db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      db.passwordResetToken.deleteMany({
        where: { userId: user.id, id: { not: record.id } },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    await captureError('auth.reset-password', error, undefined, req);
    return NextResponse.json(
      { error: 'Erreur serveur. Réessayez dans un instant.' },
      { status: 500 },
    );
  }
}
