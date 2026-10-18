import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { queueEmail } from '@/lib/email';
import { siteUrl } from '@/lib/site';
import { captureError } from '@/lib/error-monitor';

// =============================================================
// AUDIT PRÉ-PROD — MOT DE PASSE OUBLIÉ (Module 3.1)
//   POST /api/auth/forgot-password   body: { email }
//
// 1. Rate limit 3/h par IP (anti-énumération + anti-spam email) ;
// 2. Token aléatoire 48 hex — stocké HASHÉ (SHA-256), expiré 1 h,
//    single-use ; la valeur claire n'existe QUE dans l'email ;
// 3. Réponse TOUJOURS { ok: true } — on ne révèle jamais si un
//    compte existe (anti-énumération) ;
// 4. Email via la file transactionnelle (SMTP), lien
//    ${siteUrl}/reset-password?token=…
// Ne lève jamais (captureError).
// =============================================================

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 h

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : null) || 'local';
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function POST(req: Request) {
  try {
    if (!(await rateLimit(`forgotpw:${clientIp(req)}`, 3, 60 * 60_000))) {
      return NextResponse.json(
        { error: 'Trop de demandes. Réessayez dans une heure.' },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      // Message volontairement identique au succès (anti-énumération)
      return NextResponse.json({ ok: true });
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, fullName: true, isActive: true },
    });

    if (user?.isActive) {
      // Invalide les anciens tokens du compte (1 demande active à la fois)
      await db.passwordResetToken.deleteMany({ where: { userId: user.id } });

      const token = randomBytes(24).toString('hex'); // 48 hex chars
      await db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
      });

      const resetUrl = `${siteUrl}/reset-password?token=${token}`;
      const firstName = (user.fullName ?? '').trim().split(/\s+/)[0] || '';
      await queueEmail({
        to: email,
        subject: '🔐 Réinitialisez votre mot de passe — RoomScan',
        html:
          `<p style="margin:0 0 12px">Bonjour${firstName ? ` <strong>${firstName}</strong>` : ''},</p>` +
          `<p style="margin:0 0 12px">Vous avez demandé la réinitialisation de votre mot de passe RoomScan.</p>` +
          `<p style="margin:0 0 16px"><a href="${resetUrl}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:12px;font-weight:700;text-decoration:none">🔐 Choisir un nouveau mot de passe</a></p>` +
          `<p style="margin:0 0 8px;color:#64748b;font-size:13px">Ce lien est valable <strong>1 heure</strong> et utilisable une seule fois.</p>` +
          `<p style="margin:0;color:#64748b;font-size:13px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe reste inchangé.</p>` +
          `<p style="margin:12px 0 0;color:#94a3b8;font-size:12px">Si le bouton ne fonctionne pas : ${resetUrl}</p>`,
        text: `Réinitialisez votre mot de passe RoomScan (lien valable 1 h) : ${resetUrl}`,
        template: 'custom',
        userId: user.id,
        referenceType: 'password_reset',
        meta: { purpose: 'forgot_password' },
      }).catch(() => undefined);
    }

    // Succès constant — jamais d'information sur l'existence du compte.
    return NextResponse.json({ ok: true });
  } catch (error) {
    await captureError('auth.forgot-password', error, undefined, req);
    return NextResponse.json({ ok: true });
  }
}
