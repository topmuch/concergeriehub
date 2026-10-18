// =============================================================
// Seed Emails démo — ÉTAPE 22 (Conciergerie Hub)
// Remplit l'outbox avec des emails représentatifs pour la
// Console Superadmin (/admin/emails) :
//  - 3 envoyés (mode démo) : notification réservation,
//    reçu invité 36 €, remboursement
//  - 1 en file (QUEUED)
//  - 1 en échec (FAILED) → démo du bouton Réessayer
// Idempotent : ne fait rien si le marqueur seed existe déjà.
// Run : bun run scripts/seed-emails-demo.ts
// =============================================================
import { db } from '../src/lib/db';
import { hostNotificationEmail, guestReceiptEmail, guestRefundEmail } from '../src/lib/email-templates';

const SEED_MARKER = '"seed":"emails-demo"';

async function main() {
  const existing = await db.emailOutbox.findFirst({
    where: { metaJson: { contains: SEED_MARKER } },
    select: { id: true },
  });
  if (existing) {
    console.log('ℹ️  Seed emails déjà appliqué — rien à faire.');
    return;
  }

  const daysAgo = (n: number, h = 0) =>
    new Date(Date.now() - n * 24 * 3600 * 1000 - h * 3600 * 1000);

  const propertyName = 'Loft Canal Saint-Martin';
  const orderRef = 'demo-order-0001';

  const rows: {
    to: string;
    tpl: { subject: string; html: string; text: string };
    template: string;
    status: 'SENT' | 'FAILED' | 'QUEUED';
    createdAt: Date;
    referenceType?: string;
    referenceId?: string;
    error?: string;
  }[] = [
    {
      to: 'marie@exemple.fr',
      tpl: hostNotificationEmail({
        title: '📅 Nouvelle réservation',
        body: `${propertyName} : séjour de Camille Laurent du ${'12 mai'} au ${'15 mai'}.`,
        propertyName,
        url: '/airbnb/dashboard',
      }),
      template: 'host_notification',
      status: 'SENT',
      createdAt: daysAgo(3),
      referenceType: 'automation',
    },
    {
      to: 'camille.laurent@exemple.fr',
      tpl: guestReceiptEmail({
        guestName: 'Camille Laurent',
        orderRef,
        itemsSummary: '1× Box Petit-déjeuner Royal',
        amount: 36,
        providerName: 'Morning Box Paris',
        propertyName,
      }),
      template: 'guest_receipt',
      status: 'SENT',
      createdAt: daysAgo(2, 4),
      referenceType: 'service_order',
      referenceId: orderRef,
    },
    {
      to: 'camille.laurent@exemple.fr',
      tpl: guestRefundEmail({
        guestName: 'Camille Laurent',
        orderRef,
        amount: 36,
        propertyName,
      }),
      template: 'guest_refund',
      status: 'SENT',
      createdAt: daysAgo(1, 2),
      referenceType: 'service_order',
      referenceId: orderRef,
    },
    {
      to: 'sophie@qrdomotik.roomscan.pro',
      tpl: hostNotificationEmail({
        title: '🛬 Arrivée aujourd’hui',
        body: `${propertyName} : Camille Laurent arrive aujourd’hui (2 pers.).`,
        propertyName,
        url: '/airbnb/dashboard',
      }),
      template: 'host_notification',
      status: 'QUEUED',
      createdAt: daysAgo(0, 1),
      referenceType: 'automation',
    },
    {
      to: 'support@exemple.fr',
      tpl: hostNotificationEmail({
        title: '🔧 Réclamation technique',
        body: `${propertyName} : le chauffage de la chambre ne répond plus.`,
        propertyName,
        url: '/airbnb/dashboard',
      }),
      template: 'host_notification',
      status: 'FAILED',
      createdAt: daysAgo(0, 3),
      referenceType: 'automation',
      error: 'SMTP 554 : relay denied (démo d’échec — le bouton Réessayer repasse en mode démo)',
    },
  ];

  for (const row of rows) {
    await db.emailOutbox.create({
      data: {
        to: row.to,
        subject: row.tpl.subject,
        htmlBody: row.tpl.html,
        textBody: row.tpl.text,
        template: row.template,
        status: row.status,
        provider: row.status === 'SENT' ? 'demo' : null,
        attempts: row.status === 'SENT' ? 1 : 0,
        lastError: row.error ?? null,
        sentAt: row.status === 'SENT' ? row.createdAt : null,
        createdAt: row.createdAt,
        referenceType: row.referenceType ?? null,
        referenceId: row.referenceId ?? null,
        metaJson: `{${SEED_MARKER.slice(1, -1)}}`,
      },
    });
  }

  console.log(`✅ Seed emails démo : ${rows.length} entrées (3 sent · 1 queued · 1 failed).`);
}

main()
  .catch((e) => {
    console.error('❌ Seed emails échoué :', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
