// =============================================================
// BRIEFING DU SOIR — BILAN ENRICHI DE LA JOURNÉE (v5.19)
//
// runEveningBriefings() — appelée par le cron (route
// /api/admin/trigger-evening-briefings, scheduler interne horaire
// ou cron externe Coolify) :
//
//   1. Pour CHAQUE hôte (owner d'un bien OU membre accepté) :
//        • activé PAR DÉFAUT (demande client v5.19) — désactivable
//          via Paramètres → Notifications → « 🌇 Briefing du soir »
//          (clé prefs 'evening_briefing.email', défaut true) ;
//        • échéance = l'heure serveur a atteint 18 h (Dakar = UTC+0,
//          donc 18 h serveur = 18 h locale) ;
//        • anti-doublon : 1 email/jour/utilisateur (outbox template
//          'evening_briefing', sauf FAILED retentable).
//   2. Collecte des données RÉELLES de la journée (zéro donnée
//      factice) : arrivées/départs de demain, tâches ménage,
//      insights Coach critiques, réclamations en attente > 24 h,
//      revenus encaissés du jour (commandes, minibar, pressing,
//      late check-out), KPIs (scans Hub, sessions actives, EDL
//      signés, avis reçus, occupation du soir), tâches terminées.
//   3. MESSAGE DE MOTIVATION (demande client) : quand AUCUNE
//      réservation à venir dans les 7 jours, un message rotatif
//      (13 variantes, hash stable user+date → pas de doublon
//      d'affiliation) encourage l'hôte.
//   4. Email HTML sobre RoomScan (sections avec émojis, cartes,
//      KPIs en grille) + version texte — envoi via queueEmail.
//
// Ne lève JAMAIS : chaque utilisateur est isolé (try/catch), le
// résumé d'exécution agrège sent / skipped / failed.
// =============================================================

import { db } from '@/lib/db';
import { resolveUserProperties } from '@/lib/b2b-server';
import { queueEmail } from '@/lib/email';
import { siteUrl } from '@/lib/site';
import { effectivePrefs } from '@/lib/notification-prefs';

export interface EveningBriefingRunSummary {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  details: { userId: string; status: 'SENT' | 'SKIPPED' | 'FAILED'; reason?: string }[];
}

/** Heure d'envoi (heure serveur — Dakar est en UTC+0). */
const BRIEFING_HOUR = 18;
const OUTBOX_TEMPLATE = 'evening_briefing';

const fmtDay = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const fmtTime = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

const fmtMoney = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// -------------------------------------------------------------
// Messages de motivation (rotation stable user + date)
// -------------------------------------------------------------

const MOTIVATION_MESSAGES: string[] = [
  'Aucune réservation à venir dans les 7 jours — le moment parfait pour peaufiner votre guidebook et vos recommandations locales. Les hôtes les mieux notés soignent aussi les temps calmes. 🌱',
  'Journée sans arrivée ? Relancez vos anciens voyageurs : un message personnel ramène jusqu\'à 30 % de réservations en basse saison. 💬',
  'Profitez de ce creux pour tester un tarif attractif sur 2-3 nuits : une première réservation relance souvent l\'algorithme de visibilité des plateformes. 📈',
  'Les temps calmes sont faits pour préparer la vague suivante : vérifiez vos stocks, vos photos et votre annonce. Demain, tout sera prêt. 🧰',
  'Petit conseil du Coach : les séjours longs (7 nuits et plus) réduisent vos rotations de ménage. Une offre « semaine » peut séduire les digital nomads. 🗓️',
  'Zéro arrivée aujourd\'hui, zéro stress. C\'est le jour idéal pour planifier le ménage de fond et les petites réparations. ✨',
  'Une réservation en moins, une opportunité de plus : mettez à jour votre calendrier et activez les demandes de réservation instantanées. ⚡',
  'Vos voyageurs reviennent là où ils se sentent attendus. Un simple message de bienvenue à vos anciens invités peut suffire à remplir la semaine prochaine. 🤝',
  'Astuce revenus : le minibar et le late check-out génèrent en moyenne 8 % de revenu additionnel. Vérifiez qu\'ils sont bien configurés sur tous vos biens. 🍷',
  'Chaque soir calme est un soir gagné : documentez vos procédures, votre équipe sera encore plus efficace à la prochaine vague. 📋',
  'La basse saison prépare la haute. Ajustez votre prix minimum et vos séjours minimum dès maintenant pour capter les réservations anticipées. 🎯',
  'Votre Hub Invité travaille même quand vous dormez : assurez-vous que le Wi-Fi, le guidebook et le minibar sont à jour sur tous vos biens. 🛎️',
  'Rien à gérer aujourd\'hui — respirez. Les meilleurs hôtes savent que la constance bat l\'intensité. On se retrouve demain pour un nouveau bilan. 💪',
];

