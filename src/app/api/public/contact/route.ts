import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { queueEmail } from '@/lib/email';

// =============================================================
// POST /api/public/contact (v5.18 — page /contact)
//
// Formulaire public de contact (demande client : « la page contact
// doit avoir un formulaire et une carte »).
//
//   • Rate-limit : 5 requêtes / min / IP (anti-spam).
//   • Honeypot : champ caché `website` — rempli = bot → réponse OK
//     factice (jamais stocké) pour ne pas avertir l'attaquant.
//   • Persistance : table ContactMessage (consultable en SQL/admin).
//   • Notification : email dans l'outbox → contact@roomscan.pro
//     (visible dans la Console Superadmin → Emails).
// =============================================================

const SUBJECTS = [
  'demo',
  'tarifs',
  'etats-des-lieux',
  'partenariat',
  'support',
  'autre',
] as const;

const SUBJECT_LABELS: Record<(typeof SUBJECTS)[number], string> = {
  demo: 'Demander une démonstration',
  tarifs: 'Tarifs & abonnements',
  'etats-des-lieux': 'Module États des Lieux',
  partenariat: 'Partenariat / conciergerie',
  support: 'Support technique',
  autre: 'Autre demande',
};

const contactSchema = z.object({
  name: z.string().trim().min(2, 'name').max(80),
  email: z.email().max(120),
  phone: z.string().trim().max(30).optional().default(''),
  subject: z.enum(SUBJECTS),
  message: z.string().trim().min(10, 'message').max(2000),
  consent: z.literal(true),
  website: z.string().max(0).optional().default(''), // honeypot : doit rester vide
  lang: z.string().max(8).optional().default('fr'),
});

function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return headers.get('x-real-ip')?.trim() || 'inconnue';
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers);

  // Anti-spam : 5 soumissions / min / IP.
  const allowed = await rateLimit(`contact:${ip}`, 5, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: 'Trop de messages envoyés. Réessayez dans une minute.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });
  }
  const { name, email, phone, subject, message, lang } = parsed.data;

  // Honeypot rempli → bot : réponse factice sans écriture.
  if (parsed.data.website) {
    return NextResponse.json({ ok: true });
  }

  try {
    // Empreinte IP (vie privée : pas d'IP brute en base).
    const ipHash = createHash('sha256').update(`roomscan-contact:${ip}`).digest('hex').slice(0, 32);

    const row = await db.contactMessage.create({
      data: {
        name,
        email,
        phone: phone || null,
        subject,
        message,
        lang,
        ipHash,
      },
      select: { id: true, createdAt: true },
    });

    // Notification équipe (outbox → Console Superadmin › Emails).
    await queueEmail({
      to: 'contact@roomscan.pro',
      subject: `[Contact] ${SUBJECT_LABELS[subject]} — ${name}`,
      template: 'custom',
      referenceType: 'contact_message',
      referenceId: row.id,
      meta: { subject, senderEmail: email, messageId: row.id },
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
          <h2 style="color:#04467a;font-size:18px;margin:0 0 16px">Nouveau message — formulaire de contact</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#64748b;width:140px">Nom</td><td style="padding:6px 0"><strong>${esc(name)}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Email</td><td style="padding:6px 0">${esc(email)}</td></tr>
            ${phone ? `<tr><td style="padding:6px 0;color:#64748b">Téléphone</td><td style="padding:6px 0">${esc(phone)}</td></tr>` : ''}
            <tr><td style="padding:6px 0;color:#64748b">Sujet</td><td style="padding:6px 0">${esc(SUBJECT_LABELS[subject])}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Reçu le</td><td style="padding:6px 0">${row.createdAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</td></tr>
          </table>
          <div style="margin-top:16px;padding:16px;background:#f1f5f9;border-radius:12px;white-space:pre-wrap;font-size:14px;line-height:1.6">${esc(message)}</div>
          <p style="margin-top:16px;font-size:12px;color:#94a3b8">Répondre directement à : ${esc(email)} · Message n° ${esc(row.id)}</p>
        </div>
      `,
      text: `Nouveau message — formulaire de contact\n\nNom : ${name}\nEmail : ${email}\nTéléphone : ${phone || '—'}\nSujet : ${SUBJECT_LABELS[subject]}\n\n${message}\n\nRépondre à : ${email}`,
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (error) {
    console.error('[contact] POST failed:', error);
    return NextResponse.json(
      { ok: false, error: 'Une erreur interne est survenue. Réessayez ou écrivez à contact@roomscan.pro.' },
      { status: 500 },
    );
  }
}
