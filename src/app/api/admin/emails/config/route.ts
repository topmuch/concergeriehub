// =============================================================
// /api/admin/emails/config — Configuration e-mail (v4.56 → v4.106)
//
// GET  : état effectif de la config (expéditeur + provider d'envoi
//        SMTP ou Resend) avec la SOURCE de chaque valeur : 'database'
//        (config Superadmin) | 'env' | 'default'. Les secrets ne sont
//        JAMAIS renvoyés en clair (masqués, 4 derniers caractères).
// PUT  : sauvegarde { from?, provider?, smtpHost?, smtpPort?,
//        smtpUser?, smtpPass?, resendApiKey? } en base (table
//        system_settings). Valeur vide = suppression de l'override
//        (retour à la variable d'environnement / au défaut). Les
//        champs secrets non fournis (undefined) sont laissés tels quels.
// POST : envoi d'un email de TEST { to? } (défaut = email du
//        superadmin connecté).
//
// 🔒 Réservé au Superadmin (role 'superadmin').
// =============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin, adminUnauthorized } from '@/lib/admin';
import {
  emailFromAddress,
  emailProviderConfigured,
  invalidateEmailConfigCache,
  resolveEmailProvider,
  saveEmailSetting,
  sendTestEmail,
  EMAIL_SETTING_KEYS,
} from '@/lib/email';
import { db } from '@/lib/db';

type Source = 'database' | 'env' | 'default';

function maskSecret(value: string): string {
  if (!value) return '';
  return value.length <= 8 ? '••••••' : `••••••••${value.slice(-4)}`;
}

async function readDbOverrides(): Promise<{
  from: string | null;
  provider: string | null;
  smtpHost: string | null;
  smtpPort: string | null;
  smtpUser: string | null;
  smtpPass: string | null;
  resendApiKey: string | null;
}> {
  const empty = {
    from: null,
    provider: null,
    smtpHost: null,
    smtpPort: null,
    smtpUser: null,
    smtpPass: null,
    resendApiKey: null,
  };
  try {
    const rows = await db.systemSetting.findMany({
      where: {
        key: {
          in: [
            EMAIL_SETTING_KEYS.FROM,
            EMAIL_SETTING_KEYS.PROVIDER,
            EMAIL_SETTING_KEYS.SMTP_HOST,
            EMAIL_SETTING_KEYS.SMTP_PORT,
            EMAIL_SETTING_KEYS.SMTP_USER,
            EMAIL_SETTING_KEYS.SMTP_PASS,
            EMAIL_SETTING_KEYS.RESEND_API_KEY,
          ],
        },
      },
      select: { key: true, value: true },
    });
    return {
      from: rows.find((r) => r.key === EMAIL_SETTING_KEYS.FROM)?.value ?? null,
      provider: rows.find((r) => r.key === EMAIL_SETTING_KEYS.PROVIDER)?.value ?? null,
      smtpHost: rows.find((r) => r.key === EMAIL_SETTING_KEYS.SMTP_HOST)?.value ?? null,
      smtpPort: rows.find((r) => r.key === EMAIL_SETTING_KEYS.SMTP_PORT)?.value ?? null,
      smtpUser: rows.find((r) => r.key === EMAIL_SETTING_KEYS.SMTP_USER)?.value ?? null,
      smtpPass: rows.find((r) => r.key === EMAIL_SETTING_KEYS.SMTP_PASS)?.value ?? null,
      resendApiKey: rows.find((r) => r.key === EMAIL_SETTING_KEYS.RESEND_API_KEY)?.value ?? null,
    };
  } catch {
    return empty;
  }
}

