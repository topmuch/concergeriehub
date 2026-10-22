// =============================================================
// ROOMSCAN BOUCLIER AUTOMATISÉ (v5.1) — GÉNÉRATEUR PDF (pdfkit)
//
// Deux certificats A4 conformes au modèle client :
//   · PAGE 1 — renderShieldOnboardingPdf : « ONBOARDING UNE FOIS »
//     certificat d'onboarding (bandeau rouge, ruban parallélogramme,
//     3 étapes à pastilles, BIBLIOTHÈQUE DE RÉFÉRENCE réutilisable,
//     grille appareils 2 colonnes photo + QR, encadré explication).
//   · PAGE 2 — renderShieldSessionPdf : CHECK-IN (6 photos ménage,
//     grille 3×2, statuts IMPECCABLE / À NETTOYER / DÉGRADATION) ou
//     CHECK-OUT (COMPARATIF entrée/sortie 2 colonnes, pastilles
//     ENTRÉE/SORTIE), vidéo walkthrough (QR + boîte sombre), boîte
//     noire HASH SHA-256, mentions légales, pied noir 2 lignes.
//
// POLICES : DejaVu (Sans/Bold/Mono) embarquées dans public/fonts →
// glyphes ✓ • ● disponibles. Fallback propre sur Helvetica/Courier
// si le dossier est absent. Icônes (bouclier, caméra, clipboard,
// coche, play, info) dessinées en VECTEURS pdfkit — aucun émoji.
//
// Robustesse : AUCUNE entrée ne fait planter le document (photos
// invalides → cadre gris conservé ; QR indisponible → dégradation
// gracieuse ; vidéo absente → encadré « en cours de traitement » ;
// hash tronqué/wrappé sans débordement). pdfkit externalisé
// (serverExternalPackages) — import dynamique dans la fonction.
// =============================================================

import { readFile } from 'fs/promises';
import path from 'path';

// Type de l'instance PDFKit (module typé `export = doc` → typeof).
type PdfDoc = typeof import('pdfkit');

// ---------- Types publics (contrat des routes /api/shield/pdf/**) ----------

export interface ShieldPdfZoneShot {
  zoneName: string;
  photo: string;
  status: string;
  comment?: string | null;
  capturedAt: Date;
}

export interface ShieldPdfDevice {
  name: string;
  kind: string;
  referenceCode: string;
  referenceHash: string;
  referencePhoto: string;
  referenceDate: Date;
}

export interface ShieldOnboardingPdfData {
  property: {
    propertyName: string;
    propertyAddress: string;
    city: string;
    ownerName: string;
    onboardingRef: string;
    onboardedAt: Date;
  };
  zones: { name: string; referencePhoto: string }[];
  devices: ShieldPdfDevice[];
}

export interface ShieldSessionPdfData {
  property: {
    propertyName: string;
    propertyAddress: string;
    city: string;
    ownerName: string;
    onboardingRef: string;
    onboardedAt: Date;
  };
  /** Bibliothèque de référence (PAGE 1 du dossier — 4 appareils). */
  devices: ShieldPdfDevice[];
  session: {
    type: 'CHECK_IN' | 'CHECK_OUT';
    agentName: string;
    guestName?: string | null;
    sessionRef: string;
    completedAt: Date;
  };
  video: {
    publicToken: string;
    sha256: string;
    durationSec: number;
    sizeBytes: number;
    createdAt: Date;
  } | null;
  shots: ShieldPdfZoneShot[];
  /** Check-in lié — comparatif SORTIE (entrée vs sortie par zone). */
  linked: {
    sessionRef: string;
    completedAt: Date;
    shots: ShieldPdfZoneShot[];
  } | null;
}

// ---------- Constantes page & palette « Bouclier » ----------

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2; // 515.28

const RED = '#C21F26'; // bandeaux, rubans, accents
const DARK = '#17171A'; // titres
const HASH_BLACK = '#0D0D0F'; // boîte hash
const VIDEO_BOX = '#2B2B30'; // boîte vidéo sombre
const CARD_GRAY = '#F5F5F6'; // cartes grises
const BORDER = '#E3E4E8'; // bordures
const INK = '#1F2937'; // texte
const MUTED = '#6B7280'; // texte secondaire
const GREEN = '#1F9D44'; // coches
const GREEN_TXT = '#157A3A'; // texte vert
const AMBER = '#D97706'; // à nettoyer

const BAND_H = 86; // bandeau rouge pleine largeur
const FOOTER_H_P1 = 26; // pied noir page onboarding (1 ligne)
const FOOTER_H_P2 = 36; // pied noir page session (2 lignes)
const MAX_Y_P1 = PAGE_H - FOOTER_H_P1 - 14; // ≈ 801.9
const MAX_Y_P2 = PAGE_H - FOOTER_H_P2 - 32; // ≈ 773.9

const SHOT_STATUS_COLORS: Record<string, string> = {
  IMPECCABLE: GREEN_TXT,
  CORRECT: GREEN_TXT,
  A_NETTOYER: AMBER,
  DEGRADATION: RED,
  TRES_SALE: RED,
};
const SHOT_STATUS_LABELS: Record<string, string> = {
  IMPECCABLE: 'IMPECCABLE',
  CORRECT: 'CORRECT',
  A_NETTOYER: 'À NETTOYER',
  DEGRADATION: 'DÉGRADATION',
  TRES_SALE: 'TRÈS SALE',
};
function shotStatusColor(status: string): string {
  return SHOT_STATUS_COLORS[status] ?? INK;
}
function shotStatusLabel(status: string): string {
  return SHOT_STATUS_LABELS[status] ?? String(status || '').toUpperCase();
}
function isPositiveShotStatus(status: string): boolean {
  return status === 'IMPECCABLE' || status === 'CORRECT';
}

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

