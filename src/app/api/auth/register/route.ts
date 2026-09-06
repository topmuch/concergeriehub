import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { isIpBlacklisted } from '@/lib/security';
import { isFlagEnabled } from '@/lib/feature-flags';
import { getPlatformSettings } from '@/lib/settings';
import { queueEmail } from '@/lib/email';
// FIX-12 — rendu DB-first : modèle éditable 'welcome' (onglet Modèles),
// fallback silencieux sur le template codé en dur.
import { renderWelcomeEmail } from '@/lib/email-template-render';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  try {
    // Anti-abus : IP bannie → refus, sinon quota config configurable.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
    if (await isIpBlacklisted(ip)) {
      return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
    }
    const settings = await getPlatformSettings();
    if (!(await rateLimit(`register:${ip}`, settings.signupHourlyLimit))) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans un instant.' }, { status: 429 });
    }

    // Feature flag réel : inscriptions ouvertes ou fermées.
    if (!(await isFlagEnabled('signups_enabled'))) {
      return NextResponse.json(
        { error: 'Les inscriptions sont temporairement fermées. Contactez le support.' },
        { status: 503 },
      );
    }

    const { email, password, fullName } = await req.json();

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'Email, mot de passe et nom requis' }, { status: 400 });
    }

    // Normalisation : un compte créé avec majuscules doit rester joignable
    // au login (le authorize cherche trim().toLowerCase()).
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Adresse email invalide' }, { status: 400 });
    }

    // SÉCURITÉ : le rôle ne se choisit JAMAIS côté client.
    // Toute inscription publique crée un compte 'user' ; la promotion
    // superadmin se fait uniquement en base par un superadmin existant.
    const role = 'user';

    if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 80) {
      return NextResponse.json({ error: 'Le nom doit contenir entre 2 et 80 caracteres' }, { status: 400 });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 6 caracteres' }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: 'Cet email est deja utilise' }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);

    const user = await db.user.create({
      data: {
        email: normalizedEmail,
        fullName: fullName.trim(),
        passwordHash,
        role,
      },
    });

    await db.property.create({
      data: {
        name: 'Ma Maison',
        ownerId: user.id,
        address: '',
      },
    });

    // Chantier ONBOARD — email de bienvenue (fire-and-forget : ne peut
    // jamais faire échouer l'inscription, cf. lib/email.ts).
    const firstName = fullName.trim().split(/\s+/)[0] || 'hôte';
    const tpl = await renderWelcomeEmail({ firstName, dashboardUrl: '/airbnb/dashboard?onboarding=1' });
    void queueEmail({
      to: normalizedEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      template: 'welcome',
      userId: user.id,
      referenceType: 'welcome',
      referenceId: user.id,
      meta: { firstName },
    }).catch(() => undefined);

    return NextResponse.json({ success: true, userId: user.id }, { status: 201 });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
