// =============================================================
// ROOMSCAN INVENTAIRE (v5.0) — MODE D'EMPLOI PDF (pdfkit).
// Demande client : « dans mode d'emploi mettre un bouton
// télécharger qui permet de télécharger le document pdf ».
//
// Document A4 autonome (aucune donnée dynamique → aucune BDD) :
//   · bandeau d'en-tête marque bleu profond / rouge RoomScan ;
//   · encart intro « zéro papier, zéro litige » ;
//   · les 6 étapes d'un séjour certifié (timeline numérotée) ;
//   · les notifications automatiques (7 encarts) ;
//   · pied de page roomscan.pro.
// POLICES : DejaVu embarquées public/fonts (glyphes é à ç) —
// fallback Helvetica propre. pdfkit externalisé (serverExternalPackages)
// → import dynamique comme shield-pdf.ts.
// =============================================================

import { readFile } from 'fs/promises';
import path from 'path';

type PdfDoc = typeof import('pdfkit');

const FONT_FILES: Record<string, string> = {
  'DVS': 'DejaVuSans.ttf',
  'DVS-B': 'DejaVuSans-Bold.ttf',
  'DVM': 'DejaVuSansMono.ttf',
  'DVM-B': 'DejaVuSansMono-Bold.ttf',
};

let fontsDirCache: string | null | undefined;

async function findFontsDir(): Promise<string | null> {
  if (fontsDirCache !== undefined) return fontsDirCache;
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'public', 'fonts'),
    path.join(cwd, '.next', 'standalone', 'public', 'fonts'),
  ];
  for (const dir of candidates) {
    try {
      await readFile(path.join(dir, 'DejaVuSans-Bold.ttf'));
      fontsDirCache = dir;
      return dir;
    } catch {
      // candidat suivant
    }
  }
  fontsDirCache = null;
  return null;
}

async function registerFonts(doc: PdfDoc): Promise<boolean> {
  const dir = await findFontsDir();
  if (!dir) return false;
  try {
    for (const [name, file] of Object.entries(FONT_FILES)) {
      doc.registerFont(name, path.join(dir, file));
    }
    return true;
  } catch {
    return false;
  }
}

function fname(kind: 'body' | 'bold' | 'mono', fontsOk: boolean): string {
  if (!fontsOk) {
    switch (kind) {
      case 'bold': return 'Helvetica-Bold';
      case 'mono': return 'Courier';
      default: return 'Helvetica';
    }
  }
  switch (kind) {
    case 'bold': return 'DVS-B';
    case 'mono': return 'DVM';
    default: return 'DVS';
  }
}

interface Step {
  num: string;
  title: string;
  description: string;
  badge?: string;
}

const STEPS: Step[] = [
  {
    num: '1',
    title: 'Activer l\u2019Inventaire & créer le logement',
    description:
      'Après le paiement, un assistant de 5 minutes vous guide : nom du logement, pièces, équipements. Votre référence unique ONB-XXX est générée automatiquement.',
  },
  {
    num: '2',
    title: 'Les photos de référence',
    description:
      'Photographiez chaque pièce et chaque équipement depuis votre dashboard — ou déléguez : votre équipe sur place ouvre le lien magique /upload/[token] (valable 7 jours) et photographie à votre place. Vous êtes notifié à réception.',
  },
  {
    num: '3',
    title: 'CHECK-IN — état des lieux d\u2019entrée en 90 s',
    description:
      'À l\u2019arrivée du voyageur, une photo par pièce suffit : la comparaison automatique avec les références est instantanée et le rapport PDF d\u2019entrée vous est envoyé.',
  },
  {
    num: '4',
    title: 'Le ménage',
    description:
      'Votre agent reçoit un lien /s/[token] (app cleaner) : photos « fantômes » des zones et vidéo walkthrough de 120 secondes maximum. Tout est horodaté.',
  },
  {
    num: '5',
    title: 'CHECK-OUT — état des lieux de sortie',
    description:
      'Comparatif automatique entrée / sortie : les dégradations éventuelles sont signalées avec leurs preuves photo, prêtes à l\u2019emploi.',
  },
  {
    num: '6',
    title: 'Le Certificat Anti-Dégâts',
    description:
      'PDF scellé par hash SHA256 accompagné du dossier de preuves horodatées : un document officiel, utilisable en cas de litige Airbnb.',
    badge: 'Certificat',
  },
];

