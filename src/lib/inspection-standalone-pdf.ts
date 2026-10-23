// =============================================================
// v4.111 « ÉTAT DES LIEUX » — MODULE STANDALONE — LIB PDF (pdfkit)
//
// REFONTE VISUELLE — design conforme au modèle client (document certifié
// premium). v4.123 : les TITRES sont les TITRES MÉTIERS (demande client —
// plus de « ROOMSCAN BOUCLIER ») :
//   · Page 1  : bandeau ROUGE plein (bouclier + titre métier centré),
//     pilule noire « PREUVE CERTIFIÉE — ID RS-XXXXXX », bloc QR
//     « SCANNER POUR VÉRIFIER L'AUTHENTICITÉ » + empreinte SHA-256
//     + lien de vérification rouge, encadré parties (logement/hôte/
//     invité), puis sections NUMÉROTÉES à bandeaux rouges arrondis
//     avec icône : 1. Ménage (photo horodatée + état), 2..N pièces
//     en CARTES 3 colonnes (nom, vignette, « État : Bon ✓ »,
//     commentaire si dégradation) + pilule « Total contrôlés ».
//   · Page noire : bandeau NOIR « CONTRÔLES ÉLECTRONIQUE &
//     ÉLECTROMÉNAGER », cartes appareils avec preuves photo ON / OFF
//     horodatées + hash SHA-256 de CHAQUE photo + statut coloré.
//   · Dernière page : encadré rouge « DÉCLARATION LÉGALE &
//     ANTI-FRAUDE » : certification, valeur juridique (Code civil
//     1365/1366), « Fait à [Ville], le [date], en 2 exemplaires
//     originaux », signature invité REPRODUITE + cadre signature
//     propriétaire, preuves techniques (GPS, IP, empreinte).
//   · Pieds de page : « Page i/n • Document officiel RoomScan •
//     Attestation d'état des lieux • … » + bandeau noir « Cachet
//     électronique scellé •
//     Empreinte globale : xxxx…xxxx • Anti-fraude certifié ».
//
// POLICES : DejaVu (Sans/Bold/Mono) embarquées dans public/fonts →
// glyphes ✓ • ● disponibles. Fallback propre sur Helvetica/Courier
// (sans ✓) si le dossier est absent. Icônes (bouclier, balai, canapé,
// TV, frigo, coche) dessinées en VECTEURS pdfkit — aucun émoji.
//
// Robustesse : AUCUNE entrée ne fait planter le document (photos /
// signature illisibles → cadre conservé ; QR / logo / polices
// absents → dégradation gracieuse). pdfkit externalisé
// (serverExternalPackages) — import dynamique dans la fonction.
// =============================================================

import { readFile } from 'fs/promises';
import path from 'path';
import { loadRoomscanLogoWhite } from '@/lib/pdf-brand-file';
import { createHash } from 'crypto';
import { inspectionDocumentId } from './inspection-hash';
import { isElectronicItem } from './inspection-template';

// Type de l'instance PDFKit (module typé `export = doc` → typeof).
type PdfDoc = typeof import('pdfkit');

// ---------- Types d'entrée (interface stable — voir route PDF) ----------

export interface StandalonePdfItem {
  name: string;
  state: string; // 'TRES_BON' | 'BON' | 'MOYEN' | 'MAUVAIS'
  comment?: string | null;
  photoUrl?: string | null; // dataURL (jpeg/png) — défaut signalé
  photoOnUrl?: string | null; // appareil électronique ALLUMÉ
  photoOffUrl?: string | null; // appareil électronique ÉTEINT
}

export interface StandalonePdfRoom {
  name: string;
  globalState: string; // 'TRES_BON' | 'BON' | 'MOYEN' | 'MAUVAIS'
  comment?: string | null;
  items: StandalonePdfItem[];
}

export interface StandaloneInspectionPdfData {
  inspection: {
    publicToken: string;
    propertyName: string;
    propertyAddress: string;
    ownerName: string;
    guestName: string;
    type: string; // 'ENTREE' | 'SORTIE'
    scheduledDate: Date;
    status: string; // 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
    signedAt?: Date | null;
    completedAt?: Date | null;
    cleanlinessScore?: string | null;
    cleanlinessComment?: string | null;
    /** dataURL de la photo de propreté (preuve horodatée). */
    cleanlinessPhotoUrl?: string | null;
    guestSignature?: string | null;
    /** Date de l'EDL d'entrée lié (SORTIE uniquement). */
    linkedEntranceDate?: Date | null;
    // ── Preuve & anti-fraude ──
    /** Ville légale (« Fait à … ») — fallback : 1re partie de l'adresse. */
    city?: string | null;
    /** Empreinte SHA-256 du contenu canonique (calculée à la signature). */
    sha256Hash?: string | null;
    /** Position GPS de l'invité à la signature (optionnelle). */
    gpsLocation?: string | null;
    /** Adresse IP de signature (stockée serveur). */
    ipAddress?: string | null;
  };
  rooms: StandalonePdfRoom[];
  // ── v4.165 — champs optionnels du flux HUB (checkout-inspection) ──
  /** Commentaire libre global de l'invité (« Un problème à signaler ? »). */
  guestNotes?: string | null;
  /** Inventaire rendu (sortie) : clés, télécommandes, serviettes. */
  inventory?: { keys: number; remotes: number; towels: number } | null;
  /** Minibar déclaré (sortie) : unités consommées par article. */
  minibar?: { name: string; consumed: number }[] | null;
}

// ---------- Constantes page & palette « Bouclier » ----------

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2; // 515.28
/** Réserve basse : pieds de page (2 lignes + bandeau noir). */
const FOOTER_ZONE = 58;
const MAX_Y = PAGE_H - MARGIN - FOOTER_ZONE;

const RED = '#C21F26'; // rouge RoomScan (bandeaux, en-tête)
const DARK = '#17171A'; // noir bandeau page contrôles / pilule
const INK = '#1F2937';
const MUTED = '#6B7280';
const LIGHT_BG = '#F6F6F7'; // encadrés gris clair
const CARD_BORDER = '#E3E4E8';
const GREEN = '#1F9D44'; // coches vertes
const GREEN_TXT = '#157A3A';
const LIME_TXT = '#4D7C0F';
const AMBER = '#D97706';
const BAD = '#C21F26';
const RED_BG = '#FDF1F1'; // fond déclaration légale
const GRAY_PILL = '#F0F0F2';

const BAND_H = 86; // bandeau rouge page 1
const DARK_BAND_H = 62; // bandeau noir page contrôles

const STATE_COLORS: Record<string, string> = {
  TRES_BON: GREEN_TXT,
  BON: LIME_TXT,
  MOYEN: AMBER,
  MAUVAIS: BAD,
};
const STATE_LABELS: Record<string, string> = {
  TRES_BON: 'Très bon',
  BON: 'Bon',
  MOYEN: 'Moyen',
  MAUVAIS: 'Mauvais',
};
const CLEAN_COLORS: Record<string, string> = {
  IMPECCABLE: GREEN,
  CORRECT: GREEN,
  A_NETTOYER: AMBER,
  TRES_SALE: BAD,
};
const CLEAN_LABELS: Record<string, string> = {
  IMPECCABLE: 'IMPECCABLE',
  CORRECT: 'CORRECT',
  A_NETTOYER: 'À NETTOYER',
  TRES_SALE: 'TRÈS SALE',
};