async function buildPayload(adminEmail: string) {
  const [effectiveFrom, resolved, overrides, configured] = await Promise.all([
    emailFromAddress(),
    resolveEmailProvider(),
    readDbOverrides(),
    emailProviderConfigured(),
  ]);

  const envSmtp = Boolean(process.env.SMTP_HOST?.trim());

  return {
    from: effectiveFrom,
    fromSource: overrides.from?.trim()
      ? ('database' as Source)
      : process.env.EMAIL_FROM?.trim()
        ? ('env' as Source)
        : ('default' as Source),
    fromOverride: overrides.from ?? '',
    adminEmail,
    provider: resolved.type,
    providerSource: resolved.source,
    providerConfigured: configured,
    // SMTP (hôte/port/utilisateur lisibles, mot de passe masqué)
    smtpHost: overrides.smtpHost ?? (envSmtp ? (process.env.SMTP_HOST ?? '') : ''),
    smtpPort: overrides.smtpPort ?? process.env.SMTP_PORT?.trim() ?? '',
    smtpUser: overrides.smtpUser ?? process.env.SMTP_USER?.trim() ?? '',
    smtpPassSet: Boolean(resolved.smtp.pass),
    smtpPassMasked: maskSecret(resolved.smtp.pass),
    smtpFromDb: Boolean(overrides.smtpHost || overrides.smtpPort || overrides.smtpUser || overrides.smtpPass),
    // v4.106 — Resend (clé jamais renvoyée en clair)
    resendKeySet: Boolean(resolved.resend.apiKey),
    resendKeyMasked: maskSecret(resolved.resend.apiKey),
    resendFromDb: Boolean(overrides.resendApiKey),
  };
}

export async function GET() {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    return NextResponse.json(await buildPayload(admin.email));
  } catch (error) {
    console.error('[admin/emails/config] GET failed:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const body = (await request.json().catch(() => null)) as
      | {
          from?: string;
          provider?: string;
          smtpHost?: string;
          smtpPort?: string;
          smtpUser?: string;
          smtpPass?: string;
          resendApiKey?: string;
        }
      | null;
    if (!body) {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
    }

    if (typeof body.from === 'string') {
      const res = await saveEmailSetting('from', body.from);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    }
    if (typeof body.provider === 'string') {
      if (body.provider.trim() === '') {
        const res = await saveEmailSetting('provider', '');
        if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      } else {
        const res = await saveEmailSetting('provider', body.provider);
        if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      }
    }
    if (typeof body.smtpHost === 'string') {
      const res = await saveEmailSetting('smtp_host', body.smtpHost);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    }
    if (typeof body.smtpPort === 'string') {
      const res = await saveEmailSetting('smtp_port', body.smtpPort);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    }
    if (typeof body.smtpUser === 'string') {
      const res = await saveEmailSetting('smtp_user', body.smtpUser);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    }
    if (typeof body.smtpPass === 'string') {
      const res = await saveEmailSetting('smtp_pass', body.smtpPass);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    }
    if (typeof body.resendApiKey === 'string') {
      const res = await saveEmailSetting('resend_api_key', body.resendApiKey);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    }

    // Cohérence : un provider choisi doit avoir ses identifiants.
    const resolved = await resolveEmailProvider();
    if (resolved.type === 'smtp' && (!resolved.smtp.host || !resolved.smtp.port)) {
      return NextResponse.json(
        { error: 'Serveur et port SMTP requis (ex : smtp.gmail.com / 587)' },
        { status: 400 },
      );
    }
    if (resolved.type === 'resend' && !resolved.resend.apiKey) {
      return NextResponse.json(
        { error: 'Clé API Resend requise (resend.com → API Keys)' },
        { status: 400 },
      );
    }

    invalidateEmailConfigCache();
    return NextResponse.json({ ok: true, ...(await buildPayload(admin.email)) });
  } catch (error) {
    console.error('[admin/emails/config] PUT failed:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireSuperadmin();
  if (!admin) return adminUnauthorized();

  try {
    const body = (await request.json().catch(() => null)) as { to?: string } | null;
    // v4.58 — destinataire par défaut : le superadmin connecté lui-même.
    const to = body?.to?.trim() || admin.email;
    if (!to || !to.includes('@')) {
      return NextResponse.json(
        { error: 'Indiquez une adresse de destination valide' },
        { status: 400 },
      );
    }
    const result = await sendTestEmail(to);
    return NextResponse.json({
      ok: result.status === 'SENT',
      status: result.status,
      provider: result.provider,
      to,
      error: result.error,
    });
  } catch (error) {
    console.error('[admin/emails/config] POST (test) failed:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