interface Notif {
  title: string;
  description: string;
  alert?: boolean;
  tag?: string;
}

const NOTIFICATIONS: Notif[] = [
  { title: 'Création du logement', description: 'Email de confirmation avec votre référence ONB-XXX dès la fin de l\u2019assistant de configuration.' },
  { title: 'Réception des photos de délégation', description: 'Vos photos de référence sont disponibles dès que votre équipe a terminé ses prises de vue.' },
  { title: 'Check-in réalisé', description: 'Le rapport PDF d\u2019entrée arrive dès la fin de l\u2019état des lieux (90 s au compteur).' },
  { title: 'Ménage réalisé', description: 'Photos fantômes des zones et vidéo walkthrough, horodatées, déposées dans votre dashboard.' },
  { title: 'Check-out réalisé', description: 'Le comparatif complet entrée / sortie est prêt à consulter, preuves à l\u2019appui.' },
  { title: 'Dégradation détectée', description: 'Alerte immédiate avec les photos de la dégradation et le dossier de litige pré-rempli.', alert: true, tag: 'Prioritaire' },
  { title: 'Certificat disponible', description: 'Votre Certificat Anti-Dégâts PDF scellé est téléchargeable depuis le dashboard.' },
];

const BLEU = '#055492';
const ROUGE = '#C41E3A';
const GRIS = '#64748b';
const GRIS_CLAIR = '#eef2f7';

/** Tronque un texte à N caractères + ellipsis (pdfkit TextOptions
 *  n'expose pas maxLines/ellipsis typés → troncature amont). */