// ---------- Polices DejaVu (embarquées public/fonts) ----------

const FONT_FILES: Record<string, string> = {
  DVS: 'DejaVuSans.ttf',
  'DVS-B': 'DejaVuSans-Bold.ttf',
  DVM: 'DejaVuSansMono.ttf',
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

/** Enregistre les polices sur le doc. false → fallback Helvetica/Courier. */
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

/** Nom de police sûr selon la dispo des DejaVu. */
type FontName = 'body' | 'bold' | 'mono' | 'monoBold';
function fname(kind: FontName, fontsOk: boolean): string {
  if (!fontsOk) {
    switch (kind) {
      case 'bold':
        return 'Helvetica-Bold';
      case 'mono':
        return 'Courier';
      case 'monoBold':
        return 'Courier-Bold';
      default:
        return 'Helvetica';
    }
  }
  switch (kind) {
    case 'bold':
      return 'DVS-B';
    case 'mono':
      return 'DVM';
    case 'monoBold':
      return 'DVM-B';
    default:
      return 'DVS';
  }
}

/** Coche ✓ (uniquement si DejaVu est chargée — absente de WinAnsi). */
function CHK(fontsOk: boolean): string {
  return fontsOk ? '\u2713' : '';
}

// ---------- Helpers généraux ----------

/** Décode un dataURL (image/png|jpeg) en Buffer — null si invalide. */
function decodeDataUrl(dataUrl: unknown): Buffer | null {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,([\s\S]+)$/);
  if (!match) return null;
  try {
    const buf = Buffer.from(match[2], 'base64');
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

/** Hash SHA-256 d'une preuve photo — forme courte « a3f1…d92e ». */
function sha256Short(buf: Buffer): string {
  const h = createHash('sha256').update(buf).digest('hex');
  return `${h.slice(0, 4)}\u2026${h.slice(-4)}`;
}

const frDateShort = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const frTime = (d: Date) =>
  d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const frDateLong = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const frDateTime = (d: Date) =>
  d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function stateLabel(state: string): string {
  return STATE_LABELS[state] ?? state;
}
function stateColor(state: string): string {
  return STATE_COLORS[state] ?? INK;
}

/** Saut de page si l'espace restant est insuffisant. */
function ensureSpace(doc: PdfDoc, needed: number): void {
  if (doc.y + needed > MAX_Y) doc.addPage();
}

/** Tronque une chaîne sur UNE ligne à la largeur donnée (avec …). */
function fitOneLine(doc: PdfDoc, text: string, maxWidth: number): string {
  if (doc.widthOfString(text) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && doc.widthOfString(`${out}\u2026`) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}\u2026`;
}

/** Texte positionné une ligne (n'influence pas le flux doc.y). */
function txt(
  doc: PdfDoc,
  font: string,
  size: number,
  color: string,
  str: string,
  x: number,
  y: number,
  width: number,
  align: 'left' | 'center' | 'right' = 'left',
): void {
  doc
    .font(font)
    .fontSize(size)
    .fillColor(color)
    .text(str, x, y, { width, align, lineBreak: false });
}

/** Pastille d'état : coche ✓ uniquement pour les états positifs. */
function stateCheck(state: string, fontsOk: boolean): string {
  return fontsOk && (state === 'TRES_BON' || state === 'BON') ? '\u2713' : '';
}

// ---------- Icônes vectorielles (blanches sur bandeaux) ----------

/** Bouclier + coche — emblème graphique du certificat. */
function drawShield(doc: PdfDoc, cx: number, cy: number, s: number): void {
  const w = s * 0.86;
  const top = cy - s * 0.5;
  doc.save();
  doc.moveTo(cx - w / 2, top + s * 0.08);
  doc.lineTo(cx, top);
  doc.lineTo(cx + w / 2, top + s * 0.08);
  doc.lineTo(cx + w / 2, cy + s * 0.1);
  doc.bezierCurveTo(cx + w / 2, cy + s * 0.32, cx + s * 0.16, cy + s * 0.47, cx, cy + s * 0.5);
  doc.bezierCurveTo(cx - s * 0.16, cy + s * 0.47, cx - w / 2, cy + s * 0.32, cx - w / 2, cy + s * 0.1);
  doc.closePath();
  doc.lineWidth(Math.max(1.5, s * 0.085));
  doc.strokeColor('#ffffff').stroke();
  doc.moveTo(cx - s * 0.17, cy - s * 0.01);
  doc.lineTo(cx - s * 0.04, cy + s * 0.11);
  doc.lineTo(cx + s * 0.21, cy - s * 0.13);
  doc.lineWidth(Math.max(1.6, s * 0.1));
  doc.lineCap('round');
  doc.lineJoin('round');
  doc.stroke();
  doc.restore();
}

/** Pastille ronde + coche blanche (validation verte du modèle). */
function drawCheckCircle(doc: PdfDoc, cx: number, cy: number, d: number, bg = GREEN): void {
  doc.save();
  doc.circle(cx, cy, d / 2).fill(bg);
  doc
    .moveTo(cx - d * 0.21, cy + d * 0.0)
    .lineTo(cx - d * 0.05, cy + d * 0.16)
    .lineTo(cx + d * 0.23, cy - d * 0.15);
  doc.lineWidth(Math.max(1.2, d * 0.15));
  doc.strokeColor('#ffffff');
  doc.lineCap('round');
  doc.lineJoin('round');
  doc.stroke();
  doc.restore();
}

/** Balai (section Ménage). */
function drawBroom(doc: PdfDoc, cx: number, cy: number, s: number): void {
  doc.save();
  doc
    .moveTo(cx + s * 0.3, cy - s * 0.46)
    .lineTo(cx + s * 0.06, cy + s * 0.04)
    .lineWidth(Math.max(1.4, s * 0.1))
    .strokeColor('#ffffff')
    .lineCap('round')
    .stroke();
  doc
    .moveTo(cx + s * 0.0, cy - s * 0.06)
    .lineTo(cx + s * 0.24, cy - s * 0.16)
    .lineTo(cx - s * 0.18, cy + s * 0.48)
    .lineTo(cx - s * 0.42, cy + s * 0.26)
    .closePath()
    .fill('#ffffff');
  doc.restore();
}

/** Canapé (sections pièces / meubles). */
function drawSofa(doc: PdfDoc, cx: number, cy: number, s: number): void {
  doc.save();
  doc.fillColor('#ffffff');
  doc.roundedRect(cx - s * 0.36, cy - s * 0.3, s * 0.72, s * 0.34, 1.5).fill();
  doc.roundedRect(cx - s * 0.44, cy + s * 0.02, s * 0.88, s * 0.24, 1.5).fill();
  doc.roundedRect(cx - s * 0.5, cy - s * 0.12, s * 0.13, s * 0.38, 1.5).fill();
  doc.roundedRect(cx + s * 0.37, cy - s * 0.12, s * 0.13, s * 0.38, 1.5).fill();
  doc.restore();
}

/** Télévision (section Électronique). */
function drawTv(doc: PdfDoc, cx: number, cy: number, s: number): void {
  doc.save();
  doc.roundedRect(cx - s * 0.42, cy - s * 0.34, s * 0.84, s * 0.56, 2).lineWidth(Math.max(1.4, s * 0.075)).strokeColor('#ffffff').stroke();
  doc
    .moveTo(cx, cy + s * 0.22)
    .lineTo(cx, cy + s * 0.34)
    .lineWidth(Math.max(1.4, s * 0.075))
    .strokeColor('#ffffff')
    .stroke();
  doc
    .moveTo(cx - s * 0.16, cy + s * 0.38)
    .lineTo(cx + s * 0.16, cy + s * 0.38)
    .lineWidth(Math.max(1.4, s * 0.075))
    .lineCap('round')
    .stroke();
  doc.restore();
}

/** Réfrigérateur (section Électroménager). */
function drawFridge(doc: PdfDoc, cx: number, cy: number, s: number): void {
  doc.save();
  doc.roundedRect(cx - s * 0.26, cy - s * 0.46, s * 0.52, s * 0.92, 2).lineWidth(Math.max(1.4, s * 0.075)).strokeColor('#ffffff').stroke();
  doc
    .moveTo(cx - s * 0.26, cy - s * 0.1)
    .lineTo(cx + s * 0.26, cy - s * 0.1)
    .lineWidth(Math.max(1.2, s * 0.06))
    .stroke();
  doc.lineWidth(Math.max(1.2, s * 0.06));
  doc.moveTo(cx + s * 0.11, cy - s * 0.34).lineTo(cx + s * 0.11, cy - s * 0.18).stroke();
  doc.moveTo(cx + s * 0.11, cy - s * 0.02).lineTo(cx + s * 0.11, cy + s * 0.16).stroke();
  doc.restore();
}

type IconKind = 'broom' | 'sofa' | 'tv' | 'fridge';

function drawSectionIcon(doc: PdfDoc, kind: IconKind, cx: number, cy: number, s: number): void {
  switch (kind) {
    case 'broom':
      drawBroom(doc, cx, cy, s);
      break;
    case 'sofa':
      drawSofa(doc, cx, cy, s);
      break;
    case 'tv':
      drawTv(doc, cx, cy, s);
      break;
    case 'fridge':
      drawFridge(doc, cx, cy, s);
      break;
  }
}

// ---------- Bandeaux & en-têtes ----------

/**
 * Titre métier du document (v4.123 — demande client : plus de
 * « ROOMSCAN INVENTAIRE » ; les titres sont ceux du modèle Inventaire) :
 *   ENTREE → « ATTESTATION D'ÉTAT DES LIEUX D'ENTRÉE »
 *   SORTIE → « RAPPORT DE SORTIE — COMPARATIF ENTRÉE / SORTIE »
 */
function documentTitle(type: string): string {
  return type === 'SORTIE'
    ? 'RAPPORT DE SORTIE \u2014 COMPARATIF ENTR\u00c9E / SORTIE'
    : 'ATTESTATION D\u2019\u00c9TAT DES LIEUX D\u2019ENTR\u00c9E';
}

/** Réduit la taille du titre jusqu'à tenir (icône + gap + texte) dans maxW. */
function fitTitleSize(
  doc: PdfDoc,
  title: string,
  baseSize: number,
  maxW: number,
  iconS: number,
  gap: number,
  fontsOk: boolean,
): number {
  doc.font(fname('bold', fontsOk));
  let size = baseSize;
  while (
    size > 9 &&
    iconS * (size / baseSize) + gap + doc.fontSize(size).widthOfString(title) > maxW
  ) {
    size -= 0.5;
  }
  return size;
}

/**
 * Bandeau rouge page 1 : bouclier + TITRE MÉTIER centrés (v4.123 —
 * « ATTESTATION D'ÉTAT DES LIEUX D'ENTRÉE » / « RAPPORT DE SORTIE —
 * COMPARATIF ENTRÉE / SORTIE », auto-fit), pilule noire
 * « PREUVE CERTIFIÉE — ID RS-XXXXXX ».
 */
function drawRedHeader(doc: PdfDoc, data: StandaloneInspectionPdfData, fontsOk: boolean, logoWhite?: Buffer | null): void {
  doc.save();
  doc.rect(0, 0, PAGE_W, BAND_H).fill(RED);
  doc.restore();

  const title = documentTitle(data.inspection.type);
  const iconS = 25;
  const gap = 9;
  // v5.10 — maxW réduit (PAGE_W-170) pour réserver l'angle droit du
  // bandeau au logo officiel blanc.
  const size = fitTitleSize(doc, title, 19, PAGE_W - 170, iconS, gap, fontsOk);
  const scaledIconS = iconS * (size / 19);
  doc.font(fname('bold', fontsOk)).fontSize(size);
  const titleW = doc.widthOfString(title);
  const groupW = scaledIconS + gap + titleW;
  const gx = (PAGE_W - groupW) / 2;
  drawShield(doc, gx + scaledIconS / 2, 30, scaledIconS);
  txt(
    doc,
    fname('bold', fontsOk),
    size,
    '#ffffff',
    title,
    gx + scaledIconS + gap,
    21 + (19 - size) * 0.45,
    titleW,
    'left',
  );

  // v5.10 — LOGO OFFICIEL blanc, calé à droite du bandeau rouge
  if (logoWhite) {
    try {
      const h = 20;
      const w = h * (754 / 283);
      doc.image(logoWhite, PAGE_W - 24 - w, (BAND_H - h) / 2, { height: h });
    } catch {
      // logo illisible — bandeau sans logo
    }
  }

  // — Pilule noire : PREUVE CERTIFIÉE — ID RS-XXXXXX —
  const pillText = `PREUVE CERTIFI\u00c9E \u2014 ID ${inspectionDocumentId(data.inspection.publicToken)}`;
  doc.font(fname('bold', fontsOk)).fontSize(7.2);
  const pillW = doc.widthOfString(pillText) + 22;
  const pillH = 16;
  const pillX = (PAGE_W - pillW) / 2;
  const pillY = 55;
  doc.save();
  doc.roundedRect(pillX, pillY, pillW, pillH, pillH / 2).fill(DARK);
  doc.restore();
  txt(doc, fname('bold', fontsOk), 7.2, '#ffffff', pillText, pillX, pillY + 4.5, pillW, 'center');

  doc.y = BAND_H + 14;
}

/**
 * Bloc QR (page 1) : QR géant encadré, consigne de scan, empreinte
 * SHA-256, lien de vérification en rouge.
 */
async function drawVerificationBlock(
  doc: PdfDoc,
  data: StandaloneInspectionPdfData,
  fontsOk: boolean,
): Promise<void> {
  const ins = data.inspection;
  const qrOuter = 128;
  const qrSize = 116;
  const boxX = (PAGE_W - qrOuter) / 2;
  const boxY = doc.y;

  doc.save();
  doc.roundedRect(boxX, boxY, qrOuter, qrOuter, 6).lineWidth(1).strokeColor('#D8D8DB').stroke();
  doc.restore();

  let qrDrawn = false;
  try {
    const qrcode = await import('qrcode');
    const qrData = await qrcode.toDataURL(`https://roomscan.pro/i/${ins.publicToken}`, {
      width: 360,
      margin: 1,
      color: { dark: '#141414', light: '#ffffff' },
    });
    const qrBuf = decodeDataUrl(qrData);
    if (qrBuf) {
      doc.image(qrBuf, boxX + (qrOuter - qrSize) / 2, boxY + 6, { width: qrSize, height: qrSize });
      qrDrawn = true;
    }
  } catch {
    // QR indisponible — le bloc reste lisible sans lui.
  }

  let ty = boxY + qrOuter + (qrDrawn ? 10 : 4);
  const centered = (str: string, font: FontName, size: number, color: string, h: number) => {
    txt(doc, fname(font, fontsOk), size, color, str, MARGIN, ty, CONTENT_W, 'center');
    ty += h;
  };

  centered('SCANNER POUR V\u00c9RIFIER L\u2019AUTHENTICIT\u00c9', 'bold', 9.5, DARK, 15);
  centered('Adresse GPS Hash SHA256 :', 'body', 7.5, MUTED, 11);
  if (ins.sha256Hash) {
    const hash = ins.sha256Hash.toLowerCase();
    doc.font(fname('mono', fontsOk)).fontSize(6.4).fillColor(INK);
    doc.text(`SHA256: ${hash.slice(0, 32)}`, MARGIN, ty, { width: CONTENT_W, align: 'center', lineBreak: false });
    doc.text(`SHA256: ${hash.slice(32)}`, MARGIN, ty + 8, { width: CONTENT_W, align: 'center', lineBreak: false });
    ty += 21;
  } else {
    centered('SHA256 : disponible apr\u00e8s signature \u00e9lectronique', 'mono', 6.4, MUTED, 13);
  }
  centered(`Lien de v\u00e9rification : roomscan.pro/i/${ins.publicToken}`, 'bold', 8, RED, 12);

  doc.y = ty + 6;
}