/** Message de motivation stable pour (user, jour) — hash simple. */
function pickMotivation(userId: string, dateKey: string): string {
  let hash = 0;
  const seed = `${userId}:${dateKey}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return MOTIVATION_MESSAGES[hash % MOTIVATION_MESSAGES.length];
}

// -------------------------------------------------------------
// Collecte des données de la journée (toutes réelles, via DB)
// -------------------------------------------------------------

interface TomorrowRow {
  propertyName: string;
  guestName: string;
  time: Date | null;
  extra: string | null;
}

interface EveningData {
  tomorrowCheckins: TomorrowRow[];
  tomorrowCheckouts: TomorrowRow[];
  tomorrowHousekeeping: TomorrowRow[];
  attention: string[];
  revenue: {
    ordersCount: number;
    ordersTotal: number;
    minibarCount: number;
    minibarTotal: number;
    laundryCount: number;
    laundryTotal: number;
    lateCheckoutCount: number;
    total: number;
  };
  kpis: {
    scans: number;
    activeSessions: number;
    edlSigned: number;
    feedbackCount: number;
    feedbackAvg: number | null;
    occupiedTonight: number;
    propertiesCount: number;
  };
  done: { housekeeping: number; edlSigned: number };
  noUpcoming: boolean;
}

async function collectEveningData(
  propertyIds: string[],
  propertyNameOf: (id: string) => string,
  now: Date,
): Promise<EveningData> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const startOfAfterTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const day24hAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const inWindow = { gte: startOfTomorrow, lt: startOfAfterTomorrow };
  const ACTIVE = { not: 'CANCELLED' } as const;

  const [
    checkins,
    checkouts,
    housekeepingTomorrow,
    housekeepingDone,
    insights,
    lateRequests,
    pendingMemories,
    ordersToday,
    minibarToday,
    laundryToday,
    lateCheckoutsToday,
    scansToday,
    activeSessions,
    edlSignedToday,
    feedbacksToday,
    occupiedRows,
    upcomingCheckins,
    upcomingCheckouts,
  ] = await Promise.all([
    db.booking.findMany({
      where: { propertyId: { in: propertyIds }, checkIn: inWindow, status: ACTIVE },
      select: { propertyId: true, guestName: true, checkIn: true, hubAccessSessions: { take: 1, select: { id: true } } },
    }),
    db.booking.findMany({
      where: { propertyId: { in: propertyIds }, checkOut: inWindow, status: ACTIVE },
      select: { propertyId: true, guestName: true, checkOut: true, checkOutInspections: { take: 1, select: { signedAt: true } } },
    }),
    db.housekeepingTask.findMany({
      where: { propertyId: { in: propertyIds }, scheduledAt: inWindow },
      select: { propertyId: true, status: true, scheduledAt: true },
    }),
    db.housekeepingTask.findMany({
      where: { propertyId: { in: propertyIds }, status: 'DONE', endedAt: { gte: startOfToday } },
      select: { id: true },
    }),
    db.dashboardInsight.findMany({
      where: {
        propertyId: { in: propertyIds },
        isResolved: false,
        priority: { in: ['CRITICAL', 'HIGH'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: 4,
      select: { title: true, message: true, priority: true },
    }),
    db.serviceRequest.findMany({
      where: { propertyId: { in: propertyIds }, status: 'pending', createdAt: { lt: day24hAgo } },
      orderBy: { createdAt: 'asc' },
      take: 3,
      select: { description: true, createdAt: true },
    }),
    db.guestMemory.findMany({
      where: { propertyId: { in: propertyIds }, isApproved: false },
      take: 3,
      select: { guestName: true, propertyId: true },
    }),
    db.serviceOrder.findMany({
      where: { propertyId: { in: propertyIds }, paymentStatus: 'PAID', paidAt: { gte: startOfToday } },
      select: { totalAmount: true },
    }),
    db.minibarOrder.findMany({
      where: { propertyId: { in: propertyIds }, status: 'PAID', createdAt: { gte: startOfToday } },
      select: { totalEur: true },
    }),
    db.laundryOrder.findMany({
      where: { propertyId: { in: propertyIds }, paidAt: { gte: startOfToday } },
      select: { amountEur: true },
    }),
    db.booking.count({
      where: { propertyId: { in: propertyIds }, lateCheckoutPaidAt: { gte: startOfToday } },
    }),
    db.guestSession.count({
      where: { propertyId: { in: propertyIds }, firstSeenAt: { gte: startOfToday } },
    }),
    db.guestSession.count({
      where: { propertyId: { in: propertyIds }, lastSeenAt: { gte: startOfToday } },
    }),
    db.checkOutInspection.count({
      where: { propertyId: { in: propertyIds }, signedAt: { gte: startOfToday } },
    }),
    db.privateFeedback.findMany({
      where: { propertyId: { in: propertyIds }, createdAt: { gte: startOfToday } },
      select: { rating: true },
    }),
    db.booking.findMany({
      where: {
        propertyId: { in: propertyIds },
        checkIn: { lte: now },
        checkOut: { gt: now },
        status: ACTIVE,
      },
      select: { propertyId: true },
      distinct: ['propertyId'],
    }),
    db.booking.count({
      where: {
        propertyId: { in: propertyIds },
        checkIn: { gte: now, lte: in7Days },
        status: ACTIVE,
      },
    }),
    db.booking.count({
      where: {
        propertyId: { in: propertyIds },
        checkOut: { gte: now, lte: in7Days },
        status: ACTIVE,
      },
    }),
  ]);

  const propertyName = (id: string) => propertyNameOf(id);

  // ── À ne pas oublier ──
  const attention: string[] = [];
  for (const i of insights) {
    const label = i.priority === 'CRITICAL' ? 'URGENT' : 'IMPORTANT';
    attention.push(`[${label}] ${i.title} — ${i.message}`);
  }
  for (const r of lateRequests) {
    attention.push(
      `Réclamation en attente depuis ${Math.max(1, Math.round((now.getTime() - r.createdAt.getTime()) / 3600_000))} h : ${r.description?.slice(0, 90) || 'sans détail'}`,
    );
  }
  for (const m of pendingMemories) {
    attention.push(
      `Souvenir du livre d'or à valider (livre d'or vivant) — ${m.guestName || 'un invité'} · ${propertyName(m.propertyId)}`,
    );
  }

  // ── Revenus du jour ──
  const ordersTotal = ordersToday.reduce((s, o) => s + (o.totalAmount ?? 0), 0);
  const minibarTotal = minibarToday.reduce((s, o) => s + (o.totalEur ?? 0), 0);
  const laundryTotal = laundryToday.reduce((s, o) => s + (o.amountEur ?? 0), 0);

  // ── KPIs avis ──
  const feedbackCount = feedbacksToday.length;
  const feedbackAvg =
    feedbackCount > 0
      ? feedbacksToday.reduce((s, f) => s + f.rating, 0) / feedbackCount
      : null;

  return {
    tomorrowCheckins: checkins.map((b) => ({
      propertyName: propertyName(b.propertyId),
      guestName: b.guestName,
      time: b.checkIn,
      extra: b.hubAccessSessions.length > 0 ? 'QR Hub prêt' : null,
    })),
    tomorrowCheckouts: checkouts.map((b) => ({
      propertyName: propertyName(b.propertyId),
      guestName: b.guestName,
      time: b.checkOut,
      extra:
        b.checkOutInspections.length > 0 && b.checkOutInspections[0].signedAt
          ? 'EDL signé'
          : 'EDL de sortie à faire signer',
    })),
    tomorrowHousekeeping: housekeepingTomorrow.map((t) => ({
      propertyName: propertyName(t.propertyId),
      guestName: '',
      time: t.scheduledAt,
      extra: t.status === 'DONE' ? 'fait' : t.status === 'IN_PROGRESS' ? 'en cours' : 'à planifier',
    })),
    attention,
    revenue: {
      ordersCount: ordersToday.length,
      ordersTotal,
      minibarCount: minibarToday.length,
      minibarTotal,
      laundryCount: laundryToday.length,
      laundryTotal,
      lateCheckoutCount: lateCheckoutsToday,
      total: ordersTotal + minibarTotal + laundryTotal,
    },
    kpis: {
      scans: scansToday,
      activeSessions,
      edlSigned: edlSignedToday,
      feedbackCount,
      feedbackAvg,
      occupiedTonight: occupiedRows.length,
      propertiesCount: propertyIds.length,
    },
    done: {
      housekeeping: housekeepingDone.length,
      edlSigned: edlSignedToday,
    },
    noUpcoming: upcomingCheckins === 0 && upcomingCheckouts === 0,
  };
}

// -------------------------------------------------------------
// Construction de l'email (HTML sobre RoomScan + texte brut)
// -------------------------------------------------------------

interface BuildArgs {
  firstName: string;
  now: Date;
  data: EveningData;
  motivation: string | null;
}

const EMPTY = '<span style="font-size:13px;color:#8a94ad">Rien à signaler.</span>';

function sectionTitle(emoji: string, label: string): string {
  return `<p style="margin:24px 0 8px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#5d6b8a">${emoji}&nbsp; ${escapeHtml(label)}</p>`;
}

function cardOpen(): string {
  return '<table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e8edf6;border-radius:14px;overflow:hidden">';
}

function row(line: string, sub?: string, strong = false): string {
  return `
    <tr>
      <td style="padding:11px 16px;border-top:1px solid #e8edf6">
        <p style="margin:0;font-size:13.5px;line-height:1.5;color:${strong ? '#101b36' : '#3f4c6b'};font-weight:${strong ? 700 : 400}">${line}</p>
        ${sub ? `<p style="margin:3px 0 0;font-size:11.5px;color:#8a94ad">${sub}</p>` : ''}
      </td>
    </tr>`;
}

function tomorrowRowHtml(r: TomorrowRow, icon: string): string {
  const hour = r.time ? fmtTime.format(r.time) : '';
  const main = `${icon} <strong style="color:#101b36">${escapeHtml(hour)}</strong> — ${escapeHtml(r.guestName || 'Invité')} · ${escapeHtml(r.propertyName)}`;
  return row(main, r.extra ? escapeHtml(r.extra) : undefined);
}

function kpiCell(value: string, label: string): string {
  return `
    <td style="width:50%;padding:12px 16px;border-top:1px solid #e8edf6">
      <p style="margin:0;font-size:20px;font-weight:700;color:#101b36">${value}</p>
      <p style="margin:2px 0 0;font-size:11px;color:#8a94ad">${escapeHtml(label)}</p>
    </td>`;
}

function buildBriefingEmail({ firstName, now, data, motivation }: BuildArgs) {
  const today = fmtDay.format(now);
  const subject = `🌇 Bilan de la journée — ${today}`;

  // ── Demain ──
  const tomorrowRows: string[] = [
    ...data.tomorrowCheckins.map((r) => tomorrowRowHtml(r, '🛬')),
    ...data.tomorrowCheckouts.map((r) => tomorrowRowHtml(r, '🛫')),
    ...data.tomorrowHousekeeping.map((r) => tomorrowRowHtml(r, '🧹')),
  ];
  const tomorrowHtml =
    tomorrowRows.length > 0 ? tomorrowRows.join('') : row(EMPTY);

  // ── À ne pas oublier ──
  const attentionHtml =
    data.attention.length > 0
      ? data.attention
          .map((a) => row(escapeHtml(a)))
          .join('')
      : row(EMPTY);

  // ── Revenus ──
  const rev = data.revenue;
  const revenueLines: string[] = [
    row(
      `Total encaissé aujourd'hui : <strong style="color:#101b36">${fmtMoney.format(rev.total)}</strong>`,
      undefined,
      true,
    ),
  ];
  if (rev.ordersCount > 0)
    revenueLines.push(row(`🥐 Commandes invités — ${rev.ordersCount} · ${fmtMoney.format(rev.ordersTotal)}`));
  if (rev.minibarCount > 0)
    revenueLines.push(row(`🍷 Minibar — ${rev.minibarCount} · ${fmtMoney.format(rev.minibarTotal)}`));
  if (rev.laundryCount > 0)
    revenueLines.push(row(`👔 Pressing — ${rev.laundryCount} · ${fmtMoney.format(rev.laundryTotal)}`));
  if (rev.lateCheckoutCount > 0)
    revenueLines.push(row(`⏱️ Départs tardifs payés — ${rev.lateCheckoutCount}`));
  if (
    rev.ordersCount === 0 &&
    rev.minibarCount === 0 &&
    rev.laundryCount === 0 &&
    rev.lateCheckoutCount === 0
  ) {
    revenueLines.push(row('<span style="font-size:13px;color:#8a94ad">Aucun encaissement aujourd\'hui.</span>'));
  }
  const revenueHtml = revenueLines.join('');

  // ── KPIs ──
  const k = data.kpis;
  const kpiHtml = [
    cardOpen(),
    '<tr>',
    kpiCell(String(k.scans), 'Scans du QR Hub aujourd\'hui'),
    kpiCell(String(k.activeSessions), 'Sessions invités actives'),
    '</tr>',
    '<tr>',
    kpiCell(String(k.edlSigned), 'EDL signés aujourd\'hui'),
    kpiCell(
      k.feedbackCount > 0
        ? `${String(k.feedbackCount)} · ${k.feedbackAvg !== null ? `${k.feedbackAvg.toFixed(1)}/5` : ''}`
        : '0',
      'Avis reçus aujourd\'hui',
    ),
    '</tr>',
    '<tr>',
    kpiCell(`${k.occupiedTonight}/${k.propertiesCount}`, 'Biens occupés ce soir'),
    kpiCell(`${fmtMoney.format(rev.total)}`, 'Revenus du jour'),
    '</tr>',
    '</table>',
  ].join('');

  // ── Terminé aujourd'hui ──
  const doneLines: string[] = [];
  if (data.done.housekeeping > 0)
    doneLines.push(row(`🧹 Ménages terminés et validés — ${data.done.housekeeping}`));
  if (data.done.edlSigned > 0) doneLines.push(row(`🧾 États des lieux signés — ${data.done.edlSigned}`));
  const doneHtml =
    doneLines.length > 0 ? doneLines.join('') : row(EMPTY);

  // ── Motivation ──
  const motivationHtml = motivation
    ? `<table style="width:100%;border-collapse:collapse;margin-top:24px;background:#fdf8ee;border:1px solid #eadfbe;border-radius:14px">
        <tr><td style="padding:16px 18px">
          <p style="margin:0;font-size:13.5px;line-height:1.6;color:#6b5320">💪 <strong style="color:#4a3a12">Journée calme ?</strong> ${escapeHtml(motivation)}</p>
        </td></tr>
      </table>`
    : '';

  const html = `
    <div style="background:#f7f6f3;padding:32px 16px;font-family:Georgia,'Times New Roman',serif">
      <div style="max-width:560px;margin:0 auto">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#8a94ad;text-align:center">RoomScan · Concierge Hub</p>
        <h1 style="margin:10px 0 4px;font-size:26px;font-weight:600;color:#101b36;text-align:center">🌇 Bilan de la journée</h1>
        <p style="margin:0 0 8px;font-size:14px;color:#5d6b8a;text-align:center">${escapeHtml(today)}</p>
        <p style="margin:0 0 6px;font-size:14px;color:#5d6b8a;text-align:center">Bonjour ${escapeHtml(firstName)} ! Voici votre briefing du soir et les préparatifs de demain.</p>

        ${sectionTitle('📅', 'Demain')}
        ${cardOpen()}${tomorrowHtml}</table>

        ${sectionTitle('⚠️', 'À ne pas oublier')}
        ${cardOpen()}${attentionHtml}</table>

        ${sectionTitle('💰', 'Revenus du jour')}
        ${cardOpen()}${revenueHtml}</table>

        ${sectionTitle('📈', 'KPIs du jour')}
        ${kpiHtml}

        ${sectionTitle('✅', 'Terminé aujourd\'hui')}
        ${cardOpen()}${doneHtml}</table>

        ${motivationHtml}

        <table style="width:100%;border-collapse:collapse;margin-top:30px">
          <tr>
            <td style="text-align:center;padding:18px;border-top:1px solid #e8edf6">
              <a href="${siteUrl}/airbnb/dashboard"
                 style="display:inline-block;padding:10px 22px;border-radius:9999px;background:#101b36;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none">
                Ouvrir mon tableau de bord
              </a>
              <p style="margin:14px 0 0;font-size:11px;color:#8a94ad">
                Chaque soir à 18 h ·
                <a href="${siteUrl}/airbnb/settings" style="color:#5d6b8a">Paramètres → Notifications</a> pour le désactiver.
              </p>
              <p style="margin:6px 0 0;font-size:11px;color:#b6bdd0">Bilan du soir RoomScan — activé par défaut sur votre compte.</p>
            </td>
          </tr>
        </table>
      </div>
    </div>`;

  // ── Version texte ──
  const textParts: string[] = [`BILAN DE LA JOURNÉE — ${today.toUpperCase()}`];
  textParts.push(`Bonjour ${firstName} !`);

  textParts.push('\n📅 DEMAIN');
  if (data.tomorrowCheckins.length + data.tomorrowCheckouts.length + data.tomorrowHousekeeping.length === 0) {
    textParts.push('  Rien à signaler.');
  } else {
    for (const r of data.tomorrowCheckins)
      textParts.push(`  🛬 ${r.time ? fmtTime.format(r.time) : ''} — ${r.guestName} · ${r.propertyName}${r.extra ? ` (${r.extra})` : ''}`);
    for (const r of data.tomorrowCheckouts)
      textParts.push(`  🛫 ${r.time ? fmtTime.format(r.time) : ''} — ${r.guestName} · ${r.propertyName}${r.extra ? ` (${r.extra})` : ''}`);
    for (const r of data.tomorrowHousekeeping)
      textParts.push(`  🧹 ${r.time ? fmtTime.format(r.time) : ''} — ${r.propertyName} (${r.extra ?? 'à planifier'})`);
  }

  textParts.push('\n⚠️ À NE PAS OUBLIER');
  if (data.attention.length === 0) textParts.push('  Rien à signaler.');
  else for (const a of data.attention) textParts.push(`  • ${a}`);

  textParts.push('\n💰 REVENUS DU JOUR');
  textParts.push(`  Total encaissé : ${fmtMoney.format(rev.total)}`);
  if (rev.ordersCount > 0) textParts.push(`  🥐 Commandes invités — ${rev.ordersCount} · ${fmtMoney.format(rev.ordersTotal)}`);
  if (rev.minibarCount > 0) textParts.push(`  🍷 Minibar — ${rev.minibarCount} · ${fmtMoney.format(rev.minibarTotal)}`);
  if (rev.laundryCount > 0) textParts.push(`  👔 Pressing — ${rev.laundryCount} · ${fmtMoney.format(rev.laundryTotal)}`);
  if (rev.lateCheckoutCount > 0) textParts.push(`  ⏱️ Départs tardifs payés — ${rev.lateCheckoutCount}`);

  textParts.push('\n📈 KPIS DU JOUR');
  textParts.push(`  Scans du QR Hub : ${k.scans} · Sessions actives : ${k.activeSessions}`);
  textParts.push(`  EDL signés : ${k.edlSigned} · Avis reçus : ${k.feedbackCount}${k.feedbackAvg !== null ? ` (moy. ${k.feedbackAvg.toFixed(1)}/5)` : ''}`);
  textParts.push(`  Biens occupés ce soir : ${k.occupiedTonight}/${k.propertiesCount}`);

  textParts.push('\n✅ TERMINÉ AUJOURD\'HUI');
  if (data.done.housekeeping === 0 && data.done.edlSigned === 0) textParts.push('  Rien à signaler.');
  if (data.done.housekeeping > 0) textParts.push(`  🧹 Ménages terminés — ${data.done.housekeeping}`);
  if (data.done.edlSigned > 0) textParts.push(`  🧾 EDL signés — ${data.done.edlSigned}`);

  if (motivation) textParts.push(`\n💪 JOURNÉE CALME ?\n  ${motivation}`);

  textParts.push(`\nTableau de bord : ${siteUrl}/airbnb/dashboard`);
  textParts.push(`Désactiver : ${siteUrl}/airbnb/settings (Paramètres → Notifications → Briefing du soir)`);

  return { subject, html, text: textParts.join('\n') };
}