function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function renderModeDEmploiPdf(): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Mode d\u2019emploi — RoomScan Inventaire' } });
  const fontsOk = await registerFonts(doc);

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width;
  const H = doc.page.height;
  const M = 48;
  const body = fname('body', fontsOk);
  const bold = fname('bold', fontsOk);

  // ---------- Bandeau d'en-tête ----------
  doc.rect(0, 0, W, 132).fill(BLEU);
  // Accent rouge diagonal (parallélogramme, signature RoomScan)
  doc
    .path(`M ${W - 210} 0 L ${W - 140} 0 L ${W - 226} 132 L ${W - 296} 132 Z`)
    .fill(ROUGE);
  doc.path(`M ${W - 120} 0 L ${W - 80} 0 L ${W - 166} 132 L ${W - 206} 132 Z`).fill('#3e559a');
  doc.fillColor('#C7D2FE').font(body).fontSize(9).text('ROOMSCAN INVENTAIRE — ÉTATS DES LIEUX CERTIFIÉS', M, 34, { characterSpacing: 1.6 });
  doc.fillColor('#ffffff').font(bold).fontSize(26).text('Mode d\u2019emploi', M, 52);
  doc.fillColor('#C7D2FE').font(body).fontSize(10.5).text(
    'Les 6 étapes d\u2019un séjour certifié et les notifications automatiques.',
    M,
    86,
  );

  let y = 168;

  // ---------- Encart intro ----------
  const introText =
    'Zéro papier, zéro litige : l\u2019Inventaire RoomScan photographie, compare et certifie chaque séjour. Chaque étape génère des preuves photo horodatées, comparées par l\u2019IA et scellées dans un certificat.';
  const introH = 74;
  doc.roundedRect(M, y, W - M * 2, introH, 10).lineWidth(1).fillAndStroke('#f0f5ff', '#c7d6f5');
  doc.roundedRect(M, y, 6, introH, 3).fill(ROUGE);
  doc.fillColor('#0f172a').font(bold).fontSize(11).text(
    'Comment fonctionne l\u2019Inventaire ?',
    M + 22,
    y + 14,
  );
  doc.fillColor(GRIS).font(body).fontSize(9.2).text(introText, M + 22, y + 32, { width: W - M * 2 - 40, lineGap: 2.5 });
  y += introH + 30;

  // ---------- Les 6 étapes ----------
  doc.fillColor('#0f172a').font(bold).fontSize(14).text('Les 6 étapes', M, y);
  y += 24;

  const stepH = 88;
  for (const s of STEPS) {
    // Saut de page AVANT chaque carte si elle ne tient plus (évite le
    // saut automatique de pdfkit qui créait une page blanche).
    if (y + stepH > H - 70) {
      doc.addPage();
      y = 56;
    }
    // Carte
    doc.roundedRect(M, y, W - M * 2, stepH, 10).fillAndStroke('#ffffff', GRIS_CLAIR);
    // Pastille numérotée
    doc.circle(M + 34, y + 30, 16).fill(BLEU);
    doc.fillColor('#ffffff').font(bold).fontSize(13).text(s.num, M + 34 - 5, y + 24, { width: 12, align: 'center' });
    // Titre + badge
    let tx = M + 62;
    doc.fillColor('#0f172a').font(bold).fontSize(11.5).text(s.title, tx, y + 16);
    if (s.badge) {
      const bw = doc.widthOfString(s.badge) + 14;
      doc.roundedRect(tx, y + 36, bw, 15, 7).fill(ROUGE);
      doc.fillColor('#ffffff').font(bold).fontSize(7.5).text(s.badge, tx + 7, y + 40);
    }
    // Description (tronquée à 3 lignes ≈ 300 chars pour la largeur A4)
    doc.fillColor(GRIS).font(body).fontSize(8.8).text(
      clamp(s.description, 300),
      M + 62,
      y + (s.badge ? 58 : 40),
      { width: W - M * 2 - 84, lineGap: 2.2, height: 30 },
    );
    y += stepH + 12;
  }

  y += 14;

  // ---------- Notifications automatiques ----------
  // Le bloc complet (~450 px) doit tenir sur la page courante, sinon
  // saut de page manuel AVANT le bandeau (jamais de page blanche).
  if (y + 44 + NOTIFICATIONS.length * (44 + 8) > H - 70) {
    doc.addPage();
    y = 56;
  }
  const notifH = 44;
  doc.roundedRect(M, y, W - M * 2, 30, 8).fill(BLEU);
  doc.fillColor('#ffffff').font(bold).fontSize(11.5).text('Notifications envoyées automatiquement', M + 16, y + 9);
  y += 44;
  for (const n of NOTIFICATIONS) {
    const stroke = n.alert ? '#f3c4cd' : GRIS_CLAIR;
    const fill = n.alert ? '#fff5f6' : '#ffffff';
    doc.roundedRect(M, y, W - M * 2, notifH, 8).fillAndStroke(fill, stroke);
    // Point coloré
    doc.circle(M + 20, y + notifH / 2, 5).fill(n.alert ? ROUGE : BLEU);
    let nx = M + 34;
    doc.fillColor(n.alert ? ROUGE : '#0f172a').font(bold).fontSize(9.8).text(n.title, nx, y + 9);
    if (n.tag) {
      const tw = doc.widthOfString(n.tag) + 12;
      doc.roundedRect(W - M - tw - 12, y + 7, tw, 14, 7).fill(n.alert ? ROUGE : BLEU);
      doc.fillColor('#ffffff').font(bold).fontSize(7).text(n.tag, W - M - tw - 6, y + 10.5);
    }
    doc.fillColor(GRIS).font(body).fontSize(8.4).text(clamp(n.description, 220), nx, y + 24, { width: W - M * 2 - 56 });
    y += notifH + 8;
  }

  // ---------- Pied de page (2 pages potentielles) ----------
  function footer() {
    doc.rect(0, H - 46, W, 46).fill('#0f172a');
    doc.fillColor('#94a3b8').font(body).fontSize(8).text(
      'RoomScan Inventaire — états des lieux certifiés par photo, comparaison IA et certificat SHA-256.',
      M,
      H - 32,
    );
    doc.fillColor('#ffffff').font(bold).fontSize(8.5).text('roomscan.pro', W - M - 78, H - 32);
  }
  footer();

  // Numérotation des pages
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fillColor('#94a3b8').font(fname('mono', fontsOk)).fontSize(7).text(`${i + 1} / ${range.count}`, W - M - 60, H - 14, { width: 60, align: 'right' });
  }

  doc.end();
  return done;
}