/**
 * Encadré parties (page 1, 2 colonnes) : logement, adresse, ville,
 * propriétaire, invité, type, date — mention légale complète.
 */
function drawInfoBox(doc: PdfDoc, data: StandaloneInspectionPdfData, fontsOk: boolean): void {
  const ins = data.inspection;
  const signed = ins.status === 'COMPLETED';
  const pad = 12;
  const colGap = 16;
  const colW = (CONTENT_W - pad * 2 - colGap) / 2;

  type Row = { label: string; value: string; extraLines: number };
  const buildRows = (): { left: Row[]; right: Row[] } => {
    const addr = ins.propertyAddress || '\u2014';
    doc.font(fname('body', fontsOk)).fontSize(8.2);
    const addrLines = Math.max(1, Math.ceil(doc.widthOfString(addr) / (colW - 8)));
    const left: Row[] = [
      { label: 'LOGEMENT', value: fitOneLine(doc, ins.propertyName || '\u2014', colW - 8), extraLines: 0 },
      { label: 'ADRESSE', value: addr, extraLines: addrLines - 1 },
      { label: 'VILLE (MENTION \u00ab FAIT \u00c0 \u00bb)', value: ins.city?.trim() || '\u2014', extraLines: 0 },
    ];
    const right: Row[] = [
      { label: 'PROPRI\u00c9TAIRE', value: fitOneLine(doc, ins.ownerName || '\u2014', colW - 8), extraLines: 0 },
      { label: 'INVIT\u00c9', value: fitOneLine(doc, ins.guestName || '\u2014', colW - 8), extraLines: 0 },
      {
        label: "TYPE D'\u00c9TAT DES LIEUX",
        value: ins.type === 'SORTIE' ? 'Sortie du logement' : "Entr\u00e9e dans le logement",
        extraLines: 0,
      },
      { label: 'DATE DE L\u2019INSPECTION', value: frDateLong(ins.scheduledDate), extraLines: 0 },
    ];
    if (signed) {
      right.push({
        label: 'SIGN\u00c9 LE',
        value: frDateTime(ins.signedAt ?? ins.completedAt ?? new Date()),
        extraLines: 0,
      });
    }
    return { left, right };
  };

  const { left, right } = buildRows();
  const rowH = 21;
  const colH = (rows: Row[]) =>
    rows.reduce((h, r) => h + rowH + r.extraLines * 10, 0);
  const boxH = pad * 2 + Math.max(colH(left), colH(right)) - 4;

  const boxTop = doc.y;
  doc.save();
  doc.roundedRect(MARGIN, boxTop, CONTENT_W, boxH, 8).fill(LIGHT_BG);
  doc.roundedRect(MARGIN, boxTop, CONTENT_W, boxH, 8).lineWidth(0.75).strokeColor(CARD_BORDER).stroke();
  doc.restore();

  const drawCol = (rows: Row[], x: number) => {
    let y = boxTop + pad;
    for (const r of rows) {
      txt(doc, fname('bold', fontsOk), 5.6, MUTED, r.label, x, y, colW, 'left');
      txt(doc, fname('body', fontsOk), 8.2, INK, r.value, x, y + 8.5, colW, 'left');
      y += rowH + r.extraLines * 10;
    }
  };
  drawCol(left, MARGIN + pad);
  drawCol(right, MARGIN + pad + colW + colGap);

  doc.y = boxTop + boxH;

  // — Encart de comparaison (SORTIE liée à son entrée) —
  if (ins.type === 'SORTIE' && ins.linkedEntranceDate) {
    doc.y += 6;
    const noteH = 18;
    doc.save();
    doc.roundedRect(MARGIN, doc.y, CONTENT_W, noteH, 4).fill('#FAFAF9');
    doc.roundedRect(MARGIN, doc.y, CONTENT_W, noteH, 4).lineWidth(0.5).strokeColor(CARD_BORDER).stroke();
    doc.restore();
    txt(
      doc,
      fname('body', fontsOk),
      7.5,
      MUTED,
      `\u00c9tabli en comparaison de l'\u00e9tat des lieux d'entr\u00e9e du ${frDateLong(ins.linkedEntranceDate)}.`,
      MARGIN + 10,
      doc.y + 5.5,
      CONTENT_W - 20,
      'left',
    );
    doc.y += noteH;
  }

  doc.y += 12;

  // — v4.165 — Encart « Remarques de l'invité » (commentaire libre hub) —
  if (data.guestNotes?.trim()) {
    const noteText = data.guestNotes.trim().slice(0, 600);
    const noteLines = Math.max(
      1,
      Math.ceil(doc.widthOfString(noteText) / (CONTENT_W - 24)),
    );
    const noteH = 22 + noteLines * 10;
    doc.save();
    doc.roundedRect(MARGIN, doc.y, CONTENT_W, noteH, 4).fill('#FAFAF9');
    doc.roundedRect(MARGIN, doc.y, CONTENT_W, noteH, 4).lineWidth(0.5).strokeColor(CARD_BORDER).stroke();
    doc.restore();
    txt(doc, fname('bold', fontsOk), 6.2, MUTED, 'REMARQUES DE L’INVITÉ', MARGIN + 12, doc.y + 6, CONTENT_W - 24, 'left');
    doc.font(fname('body', fontsOk)).fontSize(7.6).fillColor(INK);
    doc.text(noteText, MARGIN + 12, doc.y + 17, { width: CONTENT_W - 24, align: 'left', lineGap: 1 });
    doc.y += noteH + 6;
  }

  doc.y += 0;
}