// -------------------------------------------------------------
// Runner principal
// -------------------------------------------------------------

export async function runEveningBriefings(
  opts?: { force?: boolean; now?: Date },
): Promise<EveningBriefingRunSummary> {
  const summary: EveningBriefingRunSummary = { processed: 0, sent: 0, skipped: 0, failed: 0, details: [] };
  const now = opts?.now ?? new Date();
  const force = opts?.force === true;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

  // ── Tous les hôtes : owners de biens + membres acceptés (distinct) ──
  const [owners, members] = await Promise.all([
    db.property.findMany({ select: { ownerId: true }, distinct: ['ownerId'] }),
    db.propertyMember.findMany({ where: { acceptedAt: { not: null } }, select: { userId: true }, distinct: ['userId'] }),
  ]);
  const userIds = Array.from(new Set([...owners.map((o) => o.ownerId), ...members.map((m) => m.userId)]));
  if (userIds.length === 0) return summary;

  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, fullName: true, notificationPrefs: true },
  });

  for (const user of users) {
    const push = async (status: 'SENT' | 'SKIPPED' | 'FAILED', reason?: string) => {
      summary.processed += 1;
      summary[status === 'SENT' ? 'sent' : status === 'SKIPPED' ? 'skipped' : 'failed'] += 1;
      summary.details.push({ userId: user.id, status, reason });
    };

    try {
      if (!user.email || !user.email.includes('@')) {
        await push('SKIPPED', 'email_manquant');
        continue;
      }

      // ── Préférence : activé PAR DÉFAUT, désactivable (opt-out) ──
      const stored = (user.notificationPrefs ?? null) as Record<string, { email?: boolean; push?: boolean }> | null;
      const prefs = effectivePrefs(stored as never);
      if (!force && prefs.evening_briefing?.email !== true) {
        await push('SKIPPED', 'desactive_par_hote');
        continue;
      }

      // ── Échéance : 18 h serveur (rattrapage au tick horaire suivant) ──
      if (!force && now.getHours() < BRIEFING_HOUR) {
        await push('SKIPPED', 'trop_tot');
        continue;
      }

      // ── Anti-doublon : déjà envoyé (ou en file) aujourd'hui ? ──
      const already = await db.emailOutbox.count({
        where: {
          template: OUTBOX_TEMPLATE,
          userId: user.id,
          createdAt: { gte: startOfToday },
          status: { not: 'FAILED' },
        },
      });
      if (!force && already > 0) {
        await push('SKIPPED', 'deja_envoye');
        continue;
      }

      // ── Biens de l'utilisateur ──
      const properties = await resolveUserProperties(user.id);
      if (properties.length === 0) {
        await push('SKIPPED', 'aucun_bien');
        continue;
      }
      const propertyIds = properties.map((p) => p.id);
      const propertyNameOf = (propertyId: string) =>
        properties.find((p) => p.id === propertyId)?.name ?? 'Votre bien';

      const data = await collectEveningData(propertyIds, propertyNameOf, now);
      const motivation = data.noUpcoming ? pickMotivation(user.id, dateKey) : null;

      const { subject, html, text } = buildBriefingEmail({
        firstName: user.fullName?.split(' ')[0] || 'hôte',
        now,
        data,
        motivation,
      });

      const result = await queueEmail({
        to: user.email,
        subject,
        html,
        text,
        template: OUTBOX_TEMPLATE,
        userId: user.id,
        referenceType: 'evening_briefing',
        meta: {
          briefingHour: BRIEFING_HOUR,
          checkinsTomorrow: data.tomorrowCheckins.length,
          checkoutsTomorrow: data.tomorrowCheckouts.length,
          attention: data.attention.length,
          revenueTotal: data.revenue.total,
          scans: data.kpis.scans,
          motivation: motivation !== null,
        },
      });

      if (result.status === 'SENT') await push('SENT');
      else await push('FAILED', result.error ?? result.status);
    } catch (error) {
      console.error('[evening-briefing] utilisateur échoué :', error);
      await push('FAILED', error instanceof Error ? error.message.slice(0, 120) : 'erreur');
    }
  }

  return summary;
}