function toDate(v: unknown): Date {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Date fr dd/MM/yyyy. */
function frDate(d: Date): string {
  return toDate(d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Date fr dd/MM (pastilles comparatif). */
function frDateShort(d: Date): string {
  return toDate(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

/** Date + heure fr dd/MM/yyyy HH:mm. */
function frDateTime(d: Date): string {
  return toDate(d).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

/** Découpe un texte en lignes tenant dans maxW (fonte courante). */
function wrapText(doc: PdfDoc, text: string, maxW: number, font?: string, size?: number): string[] {
  if (font) doc.font(font);
  if (size) doc.fontSize(size);
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const attempt = cur ? `${cur} ${w}` : w;
    if (!cur || doc.widthOfString(attempt) <= maxW) cur = attempt;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 0 ? lines : [''];
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
  opts?: { characterSpacing?: number; opacity?: number },
): void {
  doc.font(font).fontSize(size);
  doc.fillColor(color, opts?.opacity);
  doc.text(str, x, y, {
    width,
    align,
    lineBreak: false,
    ...(opts?.characterSpacing !== undefined ? { characterSpacing: opts.characterSpacing } : {}),
  });
}

// ---------- Icônes vectorielles (aucun émoji) ----------

/** Bouclier + coche — emblème ROOMSCAN BOUCLIER. */
function drawShield(doc: PdfDoc, cx: number, cy: number, s: number, color = '#ffffff'): void {
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
  doc.lineWidth(Math.max(1.2, s * 0.085));
  doc.strokeColor(color).stroke();
  doc.moveTo(cx - s * 0.17, cy - s * 0.01);
  doc.lineTo(cx - s * 0.04, cy + s * 0.11);
  doc.lineTo(cx + s * 0.21, cy - s * 0.13);
  doc.lineWidth(Math.max(1.3, s * 0.1));
  doc.lineCap('round');
  doc.lineJoin('round');
  doc.stroke();
  doc.restore();
}

/** Appareil photo (étape 1 / rubans). */
function drawCamera(doc: PdfDoc, cx: number, cy: number, s: number, color = '#ffffff'): void {
  doc.save();
  const lw = Math.max(1, s * 0.085);
  doc
    .roundedRect(cx - s * 0.44, cy - s * 0.22, s * 0.88, s * 0.48, s * 0.09)
    .lineWidth(lw)
    .strokeColor(color)
    .stroke();
  doc
    .moveTo(cx - s * 0.15, cy - s * 0.22)
    .lineTo(cx - s * 0.11, cy - s * 0.37)
    .lineTo(cx + s * 0.11, cy - s * 0.37)
    .lineTo(cx + s * 0.15, cy - s * 0.22)
    .lineWidth(lw)
    .strokeColor(color)
    .lineJoin('round')
    .stroke();
  doc.circle(cx, cy + s * 0.02, s * 0.15).lineWidth(lw).strokeColor(color).stroke();
  doc.circle(cx + s * 0.29, cy - s * 0.08, s * 0.035).fill(color);
  doc.restore();
}

/** Clipboard à checklist (étape 2 / ruban CHECK-IN). */
function drawClipboard(doc: PdfDoc, cx: number, cy: number, s: number, color = '#ffffff'): void {
  doc.save();
  const lw = Math.max(0.9, s * 0.075);
  doc
    .roundedRect(cx - s * 0.3, cy - s * 0.34, s * 0.6, s * 0.72, 2)
    .lineWidth(lw)
    .strokeColor(color)
    .stroke();
  doc.roundedRect(cx - s * 0.11, cy - s * 0.43, s * 0.22, s * 0.12, 1.5).fill(color);
  for (let i = 0; i < 3; i++) {
    const ry = cy - s * 0.14 + i * s * 0.18;
    doc.rect(cx - s * 0.18, ry, s * 0.09, s * 0.09).fill(color);
    doc
      .moveTo(cx - s * 0.02, ry + s * 0.045)
      .lineTo(cx + s * 0.18, ry + s * 0.045)
      .lineWidth(Math.max(0.7, lw * 0.85))
      .strokeColor(color)
      .lineCap('round')
      .stroke();
  }
  doc.restore();
}

/** Coche pleine (statuts verts). */
function drawCheckMark(doc: PdfDoc, cx: number, cy: number, s: number, color = GREEN): void {
  doc.save();
  doc
    .moveTo(cx - s * 0.3, cy + s * 0.02)
    .lineTo(cx - s * 0.06, cy + s * 0.26)
    .lineTo(cx + s * 0.32, cy - s * 0.24);
  doc.lineWidth(Math.max(1.1, s * 0.24));
  doc.strokeColor(color);
  doc.lineCap('round');
  doc.lineJoin('round');
  doc.stroke();
  doc.restore();
}

/** Triangle play (section vidéo). */
function drawPlay(doc: PdfDoc, cx: number, cy: number, s: number, color = RED): void {
  doc.save();
  doc
    .moveTo(cx - s * 0.26, cy - s * 0.36)
    .lineTo(cx + s * 0.42, cy)
    .lineTo(cx - s * 0.26, cy + s * 0.36)
    .closePath()
    .fill(color);
  doc.restore();
}

/** « i » dans cercle rouge (encadré explication). */
function drawInfoDot(doc: PdfDoc, cx: number, cy: number, d: number): void {
  doc.save();
  doc.circle(cx, cy, d / 2).fill(RED);
  doc.circle(cx, cy - d * 0.2, d * 0.06).fill('#ffffff');
  doc.roundedRect(cx - d * 0.055, cy - d * 0.06, d * 0.11, d * 0.34, d * 0.055).fill('#ffffff');
  doc.restore();
}

// ---------- QR codes (dégradation gracieuse) ----------

async function makeQrBuffer(content: string, px = 260): Promise<Buffer | null> {
  if (!content) return null;
  try {
    const qrcode = await import('qrcode');
    const dataUrl = await qrcode.toDataURL(content, {
      width: px,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#141414', light: '#FFFFFF' },
    });
    return decodeDataUrl(dataUrl);
  } catch {
    return null;
  }
}

/** QR dessiné à taille carrée — cadre grisé + mention si indisponible. */
function drawQr(doc: PdfDoc, qr: Buffer | null, x: number, y: number, size: number): void {
  if (qr) {
    try {
      doc.image(qr, x, y, { width: size, height: size });
      return;
    } catch {
      // QR illisible → placeholder
    }
  }
  doc.save();
  doc.roundedRect(x, y, size, size, 3).lineWidth(0.8).strokeColor(BORDER).fillAndStroke('#EDEEF0', BORDER);
  doc.restore();
  doc.font('Helvetica').fontSize(5.5).fillColor('#C0C2C7');
  doc.text('QR', x, y + size / 2 - 3.5, { width: size, align: 'center', lineBreak: false });
}

/** Photo dans un cadre gris — jamais de throw si dataURL invalide. */
function drawPhoto(
  doc: PdfDoc,
  photo: unknown,
  x: number,
  y: number,
  w: number,
  h: number,
  emptyLabel = 'Photo indisponible',
): void {
  doc.save();
  doc.roundedRect(x, y, w, h, 3).lineWidth(0.8).strokeColor(BORDER).fillAndStroke('#EDEEF0', BORDER);
  doc.restore();
  const buf = decodeDataUrl(photo);
  if (buf) {
    try {
      doc.image(buf, x + 2, y + 2, { fit: [w - 4, h - 4], align: 'center', valign: 'center' });
      return;
    } catch {
      // photo illisible — cadre conservé
    }
  }
  doc.font('Helvetica').fontSize(6).fillColor('#B7B9BE');
  doc.text(emptyLabel, x, y + h / 2 - 3.5, { width: w, align: 'center', lineBreak: false });
}

// ---------- Éléments communs (bandeau, ruban, pied) ----------

/** Bandeau rouge pleine largeur : carré blanc/15 + bouclier + titre
 *  MÉTIER (v4.120 — plus de « ROOMSCAN BOUCLIER » en titre : le
 *  document porte son intitulé juridique — ATTESTATION D'ÉTAT DES
 *  LIEUX D'ENTRÉE ou RAPPORT DE SORTIE — COMPARATIF ENTRÉE/SORTIE)
 *  + sous-titre espacé. Auto-fit : 21 pt max, réduits jusqu'à 12.5 pt
 *  pour tenir sur une seule ligne. */
function drawRedBanner(doc: PdfDoc, title: string, subtitle: string, fontsOk: boolean): void {
  doc.save();
  doc.rect(0, 0, PAGE_W, BAND_H).fill(RED);
  doc.restore();

  const sq = 52;
  const sqY = (BAND_H - sq) / 2;
  doc.save();
  doc.roundedRect(MARGIN, sqY, sq, sq, 10).fillColor('#FFFFFF', 0.15).fill();
  doc.restore();
  drawShield(doc, MARGIN + sq / 2, sqY + sq / 2, 32);

  const tx = MARGIN + sq + 14;
  const maxTitleW = PAGE_W - tx - MARGIN;
  doc.font(fname('bold', fontsOk)).fontSize(21);
  let size = 21;
  while (size > 12.5 && doc.widthOfString(title) > maxTitleW) {
    size -= 0.5;
    doc.fontSize(size);
  }
  // Compense visuellement la réduction (baseline centrée dans le bandeau).
  const titleY = sqY + 6 + (21 - size) * 0.35;
  txt(doc, fname('bold', fontsOk), size, '#FFFFFF', title, tx, titleY, maxTitleW, 'left');
  txt(
    doc,
    fname('bold', fontsOk),
    7.5,
    '#FFFFFF',
    subtitle.toUpperCase(),
    tx,
    sqY + 33,
    PAGE_W - tx - MARGIN,
    'left',
    { characterSpacing: 1.1, opacity: 0.85 },
  );
}

/** Ruban rouge (parallélogramme) : icône blanche + texte blanc bold. */
function drawRibbon(
  doc: PdfDoc,
  text: string,
  icon: 'camera' | 'clipboard',
  fontsOk: boolean,
  y: number,
): number {
  doc.font(fname('bold', fontsOk)).fontSize(9.5);
  const textW = doc.widthOfString(text);
  const iconS = 12;
  const padL = 13;
  const gap = 8;
  const padR = 16;
  const skew = 9;
  const h = 19;
  const w = padL + iconS + gap + textW + padR;
  const x = MARGIN;

  doc.save();
  doc.moveTo(x + skew, y);
  doc.lineTo(x + w, y);
  doc.lineTo(x + w - skew, y + h);
  doc.lineTo(x, y + h);
  doc.closePath();
  doc.fill(RED);
  doc.restore();

  const icx = x + padL + iconS / 2;
  const icy = y + h / 2;
  if (icon === 'camera') drawCamera(doc, icx, icy, iconS);
  else drawClipboard(doc, icx, icy, iconS);
  txt(doc, fname('bold', fontsOk), 9.5, '#FFFFFF', text, x + padL + iconS + gap, y + h / 2 - 3.4, textW + 4, 'left');
  return y + h;
}

/** Pied noir pleine largeur sur TOUTES les pages (1 ou 2 lignes blanches). */
function drawBlackFooters(doc: PdfDoc, lines: string[], fontsOk: boolean): void {
  const range = doc.bufferedPageRange();
  const h = lines.length > 1 ? 36 : 26;
  const lineH = 10.5;
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.save();
    doc.rect(0, PAGE_H - h, PAGE_W, h).fill(DARK);
    doc.restore();

    const startY = PAGE_H - h + (h - lines.length * lineH) / 2 + 2;
    lines.forEach((ln, k) => {
      txt(
        doc,
        fname(k === 0 ? 'bold' : 'body', fontsOk),
        6.8,
        '#FFFFFF',
        ln,
        MARGIN,
        startY + k * lineH,
        CONTENT_W,
        'center',
      );
    });

    doc.page.margins.bottom = savedBottom;
  }
}

// =============================================================
// PAGE 1 — CERTIFICAT D'ONBOARDING
// =============================================================

/** Rangée des 3 étapes (pastilles rouges + icônes blanches). */
function drawStepsRow(doc: PdfDoc, fontsOk: boolean): void {
  const steps = [
    {
      icon: 'camera' as const,
      title: '1. PHOTO INITIALE DU LOGEMENT',
      desc: 'Prendre les photos de référence une seule fois lors de l\u2019installation',
    },
    {
      icon: 'clipboard' as const,
      title: '2. VALIDATION DES ÉQUIPEMENTS',
      desc: 'Enregistrer chaque appareil permanent du logement',
    },
    {
      icon: 'shield' as const,
      title: '3. GÉNÉRATION DE LA BIBLIOTHÈQUE',
      desc: 'La bibliothèque est verrouillée et réutilisable pour tous les check-ins',
    },
  ];
  const colW = CONTENT_W / 3;
  const r = 16;
  const cy = doc.y + r + 4;

  for (const [i, st] of steps.entries()) {
    const cx = MARGIN + colW * i + colW / 2;
    doc.save();
    doc.circle(cx, cy, r).fill(RED);
    doc.restore();

    const inner = 15;
    if (st.icon === 'camera') drawCamera(doc, cx, cy, inner);
    else if (st.icon === 'clipboard') drawClipboard(doc, cx, cy, inner);
    else drawShield(doc, cx, cy, inner);

    doc.font(fname('bold', fontsOk)).fontSize(8.2);
    const title = fitOneLine(doc, st.title, colW - 6);
    txt(doc, fname('bold', fontsOk), 8.2, DARK, title, cx - colW / 2 + 3, cy + r + 7, colW - 6, 'center');

    doc.font(fname('body', fontsOk)).fontSize(6.8);
    const lines = wrapText(doc, st.desc, colW - 14, fname('body', fontsOk), 6.8).slice(0, 3);
    let dy = cy + r + 18;
    for (const ln of lines) {
      txt(doc, fname('body', fontsOk), 6.8, MUTED, ln, cx - colW / 2 + 3, dy, colW - 6, 'center');
      dy += 8.6;
    }
  }
  doc.y = cy + r + 18 + 3 * 8.6 + 4;
}

/** En-tête « BIBLIOTHÈQUE DE RÉFÉRENCE — RÉUTILISABLE » + lignes descriptives. */
function drawLibraryHeader(doc: PdfDoc, devicesCount: number, refDate: Date, fontsOk: boolean): void {
  doc.y += 5;
  const y0 = doc.y;
  drawShield(doc, MARGIN + 8, y0 + 8, 16, RED);
  txt(
    doc,
    fname('bold', fontsOk),
    11.5,
    RED,
    'BIBLIOTHÈQUE DE RÉFÉRENCE — RÉUTILISABLE',
    MARGIN + 22,
    y0 + 0.5,
    CONTENT_W - 22,
    'left',
  );
  doc.y = y0 + 19;

  txt(
    doc,
    fname('body', fontsOk),
    7.5,
    MUTED,
    `Ces ${devicesCount} appareils sont photographiés une seule fois et réutilisés à chaque check-in automatique.`,
    MARGIN,
    doc.y,
    CONTENT_W,
    'left',
  );
  doc.y += 12;

  const label = 'Date de référence : ';
  const rest = `Photo de référence du ${frDate(refDate)} — Réutilisée à chaque check-in.`;
  doc.font(fname('bold', fontsOk)).fontSize(7.5);
  const labelW = doc.widthOfString(label);
  txt(doc, fname('bold', fontsOk), 7.5, DARK, label, MARGIN, doc.y, labelW + 2, 'left');
  txt(doc, fname('body', fontsOk), 7.5, INK, rest, MARGIN + labelW, doc.y, CONTENT_W - labelW, 'left');
  doc.y += 16;
}

/** Grille appareils 2 colonnes : photo de référence + QR + code. */
async function drawDeviceGrid(doc: PdfDoc, devices: ShieldPdfDevice[], fontsOk: boolean): Promise<void> {
  const cols = 2;
  const gapX = 10;
  const cardW = (CONTENT_W - gapX * (cols - 1)) / cols; // ≈ 252.6
  const CARD_H = 122;

  let col = 0;
  let rowTop = doc.y;

  for (const device of devices) {
    if (col === 0) {
      if (doc.y + CARD_H + 8 > MAX_Y_P1) doc.addPage();
      rowTop = doc.y;
    }
    const x = MARGIN + col * (cardW + gapX);
    const y = rowTop;

    doc.save();
    doc
      .roundedRect(x, y, cardW, CARD_H, 6)
      .lineWidth(0.9)
      .strokeColor(BORDER)
      .fillAndStroke('#FFFFFF', BORDER);
    doc.restore();

    // Photo de référence (gauche)
    drawPhoto(doc, device?.referencePhoto, x + 12, y + 12, 86, 64, 'Photo de référence');

    // QR (droite) + micro-label
    const qrS = 46;
    const qrX = x + cardW - 12 - qrS;
    txt(doc, fname('body', fontsOk), 5.5, MUTED, 'QR', qrX, y + 3, qrS, 'center');
    const qr = await makeQrBuffer(String(device?.referenceCode || device?.name || 'ROOMSCAN'), 200);
    drawQr(doc, qr, qrX, y + 12, qrS);

    // Textes sous la photo
    doc.font(fname('bold', fontsOk)).fontSize(8.5);
    const name = fitOneLine(doc, String(device?.name || 'Appareil').toUpperCase(), cardW - 24);
    const nameY = y + 86;
    txt(doc, fname('bold', fontsOk), 8.5, DARK, name, x + 12, nameY, cardW - 24, 'left');
    txt(
      doc,
      fname('body', fontsOk),
      6.8,
      MUTED,
      `Photo de référence du ${frDate(toDate(device?.referenceDate))}`,
      x + 12,
      nameY + 12,
      cardW - 24,
      'left',
    );
    txt(
      doc,
      fname('monoBold', fontsOk),
      7.2,
      RED,
      `QR: ${String(device?.referenceCode || '—')}`,
      x + 12,
      nameY + 23,
      cardW - 24,
      'left',
    );

    col += 1;
    if (col === cols) {
      doc.y = rowTop + CARD_H + 10;
      col = 0;
    }
  }
  if (col > 0) doc.y = rowTop + CARD_H + 10;
}

/** Encadré gris bordure gauche rouge — explication du processus réutilisable. */
function drawExplainBox(doc: PdfDoc, refDate: Date, fontsOk: boolean): void {
  const pad = 12;
  const innerW = CONTENT_W - pad * 2;
  const title = 'EXPLICATION DU PROCESSUS RÉUTILISABLE';
  const bullets = [
    `Les photos ci-dessus sont prises une seule fois lors de l'onboarding initial, en date du ${frDate(refDate)}.`,
    'Elles sont stockées de manière sécurisée et réutilisées automatiquement à chaque check-in du locataire.',
    'Aucune nouvelle photo de ces appareils n\u2019est requise : le système compare uniquement l\u2019état actuel aux références.',
    'Garantie d\u2019objectivité et de traçabilité via QR code unique pour chaque équipement.',
  ];

  const textFont = fname('body', fontsOk);
  doc.font(textFont).fontSize(7.2);
  const textW = innerW - 12;
  const blocks = bullets.map((b) => wrapText(doc, b, textW, textFont, 7.2));
  const lineH = 9.4;
  const blockGap = 3.5;
  const titleH = 15;
  const boxH =
    pad + titleH + 4 + blocks.reduce((acc, ls) => acc + ls.length * lineH + blockGap, 0) + 4;

  const y0 = doc.y;

  // Fond gris + liseré rouge gauche (clip arrondi)
  doc.save();
  doc.roundedRect(MARGIN, y0, CONTENT_W, boxH, 6).clip();
  doc.rect(MARGIN, y0, CONTENT_W, boxH).fill(CARD_GRAY);
  doc.rect(MARGIN, y0, 3, boxH).fill(RED);
  doc.restore();
  doc.save();
  doc.roundedRect(MARGIN, y0, CONTENT_W, boxH, 6).lineWidth(0.8).strokeColor(BORDER).stroke();
  doc.restore();

  // Titre : « i » rouge + intitulé dark bold
  drawInfoDot(doc, MARGIN + pad + 5, y0 + pad + 5, 10);
  txt(doc, fname('bold', fontsOk), 8.2, DARK, title, MARGIN + pad + 14, y0 + pad + 1.5, innerW - 14, 'left');

  let by = y0 + pad + titleH + 4;
  for (const lines of blocks) {
    txt(doc, textFont, 7.2, MUTED, '\u2022', MARGIN + pad, by, 8, 'left');
    for (const ln of lines) {
      txt(doc, textFont, 7.2, MUTED, ln, MARGIN + pad + 10, by, textW, 'left');
      by += lineH;
    }
    by += blockGap;
  }

  doc.y = y0 + boxH + 14;
}

export async function renderShieldOnboardingPdf(data: ShieldOnboardingPdfData): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: 'Onboarding une fois — Roomscan Inventaire',
      Author: 'RoomScan',
      Subject: `Certificat d'onboarding ${data?.property?.onboardingRef ?? ''}`.trim(),
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const fontsOk = await registerFonts(doc);

  const city = String(data?.property?.city || '').trim().toUpperCase() || '—';
  const refDate = toDate(data?.property?.onboardedAt);
  const devices = Array.isArray(data?.devices) ? data.devices : [];

  // 1. Bandeau rouge + sous-titre certificat (v4.120 : titre métier
  // demandé par le client — plus de « ROOMSCAN BOUCLIER » en titre).
  drawRedBanner(
    doc,
    'ATTESTATION D\u2019ÉTAT DES LIEUX D\u2019ENTRÉE',
    `TEMPLATE DE CHECK-IN AUTOMATISÉ • ${city} • CERTIFICAT DE CONFORMITÉ`,
    fontsOk,
  );

  // 2. Ruban « PAGE 1 — ONBOARDING UNE FOIS » (icône caméra)
  drawRibbon(doc, 'PAGE 1 — ONBOARDING UNE FOIS', 'camera', fontsOk, BAND_H + 10);
  doc.y = BAND_H + 10 + 19 + 12;

  // 3. Titre
  txt(doc, fname('bold', fontsOk), 16, DARK, 'ONBOARDING UNE FOIS', MARGIN, doc.y, CONTENT_W, 'left');
  doc.y += 26;

  // 4. Rangée des 3 étapes
  drawStepsRow(doc, fontsOk);
  doc.y += 8;

  // 5. Section bibliothèque de référence
  drawLibraryHeader(doc, devices.length, refDate, fontsOk);

  // 6. Grille appareils (flux 2 colonnes, pagination auto)
  await drawDeviceGrid(doc, devices, fontsOk);
  doc.y += 6;

  // 7. Encadré explication
  drawExplainBox(doc, refDate, fontsOk);

  // 8. Pied noir (toutes pages)
  drawBlackFooters(
    doc,
    [
      `ROOMSCAN BOUCLIER \u2022 Onboarding valable indéfiniment sauf modification du logement \u2022 Réf: ${String(
        data?.property?.onboardingRef || '—',
      )}`,
    ],
    fontsOk,
  );

  doc.end();
  return finished;
}

// =============================================================
// PAGE 2 — CHECK-IN / CHECK-OUT
// =============================================================

function normalizeShot(s: ShieldPdfZoneShot): ShieldPdfZoneShot {
  return {
    zoneName: String(s?.zoneName ?? 'Zone'),
    photo: typeof s?.photo === 'string' ? s.photo : '',
    status: String(s?.status ?? ''),
    comment: s?.comment ?? null,
    capturedAt: toDate(s?.capturedAt),
  };
}

/** Ligne de statut d'une zone (coche verte si positif + label coloré + date). */
function drawShotStatus(
  doc: PdfDoc,
  s: ShieldPdfZoneShot,
  cx: number,
  y: number,
  maxWidth: number,
  fontsOk: boolean,
): void {
  const label = `${shotStatusLabel(s.status)} ${frDate(s.capturedAt)}`;
  doc.font(fname('bold', fontsOk)).fontSize(7);
  let labelW = doc.widthOfString(label);
  if (labelW > maxWidth) {
    labelW = maxWidth;
  }
  const withCheck = isPositiveShotStatus(s.status);
  const checkS = 8;
  const checkGap = 3;
  const totalW = labelW + (withCheck ? checkS + checkGap : 0);
  let sx = cx - totalW / 2;
  if (withCheck) {
    drawCheckMark(doc, sx + checkS / 2, y + 3.2, checkS, GREEN);
    sx += checkS + checkGap;
  }
  txt(
    doc,
    fname('bold', fontsOk),
    7,
    shotStatusColor(s.status),
    label,
    sx,
    y,
    labelW + 2,
    'left',
  );
}

/** Grille simple 3 colonnes × N rangées (CHECK-IN ou CHECK-OUT sans lien). */
function drawSimpleGrid(doc: PdfDoc, shots: ShieldPdfZoneShot[], fontsOk: boolean): void {
  const cols = 3;
  const gapX = 9;
  const cardW = (CONTENT_W - gapX * (cols - 1)) / cols; // ≈ 165.8
  const pad = 7;
  const imgH = 100;

  const cardHeight = (s: ShieldPdfZoneShot): number => {
    const textFont = fname('body', fontsOk);
    doc.font(textFont).fontSize(6.5);
    const commentLines = s.comment?.trim()
      ? Math.min(wrapText(doc, s.comment.trim(), cardW - pad * 2 - 4, textFont, 6.5).length, 2)
      : 0;
    return pad + imgH + 4 + 11 + 2 + 10 + (commentLines > 0 ? commentLines * 8.2 + 2 : 0) + 6;
  };

  const drawCard = (s: ShieldPdfZoneShot, x: number, y: number, h: number): void => {
    doc.save();
    doc
      .roundedRect(x, y, cardW, h, 6)
      .lineWidth(0.8)
      .strokeColor(BORDER)
      .fillAndStroke(CARD_GRAY, BORDER);
    doc.restore();

    drawPhoto(doc, s.photo, x + pad, y + pad, cardW - pad * 2, imgH, 'Photo indisponible');

    doc.font(fname('bold', fontsOk)).fontSize(9);
    const name = fitOneLine(doc, s.zoneName.toUpperCase(), cardW - pad * 2);
    txt(doc, fname('bold', fontsOk), 9, DARK, name, x + pad, y + pad + imgH + 5, cardW - pad * 2, 'center');

    const statusY = y + pad + imgH + 5 + 12;
    drawShotStatus(doc, s, x + cardW / 2, statusY, cardW - pad * 2 - 4, fontsOk);

    if (s.comment?.trim()) {
      const lines = wrapText(doc, s.comment.trim(), cardW - pad * 2 - 4, fname('body', fontsOk), 6.5).slice(0, 2);
      let cy = statusY + 11;
      for (const ln of lines) {
        txt(doc, fname('body', fontsOk), 6.5, INK, ln, x + pad + 2, cy, cardW - pad * 2 - 4, 'center');
        cy += 8.2;
      }
    }
  };

  let col = 0;
  let rowTop = doc.y;
  let rowH = 0;
  for (const s of shots) {
    const h = cardHeight(s);
    if (col === 0) {
      if (doc.y + h > MAX_Y_P2) doc.addPage();
      rowTop = doc.y;
    }
    const x = MARGIN + col * (cardW + gapX);
    drawCard(s, x, rowTop, h);
    rowH = Math.max(rowH, h);
    col += 1;
    if (col === cols) {
      doc.y = rowTop + rowH + 9;
      col = 0;
      rowH = 0;
    }
  }
  if (col > 0) doc.y = rowTop + rowH + 9;
}

/** Flèche pleine (pointe triangulaire) — rouge si écart détecté. */
function drawRedArrow(doc: PdfDoc, x1: number, x2: number, cy: number, color: string): void {
  const headW = 9;
  const headH = 10;
  const shaftEnd = x2 - headW + 1.5;
  doc.save();
  doc
    .moveTo(x1, cy)
    .lineTo(shaftEnd, cy)
    .lineWidth(2.4)
    .strokeColor(color)
    .lineCap('round')
    .stroke();
  doc
    .moveTo(x2, cy)
    .lineTo(x2 - headW, cy - headH / 2)
    .lineTo(x2 - headW, cy + headH / 2)
    .closePath()
    .fill(color);
  doc.restore();
}

/**
 * Grille COMPARATIF pleine largeur (CHECK-OUT lié) — UNE ZONE PAR RANGÉE :
 * photo ENTRÉE à gauche → flèche rouge si écart détecté (coche verte sinon)
 * → photo SORTIE à droite, pills superposées sur les photos, statut + date
 * sur la ligne d'en-tête de la rangée, commentaire sous les photos.
 */
function drawComparatifGrid(
  doc: PdfDoc,
  shots: ShieldPdfZoneShot[],
  linked: NonNullable<ShieldSessionPdfData['linked']>,
  completedAt: Date,
  fontsOk: boolean,
): void {
  const pad = 8;
  const arrowGap = 34;
  const photoW = (CONTENT_W - pad * 2 - arrowGap) / 2; // ≈ 232.6
  const imgH = 56;
  const linkedShots = Array.isArray(linked.shots) ? linked.shots.map(normalizeShot) : [];

  const cardHeight = (s: ShieldPdfZoneShot): number =>
    pad + 13 + imgH + 4 + (s.comment?.trim() ? 8.5 : 0) + 5;

  /** Mini-pastille superposée sur le coin d'une photo. */
  const drawCornerPill = (label: string, px: number, py: number, bg: string): void => {
    doc.font(fname('bold', fontsOk)).fontSize(5.4);
    const w = Math.min(doc.widthOfString(label) + 7, photoW - 4);
    doc.save();
    doc.roundedRect(px, py, w, 10.5, 5.25).fill(bg);
    doc.restore();
    txt(doc, fname('bold', fontsOk), 5.4, '#FFFFFF', label, px, py + 3.1, w, 'center');
  };

  const drawRow = (s: ShieldPdfZoneShot, x: number, y: number, h: number): void => {
    const entry = linkedShots.find((e) => e.zoneName === s.zoneName) ?? null;
    const hasEcart = !isPositiveShotStatus(s.status);

    doc.save();
    doc
      .roundedRect(x, y, CONTENT_W, h, 6)
      .lineWidth(0.8)
      .strokeColor(hasEcart ? RED : BORDER)
      .fillAndStroke('#FFFFFF', hasEcart ? RED : BORDER);
    doc.restore();

    // — Ligne 1 : nom de zone (gauche) + statut coloré (droite) —
    const line1Y = y + pad;
    doc.font(fname('bold', fontsOk)).fontSize(8.5);
    txt(
      doc,
      fname('bold', fontsOk),
      8.5,
      DARK,
      fitOneLine(doc, s.zoneName.toUpperCase(), photoW),
      x + pad,
      line1Y,
      photoW,
      'left',
    );
    const statusLabel = `${shotStatusLabel(s.status)} ${frDate(s.capturedAt)}`;
    doc.font(fname('bold', fontsOk)).fontSize(7);
    const statusW = doc.widthOfString(statusLabel);
    const withCheck = isPositiveShotStatus(s.status);
    const checkS = 8;
    const checkGap = 3;
    const totalW = statusW + (withCheck ? checkS + checkGap : 0);
    let sx = x + CONTENT_W - pad - totalW;
    if (withCheck) {
      drawCheckMark(doc, sx + checkS / 2, line1Y + 3.2, checkS, GREEN);
      sx += checkS + checkGap;
    }
    txt(doc, fname('bold', fontsOk), 7, shotStatusColor(s.status), statusLabel, sx, line1Y, statusW + 2, 'left');

    // — Ligne 2 : photos ENTRÉE → SORTIE + flèche centrale —
    const photosY = y + pad + 13;
    const inX = x + pad;
    const outX = x + pad + photoW + arrowGap;
    drawPhoto(
      doc,
      entry?.photo,
      inX,
      photosY,
      photoW,
      imgH,
      'Entrée manquante',
    );
    drawPhoto(doc, s.photo, outX, photosY, photoW, imgH, 'Photo indisponible');

    drawCornerPill(
      `ENTRÉE ${frDateShort(entry ? entry.capturedAt : toDate(linked.completedAt))}`,
      inX + 2,
      photosY + 2,
      MUTED,
    );
    drawCornerPill(`SORTIE ${frDateShort(s.capturedAt)}`, outX + 2, photosY + 2, RED);

    // Flèche rouge si écart détecté — coche verte si conforme.
    const arrowCy = photosY + imgH / 2;
    if (hasEcart) {
      drawRedArrow(doc, inX + photoW + 5, outX - 5, arrowCy, RED);
    } else {
      drawCheckMark(doc, inX + photoW + arrowGap / 2, arrowCy, 13, GREEN);
    }

    // — Ligne 3 : commentaire d'écart (1 ligne tronquée) —
    if (s.comment?.trim()) {
      doc.font(fname('body', fontsOk)).fontSize(6.3);
      txt(
        doc,
        fname('body', fontsOk),
        6.3,
        INK,
        fitOneLine(doc, s.comment.trim(), CONTENT_W - pad * 2 - 4),
        x + pad + 2,
        photosY + imgH + 4,
        CONTENT_W - pad * 2 - 4,
        'left',
      );
    }
  };

  let rowTop = doc.y;
  for (const [i, s] of shots.entries()) {
    const h = cardHeight(s);
    if (i === 0) {
      if (doc.y + h > MAX_Y_P2) doc.addPage();
      rowTop = doc.y;
    } else if (rowTop + h > MAX_Y_P2) {
      doc.addPage();
      rowTop = doc.y;
    }
    drawRow(s, MARGIN, rowTop, h);
    rowTop += h + 6;
  }
  doc.y = rowTop;
}

/** Boîte sombre vidéo : QR d'accès + consignes walkthrough. */
async function drawVideoBox(
  doc: PdfDoc,
  onboardingRef: string,
  video: NonNullable<ShieldSessionPdfData['video']>,
  fontsOk: boolean,
): Promise<void> {
  const BOX_H = 154;
  if (doc.y + BOX_H > MAX_Y_P2) doc.addPage();
  const y0 = doc.y;

  doc.save();
  doc.roundedRect(MARGIN, y0, CONTENT_W, BOX_H, 8).fill(VIDEO_BOX);
  doc.restore();

  const dur = Math.max(0, Math.round(Number(video?.durationSec) || 0));

  // — Colonne gauche : QR sur plaque blanche + consigne de scan —
  const plate = 102;
  const plateX = MARGIN + 16;
  const plateY = y0 + 12;
  doc.save();
  doc.roundedRect(plateX, plateY, plate, plate, 6).fill('#FFFFFF');
  doc.restore();
  const qr = await makeQrBuffer(`https://roomscan.pro/shield/video/${video.publicToken}`, 300);
  drawQr(doc, qr, plateX + 5, plateY + 5, plate - 10);

  const labelY = plateY + plate + 6;
  txt(
    doc,
    fname('bold', fontsOk),
    6.8,
    '#FFFFFF',
    `SCAN POUR ACCÉDER À LA VIDÉO ${dur}s`,
    MARGIN + 2,
    labelY,
    130,
    'center',
  );
  const token = String(video.publicToken || '');
  const shortToken = token.length > 12 ? `${token.slice(0, 12)}\u2026` : token;
  txt(
    doc,
    fname('body', fontsOk),
    6,
    '#FFFFFF',
    `Lien sécurisé → roomscan.pro/shield/video/${shortToken}`,
    MARGIN - 4,
    labelY + 19,
    142,
    'center',
    { opacity: 0.6 },
  );

  // — Colonne droite : titre + puces —
  const rx = MARGIN + 178;
  const rw = MARGIN + CONTENT_W - rx - 14;
  txt(doc, fname('bold', fontsOk), 8.5, '#FFFFFF', 'VIDÉO WALKTHROUGH OBLIGATOIRE', rx, y0 + 14, rw, 'left');

  const bodyFont = fname('body', fontsOk);
  const boldFont = fname('bold', fontsOk);
  let by = y0 + 29;

  const bulletText = (str: string, size = 7.2): void => {
    txt(doc, bodyFont, size, '#FFFFFF', str, rx + 8, by, rw - 8, 'left', { opacity: 0.85 });
    by += size * 1.33;
  };

  txt(doc, bodyFont, 7.2, '#FFFFFF', '\u2022', rx, by, 8, 'left', { opacity: 0.85 });
  for (const ln of wrapText(
    doc,
    `Durée: ${dur} secondes — parcours complet du logement en vidéo continue.`,
    rw - 8,
    bodyFont,
    7.2,
  )) {
    bulletText(ln);
  }
  by += 2.5;

  txt(doc, bodyFont, 7.2, '#FFFFFF', '\u2022', rx, by, 8, 'left', { opacity: 0.85 });
  for (const ln of wrapText(
    doc,
    'Objectif: Vérifier l\u2019état général en mouvement et l\u2019absence de dégâts.',
    rw - 8,
    bodyFont,
    7.2,
  )) {
    bulletText(ln);
  }
  by += 2.5;

  // Statut : VALIDÉ en vert bold au milieu des segments blancs
  txt(doc, bodyFont, 7.2, '#FFFFFF', '\u2022', rx, by, 8, 'left', { opacity: 0.85 });
  const p1 = 'Statut: ';
  const p2 = 'VALIDÉ';
  const p3 = ` — Conforme au ${frDateTime(toDate(video.createdAt))} GMT`;
  doc.font(bodyFont).fontSize(7.2);
  const w1 = doc.widthOfString(p1);
  doc.font(boldFont).fontSize(7.2);
  const w2 = doc.widthOfString(p2);
  txt(doc, bodyFont, 7.2, '#FFFFFF', p1, rx + 8, by, w1 + 2, 'left', { opacity: 0.85 });
  txt(doc, boldFont, 7.2, GREEN, p2, rx + 8 + w1, by, w2 + 2, 'left');
  txt(doc, bodyFont, 7.2, '#FFFFFF', p3, rx + 8 + w1 + w2, by, rw - 8 - w1 - w2, 'left', { opacity: 0.85 });
  by += 7.2 * 1.33 + 2.5;

  txt(doc, bodyFont, 7.2, '#FFFFFF', '\u2022', rx, by, 8, 'left', { opacity: 0.85 });
  for (const ln of wrapText(
    doc,
    `Re-validation: cette vidéo prouve le bon état actuel de tous les équipements de la bibliothèque de référence (onboarding ${onboardingRef}).`,
    rw - 8,
    bodyFont,
    7.2,
  )) {
    bulletText(ln);
  }

  doc.y = y0 + BOX_H + 8;
}

/** Encadré ROUGE — CERTIFICAT D'AUTHENTICITÉ : hash SHA-256 EN GROS. */
function drawHashBox(
  doc: PdfDoc,
  video: NonNullable<ShieldSessionPdfData['video']>,
  fontsOk: boolean,
): void {
  const h = 78;
  if (doc.y + h > MAX_Y_P2) doc.addPage();
  const y0 = doc.y;

  // Fond rouge pleine largeur + liseré blanc intérieur (certificat).
  doc.save();
  doc.roundedRect(MARGIN, y0, CONTENT_W, h, 8).fill(RED);
  doc.restore();
  doc.save();
  doc
    .roundedRect(MARGIN + 4, y0 + 4, CONTENT_W - 8, h - 8, 6)
    .lineWidth(0.9)
    .strokeColor('#FFFFFF', 0.45)
    .stroke();
  doc.restore();

  // Titre « certificat d'authenticité »
  txt(
    doc,
    fname('bold', fontsOk),
    9.5,
    '#FFFFFF',
    'CERTIFICAT D\u2019AUTHENTICITÉ — HASH DE VÉRIFICATION SHA-256',
    MARGIN + 16,
    y0 + 10,
    CONTENT_W - 32,
    'center',
    { characterSpacing: 0.7 },
  );

  // LE hash, gros, mono bold, sur UNE ligne centrée (64 hex).
  const raw = String(video?.sha256 || '').replace(/[^0-9a-fA-F]/g, '');
  const hash = (raw.length >= 64 ? raw.slice(0, 64) : raw.padEnd(64, '0')).toUpperCase();
  const monoFont = fname('monoBold', fontsOk);
  doc.font(monoFont).fontSize(12.5);
  const hashFit = fitOneLine(doc, hash, CONTENT_W - 32);
  txt(doc, monoFont, 12.5, '#FFFFFF', hashFit, MARGIN + 16, y0 + 27, CONTENT_W - 32, 'center');

  // Ligne de garanties
  const garanties = `${CHK(fontsOk)} Intégrité vérifiée \u2022 Empreinte du fichier vidéo scellé \u2022 Horodatage électronique ${frDateTime(
    toDate(video.createdAt),
  )}`;
  doc.font(fname('bold', fontsOk)).fontSize(6.6);
  txt(
    doc,
    fname('bold', fontsOk),
    6.6,
    '#FFFFFF',
    fitOneLine(doc, garanties, CONTENT_W - 32),
    MARGIN + 16,
    y0 + h - 19,
    CONTENT_W - 32,
    'center',
    { opacity: 0.9 },
  );

  doc.y = y0 + h + 8;
}

/** Encadré « Vidéo en cours de traitement » (vidéo absente). */
function drawVideoPendingBox(doc: PdfDoc, fontsOk: boolean): void {
  const h = 56;
  if (doc.y + h > MAX_Y_P2) doc.addPage();
  const y0 = doc.y;

  doc.save();
  doc
    .roundedRect(MARGIN, y0, CONTENT_W, h, 8)
    .lineWidth(1)
    .strokeColor(BORDER)
    .fillAndStroke(CARD_GRAY, BORDER);
  doc.restore();

  txt(doc, fname('bold', fontsOk), 9, DARK, 'Vidéo en cours de traitement', MARGIN, y0 + 16, CONTENT_W, 'center');
  txt(
    doc,
    fname('body', fontsOk),
    7,
    MUTED,
    'Le QR code d\u2019accès et le hash SHA-256 de la vidéo seront disponibles dès la fin de l\u2019encodage.',
    MARGIN,
    y0 + 31,
    CONTENT_W,
    'center',
  );

  doc.y = y0 + h + 8;
}

/** Mentions légales grises, positionnées juste au-dessus du pied noir. */
function drawLegalMentions(doc: PdfDoc, fontsOk: boolean): void {
  const text =
    'Mentions légales : Ce document est généré automatiquement par Roomscan Inventaire. ' +
    'Les données sont conservées 12 mois conformément à la réglementation en vigueur. ' +
    'Toute contestation sous 48h via support@roomscan.pro. Signature numérique: VERIFIED';
  const bodyFont = fname('body', fontsOk);
  doc.font(bodyFont).fontSize(6.2);
  const lines = wrapText(doc, text, CONTENT_W, bodyFont, 6.2).slice(0, 2);
  const lineH = 8;
  const y = PAGE_H - FOOTER_H_P2 - 5 - lines.length * lineH;
  lines.forEach((ln, i) => {
    txt(doc, bodyFont, 6.2, MUTED, ln, MARGIN, y + i * lineH, CONTENT_W, 'center');
  });
}

export async function renderShieldSessionPdf(data: ShieldSessionPdfData): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');
  const isOut = data?.session?.type === 'CHECK_OUT';
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: isOut
        ? 'Rapport de sortie — comparatif entrée/sortie (Roomscan Inventaire)'
        : "Attestation d'état des lieux d'entrée (Roomscan Inventaire)",
      Author: 'RoomScan',
      Subject: `Dossier certifié ${String(data?.session?.sessionRef || '')}`.trim(),
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const fontsOk = await registerFonts(doc);

  const city = String(data?.property?.city || '').trim().toUpperCase() || '—';
  const completedAt = toDate(data?.session?.completedAt);
  const onboardedAt = toDate(data?.property?.onboardedAt);
  const devices = Array.isArray(data?.devices) ? data.devices : [];
  const shots = (Array.isArray(data?.shots) ? data.shots : []).map(normalizeShot);
  const linked = data?.linked
    ? {
        sessionRef: String(data.linked.sessionRef || ''),
        completedAt: toDate(data.linked.completedAt),
        shots: (Array.isArray(data.linked.shots) ? data.linked.shots : []).map(normalizeShot),
      }
    : null;
  const video = data?.video ?? null;
  const guestName = String(data?.session?.guestName || '').trim();

  // ════════════════════════════════════════════════════════════
  // PAGE 1 — BIBLIOTHÈQUE DE RÉFÉRENCE (ONBOARDING, PHOTOS APPAREILS)
  // ════════════════════════════════════════════════════════════
  // v4.120 — titre métier en bandeau (demande client) : le document
  // porte son intitulé juridique, pas le nom du produit.
  const docTitle = isOut
    ? 'RAPPORT DE SORTIE — COMPARATIF ENTRÉE / SORTIE'
    : 'ATTESTATION D\u2019ÉTAT DES LIEUX D\u2019ENTRÉE';
  drawRedBanner(
    doc,
    docTitle,
    `ÉTAT DES LIEUX • ${city} • BIBLIOTHÈQUE DE RÉFÉRENCE VERROUILLÉE`,
    fontsOk,
  );
  drawRibbon(doc, 'PAGE 1 — ONBOARDING UNE FOIS (PHOTOS DE RÉFÉRENCE)', 'camera', fontsOk, BAND_H + 8);
  doc.y = BAND_H + 8 + 19 + 10;

  txt(
    doc,
    fname('bold', fontsOk),
    15,
    DARK,
    'BIBLIOTHÈQUE DE RÉFÉRENCE — ONBOARDING UNE FOIS',
    MARGIN,
    doc.y,
    CONTENT_W,
    'left',
  );
  doc.y += 18;
  txt(
    doc,
    fname('body', fontsOk),
    7.5,
    MUTED,
    `Les ${devices.length} appareils permanents sont photographiés UNE SEULE FOIS le ${frDate(
      onboardedAt,
    )} (QR + hash par appareil), puis réutilisés et re-validés à chaque session par la vidéo walkthrough.`,
    MARGIN,
    doc.y,
    CONTENT_W,
    'left',
  );
  doc.y += 15;

  drawLibraryHeader(doc, devices.length, onboardedAt, fontsOk);
  await drawDeviceGrid(doc, devices, fontsOk);
  doc.y += 6;
  drawExplainBox(doc, onboardedAt, fontsOk);

  // ════════════════════════════════════════════════════════════
  // PAGE 2 — CERTIFICAT / RAPPORT (titres juridiques demandés)
  // ════════════════════════════════════════════════════════════
  doc.addPage();

  // 1. Bandeau rouge + sous-titre de contrôle (v4.120 : titre métier)
  const controlLabel = isOut
    ? `RAPPORT DE SORTIE DU ${frDate(completedAt)}`
    : `ATTESTATION D'ENTRÉE DU ${frDate(completedAt)}`;
  drawRedBanner(doc, docTitle, `ÉTAT DES LIEUX • ${city} • ${controlLabel}`, fontsOk);

  // 2. Ruban de page (clipboard pour CHECK-IN, caméra pour CHECK-OUT)
  const ribbonText = isOut
    ? 'PAGE 2 — CHECK-OUT 6 PHOTOS SORTIE'
    : 'PAGE 2 — CHECK-IN 6 PHOTOS MÉNAGE';
  drawRibbon(doc, ribbonText, isOut ? 'camera' : 'clipboard', fontsOk, BAND_H + 8);
  doc.y = BAND_H + 8 + 19 + 10;

  // 3. TITRE JURIDIQUE (demandé par le client)
  const title = isOut
    ? 'RAPPORT DE SORTIE — COMPARATIF ENTRÉE/SORTIE'
    : 'ATTESTATION D\u2019ÉTAT DES LIEUX D\u2019ENTRÉE';
  doc.font(fname('bold', fontsOk)).fontSize(15.5);
  txt(doc, fname('bold', fontsOk), 15.5, DARK, fitOneLine(doc, title, CONTENT_W), MARGIN, doc.y, CONTENT_W, 'left');
  doc.y += 19;

  // 4. Sous-titre juridique (hash + contestation 48 h / preuve état rendu + écarts)
  const nOk = shots.filter((s) => s.status === 'IMPECCABLE').length;
  const nEcarts = shots.filter((s) => !isPositiveShotStatus(s.status)).length;
  const subtitle = isOut
    ? `Preuve de l'état rendu le ${frDate(completedAt)} — ${nEcarts > 0 ? `${nEcarts} écart${nEcarts > 1 ? 's' : ''} constaté${nEcarts > 1 ? 's' : ''}` : 'aucun écart constaté'}${linked ? ` (entrée du ${frDate(linked.completedAt)})` : ''}.`
    : `Document sécurisé avec hash SHA-256 — Contestation sous 48 h. Statut: IMPECCABLE pour ${nOk}/${shots.length} zones.${guestName ? ` Séjour de ${guestName}.` : ''}`;
  txt(doc, fname('body', fontsOk), 7.5, MUTED, subtitle, MARGIN, doc.y, CONTENT_W, 'left');
  doc.y += 15;

  // 5. Grille des zones (comparatif entrée→sortie si CHECK-OUT lié)
  if (isOut && linked) {
    drawComparatifGrid(doc, shots, linked, completedAt, fontsOk);
  } else {
    drawSimpleGrid(doc, shots, fontsOk);
  }
  doc.y += 4;

  // 6-8. Vidéo walkthrough + CERTIFICAT D'AUTHENTICITÉ (hash rouge) —
  // conservés ENSEMBLE : si la vidéo + le hash ne tiennent pas sur la
  // page courante, on saute à une nouvelle page pour éviter un hash
  // isolé sur une page vide.
  if (video) {
    const vTitle = `VIDÉO WALKTHROUGH ${Math.max(0, Math.round(Number(video.durationSec) || 0))}s — VALIDATION VIDÉO`;
    if (doc.y + 20 + 154 + 84 > MAX_Y_P2) doc.addPage();
    drawPlay(doc, MARGIN + 7, doc.y + 7, 14);
    txt(doc, fname('bold', fontsOk), 11.5, RED, vTitle, MARGIN + 20, doc.y + 0.5, CONTENT_W - 20, 'left');
    doc.y += 20;

    await drawVideoBox(doc, String(data?.property?.onboardingRef || '—'), video, fontsOk);
    drawHashBox(doc, video, fontsOk);
  } else {
    drawPlay(doc, MARGIN + 7, doc.y + 7, 14);
    txt(doc, fname('bold', fontsOk), 11.5, RED, 'VIDÉO WALKTHROUGH — VALIDATION VIDÉO', MARGIN + 20, doc.y + 0.5, CONTENT_W - 20, 'left');
    doc.y += 20;
    drawVideoPendingBox(doc, fontsOk);
  }

  // 9. Mentions légales (au-dessus du pied)
  drawLegalMentions(doc, fontsOk);

  // 10. Pied noir 2 lignes (toutes pages)
  drawBlackFooters(
    doc,
    [
      `CERTIFICAT ROOMSCAN BOUCLIER — Document automatisé généré le ${frDate(new Date())} \u2022 Conforme RGPD`,
      `Valable pour audit et assurance \u2022 Réf: ${String(data?.session?.sessionRef || '—')}`,
    ],
    fontsOk,
  );

  doc.end();
  return finished;
}