/** Bandeau de section rouge arrondi : icône blanche + titre blanc. */
function sectionBanner(
  doc: PdfDoc,
  num: number,
  title: string,
  icon: IconKind,
  fontsOk: boolean,
): void {
  ensureSpace(doc, 78);
  doc.y += 6;
  const h = 25;
  const y = doc.y;
  doc.save();
  doc.roundedRect(MARGIN, y, CONTENT_W, h, h / 2).fill(RED);
  doc.restore();
  drawSectionIcon(doc, icon, MARGIN + 20, y + h / 2, 14);
  txt(doc, fname('bold', fontsOk), 9.8, '#ffffff', `${num}. ${title}`, MARGIN + 34, y + 7.5, CONTENT_W - 44, 'left');
  doc.y = y + h + 10;
}

/** Pilule centrée grise (« Total éléments contrôlés… »). */
function summaryPill(doc: PdfDoc, text: string, fontsOk: boolean): void {
  doc.font(fname('bold', fontsOk)).fontSize(7.2);
  const pillW = doc.widthOfString(text) + 26;
  const pillH = 16;
  const x = MARGIN + (CONTENT_W - pillW) / 2;
  doc.save();
  doc.roundedRect(x, doc.y + 2, pillW, pillH, pillH / 2).fill(GRAY_PILL);
  doc.restore();
  txt(doc, fname('bold', fontsOk), 7.2, INK, text, x, doc.y + 6.5, pillW, 'center');
  doc.y += pillH + 8;
}

// ---------- Page 1 : sections Ménage & pièces ----------

/** Section 1 « MÉNAGE — CONFORMITÉ PROPRETÉ ». */
function drawCleanlinessSection(doc: PdfDoc, data: StandaloneInspectionPdfData, fontsOk: boolean): void {
  const ins = data.inspection;
  sectionBanner(doc, 1, 'M\u00c9NAGE \u2014 CONFORMIT\u00c9 PROPRET\u00c9', 'broom', fontsOk);

  if (!ins.cleanlinessScore) {
    txt(doc, fname('body', fontsOk), 8, MUTED, 'Propret\u00e9 non renseign\u00e9e au moment de l\u2019\u00e9dition du document.', MARGIN, doc.y, CONTENT_W, 'left');
    doc.y += 18;
    return;
  }

  const stamp = ins.signedAt ?? ins.completedAt ?? new Date();
  const chipColor = CLEAN_COLORS[ins.cleanlinessScore] ?? INK;
  const chipLabel = CLEAN_LABELS[ins.cleanlinessScore] ?? ins.cleanlinessScore;
  const chip = `\u00c9TAT : ${chipLabel} ${CHK(fontsOk)}`;
  doc.font(fname('bold', fontsOk)).fontSize(7.4);
  const chipW = doc.widthOfString(chip) + 22;
  doc.save();
  doc.roundedRect(MARGIN, doc.y, chipW, 17, 8.5).fill(chipColor);
  doc.restore();
  txt(doc, fname('bold', fontsOk), 7.4, '#ffffff', chip, MARGIN, doc.y + 5, chipW, 'center');
  doc.y += 24;

  // — Carte photo horodatée (preuve visuelle) —
  const photo = decodeDataUrl(ins.cleanlinessPhotoUrl);
  if (photo) {
    ensureSpace(doc, 170);
    const cardW = 226;
    const imgH = 112;
    const cardX = MARGIN + (CONTENT_W - cardW) / 2;
    const cardY = doc.y;
    doc.save();
    doc.roundedRect(cardX, cardY, cardW, imgH, 5).lineWidth(1).strokeColor(CARD_BORDER).stroke();
    doc.restore();
    try {
      doc.image(photo, cardX + 4, cardY + 4, { fit: [cardW - 8, imgH - 8], align: 'center', valign: 'center' });
    } catch {
      // photo illisible — cadre conservé
    }
    drawCheckCircle(doc, cardX + 2, cardY + 2, 15);
    doc.y = cardY + imgH + 6;
    txt(doc, fname('bold', fontsOk), 7.4, DARK, 'Photo propret\u00e9 du logement', MARGIN, doc.y, CONTENT_W, 'center');
    doc.y += 11;
    txt(
      doc,
      fname('bold', fontsOk),
      7,
      GREEN_TXT,
      `${CHK(fontsOk)} Horodat\u00e9e ${frTime(stamp)} \u2022 ${frDateShort(stamp)}`,
      MARGIN,
      doc.y,
      CONTENT_W,
      'center',
    );
    doc.y += 13;
  }

  if (ins.cleanlinessComment?.trim()) {
    doc.font(fname('body', fontsOk)).fontSize(7.8).fillColor(INK);
    doc.text(ins.cleanlinessComment.trim(), MARGIN, doc.y, { width: CONTENT_W, align: 'center' });
    doc.y += 6;
  }
  doc.y += 4;
}

/**
 * Sections pièces en cartes 3 colonnes (style « MEUBLES — INVENTAIRE
 * & ÉTAT » du modèle). Renvoie le prochain numéro de section.
 */
function drawRoomSections(
  doc: PdfDoc,
  data: StandaloneInspectionPdfData,
  startNumber: number,
  fontsOk: boolean,
): number {
  const cols = 3;
  const gapX = 9;
  const cardW = (CONTENT_W - gapX * (cols - 1)) / cols;
  const padCard = 6;

  for (const [index, room] of data.rooms.entries()) {
    sectionBanner(doc, startNumber + index, `${room.name.toUpperCase()} \u2014 INVENTAIRE & \u00c9TAT`, 'sofa', fontsOk);

    if (room.items.length > 0) {
      // — Grille de cartes (3 colonnes, pas de coupure dans une carte) —
      let col = 0;
      let rowTop = doc.y;
      let rowH = 0;
      const drawCard = (item: StandalonePdfItem, x: number, y: number, h: number): void => {
        const isBad = item.state === 'MAUVAIS';
        doc.save();
        doc
          .roundedRect(x, y, cardW, h, 6)
          .lineWidth(isBad ? 1.2 : 0.8)
          .strokeColor(isBad ? BAD : CARD_BORDER)
          .stroke();
        doc.restore();

        const innerW = cardW - padCard * 2;
        let cy = y + padCard;
        const photo = decodeDataUrl(item.photoUrl);
        if (photo) {
          const imgH = 52;
          try {
            doc.image(photo, x + padCard, cy, { fit: [innerW, imgH], align: 'center', valign: 'center' });
            drawCheckCircle(doc, x + cardW - 8, y + 8, 13, isBad ? BAD : GREEN);
          } catch {
            // photo illisible — carte conservée sans vignette
          }
          cy += imgH + 4;
        }

        doc.font(fname('bold', fontsOk)).fontSize(7);
        const name = fitOneLine(doc, item.name.toUpperCase(), innerW);
        txt(doc, fname('bold', fontsOk), 7, DARK, name, x + padCard, cy, innerW, 'center');
        cy += 10;

        txt(
          doc,
          fname('bold', fontsOk),
          7.2,
          stateColor(item.state),
          `\u00c9tat : ${stateLabel(item.state)} ${stateCheck(item.state, fontsOk)}`.trim(),
          x + padCard,
          cy,
          innerW,
          'center',
        );
        cy += 11;

        if (item.comment?.trim()) {
          doc.font(fname('body', fontsOk)).fontSize(6.3).fillColor(isBad ? BAD : MUTED);
          doc.text(item.comment.trim(), x + padCard, cy, {
            width: innerW,
            align: 'center',
            height: 16,
            ellipsis: true,
          });
          cy += 17;
        }
      };

      const cardHeight = (item: StandalonePdfItem): number => {
        const hasPhoto = Boolean(decodeDataUrl(item.photoUrl));
        doc.font(fname('body', fontsOk)).fontSize(6.3);
        const commentLines = item.comment?.trim()
          ? Math.min(Math.ceil(doc.widthOfString(item.comment.trim()) / (cardW - padCard * 2)), 2)
          : 0;
        return padCard + (hasPhoto ? 56 : 0) + 10 + 11 + (commentLines > 0 ? commentLines * 8 + 1 : 0) + padCard;
      };

      for (const item of room.items) {
        const h = Math.max(cardHeight(item), 42);
        if (col === 0 && doc.y + h > MAX_Y) {
          doc.addPage();
          rowTop = doc.y;
        } else if (col === 0) {
          rowTop = doc.y;
        }
        const x = MARGIN + col * (cardW + gapX);
        drawCard(item, x, rowTop, h);
        rowH = Math.max(rowH, h);
        col += 1;
        if (col === cols) {
          doc.y = rowTop + rowH + 8;
          col = 0;
          rowH = 0;
        }
      }
      if (col > 0) {
        doc.y = rowTop + rowH + 8;
      }

      // — Pilule récap conformité —
      const total = room.items.length;
      const okCount = room.items.filter((i) => i.state === 'TRES_BON' || i.state === 'BON').length;
      const pct = Math.round((okCount / total) * 100);
      summaryPill(
        doc,
        `Total \u00e9l\u00e9ments contr\u00f4l\u00e9s : ${total}/${total} \u2014 Conformit\u00e9 ${pct}\u00a0% ${pct === 100 ? CHK(fontsOk) : ''}`.trim(),
        fontsOk,
      );
    } else {
      txt(doc, fname('body', fontsOk), 7.8, MUTED, 'Aucun \u00e9l\u00e9ment r\u00e9pertori\u00e9 pour cette pi\u00e8ce.', MARGIN, doc.y, CONTENT_W, 'left');
      doc.y += 16;
    }

    if (room.comment?.trim()) {
      txt(doc, fname('body', fontsOk), 7.6, MUTED, `Remarques : ${fitOneLine(doc, room.comment.trim(), CONTENT_W - 80)}`, MARGIN, doc.y + 2, CONTENT_W, 'left');
      doc.y += 14;
    }
    doc.y += 2;
  }
  return startNumber + data.rooms.length;
}

// ---------- Page noire : Électronique & électroménager ----------

interface Appliance {
  room: string;
  item: StandalonePdfItem;
}

function collectAppliances(data: StandaloneInspectionPdfData): Appliance[] {
  const out: Appliance[] = [];
  for (const room of data.rooms) {
    for (const item of room.items) {
      if (isElectronicItem(item.name) || item.photoOnUrl || item.photoOffUrl) {
        out.push({ room: room.name, item });
      }
    }
  }
  return out;
}

/** Carte appareil : nom + photos ON/OFF horodatées + hash + statut. */
function drawApplianceCard(
  doc: PdfDoc,
  app: Appliance,
  x: number,
  y: number,
  w: number,
  h: number,
  stamp: Date,
  fontsOk: boolean,
): void {
  const isBad = app.item.state === 'MAUVAIS';
  doc.save();
  doc
    .roundedRect(x, y, w, h, 7)
    .lineWidth(isBad ? 1.2 : 0.8)
    .strokeColor(isBad ? BAD : CARD_BORDER)
    .stroke();
  doc.restore();

  const innerW = w - 16;
  let cy = y + 8;
  const name = fitOneLine(doc, app.item.name.toUpperCase(), innerW);
  txt(doc, fname('bold', fontsOk), 7.8, DARK, name, x + 8, cy, innerW, 'center');
  cy += 10;
  txt(doc, fname('body', fontsOk), 6, MUTED, app.room, x + 8, cy, innerW, 'center');
  cy += 9;

  const on = decodeDataUrl(app.item.photoOnUrl);
  const off = decodeDataUrl(app.item.photoOffUrl);

  if (on || off) {
    const imgW = (innerW - 8) / 2;
    const imgH = 74;
    for (const [slot, buf] of [
      ['ON', on],
      ['OFF', off],
    ] as const) {
      const ix = x + 8 + (slot === 'OFF' ? imgW + 8 : 0);
      doc.save();
      doc.roundedRect(ix, cy, imgW, imgH, 3).lineWidth(0.7).strokeColor(CARD_BORDER).stroke();
      doc.restore();
      if (buf) {
        try {
          doc.image(buf, ix, cy, { fit: [imgW - 4, imgH - 4], align: 'center', valign: 'center' });
        } catch {
          // preuve illisible — cadre conservé
        }
      } else {
        txt(doc, fname('body', fontsOk), 6.5, '#C4C4C8', 'Non fournie', ix, cy + imgH / 2 - 4, imgW, 'center');
      }
      // Légende : état + hash de la preuve (SHA-256 du fichier image)
      const ly = cy + imgH + 3;
      const dot = slot === 'ON' ? '\u25cf' : '\u25cb';
      const dotColor = slot === 'ON' ? GREEN : MUTED;
      txt(doc, fname('bold', fontsOk), 6.4, dotColor, `${dot} ${slot} \u2013 ${frTime(stamp)}`, ix, ly, imgW, 'center');
      const hashLine = buf ? `Hash: ${sha256Short(buf)}` : 'Hash: \u2014';
      txt(doc, fname('mono', fontsOk), 5.6, MUTED, hashLine, ix, ly + 8.5, imgW, 'center');
    }
    cy += imgH + 22;
  }

  txt(
    doc,
    fname('bold', fontsOk),
    7.4,
    stateColor(app.item.state),
    `Statut : ${stateLabel(app.item.state).toUpperCase()} ${stateCheck(app.item.state, fontsOk)}`.trim(),
    x + 8,
    cy,
    innerW,
    'center',
  );
  cy += 11;

  if (app.item.comment?.trim()) {
    doc.font(fname('body', fontsOk)).fontSize(6.3).fillColor(isBad ? BAD : MUTED);
    doc.text(app.item.comment.trim(), x + 8, cy, {
      width: innerW,
      align: 'center',
      height: 16,
      ellipsis: true,
    });
  }
}

/** Page dédiée « CONTRÔLES ÉLECTRONIQUE & ÉLECTROMÉNAGER ». */
function drawElectronicsPage(
  doc: PdfDoc,
  data: StandaloneInspectionPdfData,
  sectionNumber: number,
  fontsOk: boolean,
): number {
  const appliances = collectAppliances(data);
  if (appliances.length === 0) return sectionNumber;

  // — Bandeau noir (comme la page 2 du modèle) —
  doc.addPage();
  doc.save();
  doc.rect(0, 0, PAGE_W, DARK_BAND_H).fill(DARK);
  doc.restore();

  const title = documentTitle(data.inspection.type);
  const iconS = 20;
  const gap = 8;
  const size = fitTitleSize(doc, title, 15, PAGE_W - 80, iconS, gap, fontsOk);
  const scaledIconS = iconS * (size / 15);
  doc.font(fname('bold', fontsOk)).fontSize(size);
  const titleW = doc.widthOfString(title);
  const groupW = scaledIconS + gap + titleW;
  const gx = (PAGE_W - groupW) / 2;
  drawShield(doc, gx + scaledIconS / 2, 24, scaledIconS);
  txt(
    doc,
    fname('bold', fontsOk),
    size,
    '#ffffff',
    title,
    gx + scaledIconS + gap,
    16 + (15 - size) * 0.45,
    titleW,
    'left',
  );
  txt(
    doc,
    fname('bold', fontsOk),
    7.5,
    '#D9D2D2',
    'CONTR\u00d4LES \u00c9LECTRONIQUE & \u00c9LECTROM\u00c9NAGER',
    MARGIN,
    40,
    CONTENT_W,
    'center',
  );

  doc.y = DARK_BAND_H + 10;
  sectionBanner(doc, sectionNumber, '\u00c9LECTRONIQUE & \u00c9LECTROM\u00c9NAGER \u2014 TEST MARCHE/ARR\u00caT', 'tv', fontsOk);
  txt(
    doc,
    fname('body', fontsOk),
    6.8,
    MUTED,
    'Preuves de fonctionnement horodat\u00e9es : photo ALLUM\u00c9E (ON) et photo \u00c9TEINTE (OFF), empreinte SHA-256 de chaque fichier.',
    MARGIN,
    doc.y,
    CONTENT_W,
    'center',
  );
  doc.y += 14;

  // — Grille appareils 2 colonnes —
  const cols = 2;
  const gapX = 10;
  const cardW = (CONTENT_W - gapX * (cols - 1)) / cols;
  const stamp = data.inspection.signedAt ?? data.inspection.completedAt ?? new Date();

  const cardHeight = (app: Appliance): number => {
    const hasProof = Boolean(decodeDataUrl(app.item.photoOnUrl) || decodeDataUrl(app.item.photoOffUrl));
    doc.font(fname('body', fontsOk)).fontSize(6.3);
    const commentLines = app.item.comment?.trim()
      ? Math.min(Math.ceil(doc.widthOfString(app.item.comment.trim()) / (cardW - 16)), 2)
      : 0;
    return 8 + 10 + 9 + (hasProof ? 74 + 22 : 0) + 11 + (commentLines > 0 ? commentLines * 8 : 0) + 8;
  };

  let col = 0;
  let rowTop = doc.y;
  let rowH = 0;
  for (const app of appliances) {
    const h = cardHeight(app);
    if (col === 0 && doc.y + h > MAX_Y) {
      doc.addPage();
      rowTop = doc.y;
    } else if (col === 0) {
      rowTop = doc.y;
    }
    const x = MARGIN + col * (cardW + gapX);
    drawApplianceCard(doc, app, x, rowTop, cardW, h, stamp, fontsOk);
    rowH = Math.max(rowH, h);
    col += 1;
    if (col === cols) {
      doc.y = rowTop + rowH + 8;
      col = 0;
      rowH = 0;
    }
  }
  if (col > 0) doc.y = rowTop + rowH + 8;

  return sectionNumber + 1;
}

// ---------- Déclaration légale & anti-fraude ----------

// ---------- v4.165 — Section INVENTAIRE & CONSOMMATIONS (flux HUB) ----------

function drawInventorySection(doc: PdfDoc, data: StandaloneInspectionPdfData, startNumber: number, fontsOk: boolean): number {
  const inv = data.inventory;
  const minibar = (data.minibar ?? []).filter((m) => m.consumed > 0);
  if (!inv && minibar.length === 0) return startNumber;

  sectionBanner(doc, startNumber, 'INVENTAIRE & CONSOMMATIONS', 'sofa', fontsOk);

  const rows: { label: string; value: string; bad: boolean }[] = [];
  if (inv) {
    rows.push({ label: 'Clés rendues', value: `${inv.keys}`, bad: false });
    rows.push({ label: 'Télécommandes rendues', value: `${inv.remotes}`, bad: false });
    rows.push({ label: 'Serviettes rendues', value: `${inv.towels}`, bad: false });
  }
  for (const m of minibar) {
    rows.push({ label: `Minibar — ${m.name}`, value: `${m.consumed} consommé(s)`, bad: true });
  }

  for (const r of rows) {
    doc.font(fname('bold', fontsOk)).fontSize(7.6).fillColor(r.bad ? BAD : INK);
    doc.text(r.label, MARGIN, doc.y, { width: CONTENT_W - 120, align: 'left', lineBreak: false });
    doc.font(fname('body', fontsOk)).fontSize(7.6).fillColor(r.bad ? BAD : INK);
    doc.text(r.value, MARGIN + CONTENT_W - 120, doc.y, { width: 120, align: 'right', lineBreak: false });
    doc.y += 14;
  }
  doc.y += 4;
  summaryPill(
    doc,
    `Inventaire contrôlé à la remise des clés — ${rows.length} ligne${rows.length > 1 ? 's' : ''}`,
    fontsOk,
  );
  return startNumber + 1;
}

function drawLegalDeclaration(doc: PdfDoc, data: StandaloneInspectionPdfData, fontsOk: boolean): void {
  const ins = data.inspection;
  ensureSpace(doc, 300);

  const pad = 12;
  const boxH = 292;
  const y0 = doc.y;
  doc.save();
  doc.roundedRect(MARGIN, y0, CONTENT_W, boxH, 8).fill(RED_BG);
  doc.roundedRect(MARGIN, y0, CONTENT_W, boxH, 8).lineWidth(1.2).strokeColor(RED).stroke();
  doc.restore();

  const innerW = CONTENT_W - pad * 2;
  const title = 'D\u00c9CLARATION L\u00c9GALE & ANTI-FRAUDE';
  txt(doc, fname('bold', fontsOk), 10.5, RED, title, MARGIN, y0 + pad, innerW, 'center');

  doc.font(fname('body', fontsOk)).fontSize(6.9).fillColor(INK);
  const para1 =
    'Je certifie sur l\u2019honneur que les contr\u00f4les ci-dessus ont \u00e9t\u00e9 r\u00e9alis\u00e9s conform\u00e9ment au protocole RoomScan ' +
    'd\u2019\u00e9tat des lieux certifi\u00e9. Toutes les preuves photo sont horodat\u00e9es, g\u00e9olocalis\u00e9es et chiffr\u00e9es SHA-256. Toute alt\u00e9ration invalide ' +
    'le certificat. Ce document est g\u00e9n\u00e9r\u00e9 par un syst\u00e8me s\u00e9curis\u00e9 anti-falsification.';
  doc.text(para1, MARGIN + pad, y0 + pad + 16, { width: innerW, align: 'center', lineGap: 1.2 });
  let ty = Math.max(doc.y, y0 + pad + 16 + 34);

  const city =
    ins.city?.trim() || ins.propertyAddress.split(',')[0]?.trim() || 'la commune du logement';
  const stamp = ins.signedAt ?? ins.completedAt ?? new Date();
  const para2 =
    `\u00c9tat des lieux \u00e9tabli contradictoirement entre le propri\u00e9taire et l'invit\u00e9. Fait \u00e0 ${city}, le ${frDateLong(stamp)}, ` +
    'en 2 exemplaires originaux. Chaque partie reconna\u00eet en avoir re\u00e7u un. Ce document num\u00e9rique sign\u00e9 \u00e9lectroniquement a la ' +
    'm\u00eame valeur juridique qu\u2019un \u00e9tat des lieux papier (articles 1365 et 1366 du Code civil).';
  doc.text(para2, MARGIN + pad, ty, { width: innerW, align: 'center', lineGap: 1.2 });
  ty = Math.max(doc.y, ty + 34) + 6;

  // — Colonnes de signatures —
  const colW = (innerW - 14) / 2;
  const frameH = 58;
  const drawSignatureCol = (
    x: number,
    heading: string,
    name: string,
    dateLine: string,
    signature: Buffer | null,
    pendingText: string | null,
    footLine: string,
    footColor: string,
  ) => {
    txt(doc, fname('bold', fontsOk), 7.4, DARK, heading, x, ty, colW, 'center');
    const fy = ty + 12;
    doc.save();
    if (signature) {
      doc.roundedRect(x, fy, colW, frameH, 4).lineWidth(0.8).strokeColor('#CFCFD4').stroke();
    } else {
      doc.dash(4, { space: 3 });
      doc.roundedRect(x, fy, colW, frameH, 4).lineWidth(0.9).strokeColor('#C9A0A3').stroke();
      doc.undash();
    }
    doc.restore();
    if (signature) {
      try {
        doc.image(signature, x + 6, fy + 6, { fit: [colW - 12, frameH - 12] });
      } catch {
        // signature illisible — cadre conservé
      }
    } else if (pendingText) {
      txt(doc, fname('body', fontsOk), 6.6, '#B98A8D', pendingText, x, fy + frameH / 2 - 4, colW, 'center');
    }
    const vy = fy + frameH + 6;
    txt(doc, fname('body', fontsOk), 7, INK, `Nom : ${name}`, x, vy, colW, 'left');
    txt(doc, fname('body', fontsOk), 7, INK, dateLine, x, vy + 11, colW, 'left');
    txt(doc, fname('bold', fontsOk), 6.6, footColor, footLine, x, vy + 22, colW, 'left');
  };

  const guestSig = decodeDataUrl(ins.guestSignature);
  const leftX = MARGIN + pad;
  const rightX = MARGIN + pad + colW + 14;
  drawSignatureCol(
    leftX,
    "SIGNATURE DE L'INVIT\u00c9",
    ins.guestName || '\u2014',
    `Date : ${frDateTime(stamp)}`,
    guestSig,
    signed_pending(ins),
    `J'approuve l'\u00e9tat des lieux \u2022 Accord d\u00e9finitif ${CHK(fontsOk)}`.trim(),
    GREEN_TXT,
  );
  drawSignatureCol(
    rightX,
    'SIGNATURE DU PROPRI\u00c9TAIRE (H\u00d4TE)',
    ins.ownerName || '\u2014',
    'Date : ____________',
    null,
    null,
    'Signature ou cachet sur l\u2019exemplaire imprim\u00e9',
    MUTED,
  );

  // — Preuves techniques (mono, 2 lignes max) —
  const proofParts: string[] = [];
  if (ins.sha256Hash) {
    proofParts.push(`Empreinte globale SHA-256 : ${ins.sha256Hash.toLowerCase()}`);
  } else {
    proofParts.push('Empreinte globale SHA-256 : disponible apr\u00e8s signature');
  }
  if (ins.gpsLocation?.trim()) proofParts.push(`GPS : ${ins.gpsLocation.trim()}`);
  if (ins.ipAddress?.trim()) proofParts.push(`IP : ${ins.ipAddress.trim()}`);
  const proof = proofParts.join(' \u2022 ');
  doc.font(fname('mono', fontsOk)).fontSize(5.7).fillColor(MUTED);
  const proofY = y0 + boxH - pad - (doc.widthOfString(proof) > innerW ? 16 : 8);
  doc.text(proof, MARGIN + pad, proofY, { width: innerW, align: 'center' });

  doc.y = y0 + boxH + 12;
}

/** Texte « en attente » du cadre signature invité si non signé. */
function signed_pending(ins: StandaloneInspectionPdfData['inspection']): string | null {
  return ins.status === 'COMPLETED' ? null : 'En attente de signature \u2014 roomscan.pro';
}

// ---------- Pieds de page ----------

/** Pieds : ligne grise + bandeau noir « cachet électronique » (toutes pages). */
function drawFooters(
  doc: PdfDoc,
  opts: { token: string; docId: string; generatedAt: Date; sha256Hash?: string | null },
  fontsOk: boolean,
): void {
  const range = doc.bufferedPageRange();
  const verifyUrl = `roomscan.pro/i/${opts.token.slice(0, 14)}\u2026`;
  const footerBody =
    `Document officiel RoomScan \u2022 Attestation d\u2019\u00e9tat des lieux \u2022 ` +
    `G\u00e9n\u00e9r\u00e9 le ${frDateTime(opts.generatedAt)} \u2022 V\u00e9rification : ${verifyUrl} \u2022 ${opts.docId}`;
  const hash = opts.sha256Hash?.toLowerCase();
  const empreinte = hash ? `${hash.slice(0, 8)}\u2026${hash.slice(-4)}` : 'disponible apr\u00e8s signature';
  const line2 = `Cachet \u00e9lectronique scell\u00e9 \u2022 Empreinte globale : ${empreinte} \u2022 Anti-fraude certifi\u00e9`;

  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    // Bandeau noir pleine largeur (bas de page, style page 2 du modèle)
    doc.save();
    doc.rect(0, PAGE_H - 22, PAGE_W, 22).fill(DARK);
    doc.restore();

    txt(
      doc,
      fname('body', fontsOk),
      6.3,
      MUTED,
      `Page ${i + 1} / ${range.count} \u2022 ${footerBody}`,
      MARGIN,
      PAGE_H - 33,
      CONTENT_W,
      'center',
    );
    txt(doc, fname('bold', fontsOk), 6.3, '#E8E2E2', line2, MARGIN, PAGE_H - 16.5, CONTENT_W, 'center');

    doc.page.margins.bottom = savedBottom;
  }
}

// ---------- Document ----------

export async function renderStandaloneInspectionPdf(
  data: StandaloneInspectionPdfData,
): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title:
        data.inspection.type === 'SORTIE'
          ? 'Rapport de sortie — comparatif entrée/sortie — RoomScan'
          : "Attestation d'état des lieux d'entrée — RoomScan",
      Author: 'RoomScan',
      Subject: `Document certifié ${inspectionDocumentId(data.inspection.publicToken)}`,
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const fontsOk = await registerFonts(doc);
  // v5.10 — logo officiel blanc (bandeau rouge page 1)
  const logoWhite = await loadRoomscanLogoWhite();

  // ── Page 1 : bandeau rouge + QR + parties ──
  drawRedHeader(doc, data, fontsOk, logoWhite);
  await drawVerificationBlock(doc, data, fontsOk);
  drawInfoBox(doc, data, fontsOk);

  // ── Corps numéroté : 1. Ménage → 2..N pièces ──
  drawCleanlinessSection(doc, data, fontsOk);
  let sectionNumber = 2;
  sectionNumber = drawRoomSections(doc, data, sectionNumber, fontsOk);

  // ── Page noire : contrôles électronique & électroménager ──
  sectionNumber = drawElectronicsPage(doc, data, sectionNumber, fontsOk);

  // ── v4.165 — Inventaire & minibar (flux HUB, sortie) ──
  sectionNumber = drawInventorySection(doc, data, sectionNumber, fontsOk);

  // ── Déclaration légale & anti-fraude ──
  drawLegalDeclaration(doc, data, fontsOk);

  // ── Pieds de page (après le corps, pagination complète) ──
  drawFooters(
    doc,
    {
      token: data.inspection.publicToken,
      docId: inspectionDocumentId(data.inspection.publicToken),
      generatedAt: new Date(),
      sha256Hash: data.inspection.sha256Hash,
    },
    fontsOk,
  );

  doc.end();
  return finished;
}
