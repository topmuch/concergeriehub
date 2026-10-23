// =============================================================
// v5.0 « ÉTAT DES LIEUX DE SORTIE » — LIB PDF SERVER-SIDE (pdfkit)
//
// Deux documents légaux :
//   • renderCheckOutInspectionPdf() — « État des lieux de sortie »
//     signé par l'invité (pièces, dégâts, photos, inventaire,
//     auto-évaluation, signature, traçabilité) ;
//   • renderCheckInProofPdf() — « Preuve d'inventaire d'arrivée »
//     (validation minibar / état des lieux d'entrée, version
//     simplifiée sans dégâts).
//
// Style sobre légal (Airbnb Pro neutre) : Helvetica, filet gris,
// A4 marge 50 — AUCUN émoji (fontes standard), accents FR OK.
// v5.1 — l'en-tête embarque le LOGO ROOMSCAN officiel (public/brand/
// roomscan-logo.png, lu depuis le disque) sauf si le bien a un logo
// white-label, et le bloc « infos du bien » affiche nom + adresse +
// type de logement (Property.propertyType).
// Photos & signature : Buffer décodés depuis les dataURL (try/catch
// par image — un dataURL invalide ne fait jamais planter le PDF).
// pdfkit est externalisé (serverExternalPackages) — import dynamique
// dans les fonctions pour éviter tout souci ESM/CJS.
// =============================================================

import { readFile } from 'fs/promises';
import path from 'path';

// Type de l'instance PDFKit (module typé `export = doc` → typeof).
type PdfDoc = typeof import('pdfkit');

// ---------- Types d'entrée (rows Prisma allégées) ----------

export interface InspectionPdfProperty {
  name: string;
  address?: string | null;
  /** v5.1 — type de logement (Property.propertyType : AIRBNB | BOOKING | GITE | CHAMBRE_HOTE). */
  propertyType?: string | null;
  /** v4.82 — white-label : logo, couleur de marque, nom commercial. */
  branding?: InspectionPdfBranding | null;
  /** v4.82 — coordonnées de l'hôte affichées sur le document. */
  host?: InspectionPdfHost | null;
}

/** v4.82 — identité de marque du bien (Json Property.branding). */
export interface InspectionPdfBranding {
  /** Chemin public du logo (ex: /uploads/branding/xxx.png?v=…). */
  logoUrl?: string | null;
  /** Couleur d'accent hex #RRGGBB (bandeau d'en-tête). */
  primaryColor?: string | null;
  /** Nom commercial affiché à la place de "RoomScan". */
  companyName?: string | null;
}

/** v4.82 — coordonnées de l'hôte (User + Profile). */
export interface InspectionPdfHost {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface CheckOutInspectionPdfData {
  id: string;
  publicToken: string;
  guestName: string;
  guestEmail?: string | null;
  ipAddress?: string | null;
  signedAt: Date;
  /** v4.80 — 'checkin' (entrée) | 'checkout' (sortie, défaut). */
  type?: 'checkin' | 'checkout';
  selfAssessment: number;
  /** Commentaires libres + remarques sur pièces « bonnes ». */
  issues?: string | null;
  /** Résumé texte des dégâts (« Cuisine : Endommagé — … »). */
  damages?: string | null;
  /** Json : [{ id, label, status, comment, photoCount }] */
  roomsData: unknown;
  /** Json : { keys, remotes, towels } */
  inventoryCheck: unknown;
  /** v4.80 — Json : [{ name, consumed }] — minibar déclaré à la sortie. */
  minibarData?: unknown;
  /** Json : array plat de dataURL (ordre des pièces conservé). */
  damagePhotos: unknown;
  /** dataURL PNG de la signature (optionnel). */
  guestSignature?: string | null;
  /** Séjour lié (dates de référence). */
  booking?: { checkIn: Date; checkOut: Date } | null;
  property: InspectionPdfProperty;
}

export interface CheckInProofPdfData {
  id: string;
  publicToken: string;
  guestName?: string | null;
  checkedAt: Date;
  property: InspectionPdfProperty;
  booking?: { checkIn: Date; checkOut: Date } | null;
}

// ---------- Constantes ----------

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2; // 495.28
const BRAND = '#055492'; // Bleu vif logo — en-tête RoomScan
const INK = '#111827';
const MUTED = '#6B7280';
const LINE = '#D6D3D1'; // stone-300

/** v4.82 — hex strict #RRGGBB (couleur de marque white-label). */
function brandHex(v: unknown): string | null {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
}

/**
 * v5.1 — charge le logo RoomScan officiel depuis le disque (lecture
 * FICHIER, pas HTTP — robuste en mode standalone où les fichiers
 * ajoutés à public/ après le build ne sont pas servis mais restent
 * lisibles). Asset du repo : public/brand/roomscan-logo.png
 * (logo complet « maison + R + RoomScan », 212×163 RGBA, fond
 * transparent — variante couleurs pour fond blanc). Plusieurs
 * candidats selon l'environnement d'exécution ; résultat mis en
 * cache (une seule lecture disque par process) ; null si absent.
 */
const ROOMSCAN_LOGO_REL = path.join('brand', 'roomscan-logo.png');
let roomScanLogoCache: Buffer | null | undefined;

async function loadRoomScanLogo(): Promise<Buffer | null> {
  if (roomScanLogoCache !== undefined) return roomScanLogoCache;
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'public', ROOMSCAN_LOGO_REL),
    path.join(cwd, '.next', 'standalone', 'public', ROOMSCAN_LOGO_REL),
  ];
  for (const p of candidates) {
    try {
      const buf = await readFile(p);
      if (buf.length > 0) {
        roomScanLogoCache = buf;
        return buf;
      }
    } catch {
      // fichier absent — candidat suivant
    }
  }
  roomScanLogoCache = null;
  return null;
}

/** v5.1 — libellés « type de logement » (SANS émoji : fontes PDF standard). */
const PROPERTY_TYPE_LABEL: Record<string, string> = {
  AIRBNB: 'Airbnb',
  BOOKING: 'Booking.com',
  GITE: 'Gîte',
  CHAMBRE_HOTE: "Chambre d'hôtes",
};

/** v5.1 — libellé sûr du type de logement (null = absent/illisible). */
function propertyTypeLabel(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const key = raw.trim();
  return PROPERTY_TYPE_LABEL[key] ?? key.slice(0, 40);
}

/**
 * v4.82 — charge le logo white-label depuis le disque (lecture FICHIER,
 * pas HTTP — les fichiers ajoutés à public/ après le build ne sont pas
 * servis par le serveur standalone mais restent lisibles sur le disque).
 * Allowlist stricte du nom de fichier (anti path-traversal) + plusieurs
 * répertoires candidats (public, data — même pattern que voice-audio).
 */
async function loadLogoBuffer(logoUrl?: string | null): Promise<Buffer | null> {
  if (!logoUrl || typeof logoUrl !== 'string') return null;
  const marker = '/uploads/branding/';
  const idx = logoUrl.indexOf(marker);
  if (idx === -1) return null;
  const base = logoUrl
    .slice(idx + marker.length)
    .split(/[?#]/)[0]
    .trim();
  if (!base || base.includes('..') || !/^[A-Za-z0-9._-]+$/.test(base)) return null;
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'public', 'uploads', 'branding', base),
    path.join(cwd, 'data', 'uploads', 'branding', base),
  ];
  for (const p of candidates) {
    try {
      const buf = await readFile(p);
      if (buf.length > 0) return buf;
    } catch {
      // fichier absent — candidat suivant
    }
  }
  return null;
}

const STATUS_LABEL: Record<string, string> = {
  good: 'Bon état',
  dirty: 'Sale',
  damaged: 'Endommagé',
};

const ROOM_FALLBACK_LABEL: Record<string, string> = {
  entrance: 'Entrée / Couloir',
  kitchen: 'Cuisine',
  livingRoom: 'Salon / Séjour',
  bedrooms: 'Chambres',
  bathroom: 'Salle de bain',
};

const frDateTime = (d: Date) =>
  d.toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const frDate = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// ---------- Helpers ----------

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

interface PdfRoom {
  id: string;
  label: string;
  status: string;
  comment: string | null;
  photoCount: number;
}

/** Parse roomsData (Json SQLite) en liste typée — tolérant, jamais throw. */
function parseRooms(raw: unknown): PdfRoom[] {
  if (!Array.isArray(raw)) return [];
  const rooms: PdfRoom[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '';
    if (!id) continue;
    rooms.push({
      id,
      label: typeof r.label === 'string' && r.label.trim() ? r.label : ROOM_FALLBACK_LABEL[id] ?? id,
      status: typeof r.status === 'string' ? r.status : 'good',
      comment: typeof r.comment === 'string' ? r.comment : null,
      photoCount: typeof r.photoCount === 'number' ? r.photoCount : 0,
    });
  }
  return rooms;
}

/** Associe les photos (array plat) aux pièces via photoCount (ordre préservé). */
function labeledPhotos(rooms: PdfRoom[], flat: unknown): { buffer: Buffer; label: string }[] {
  if (!Array.isArray(flat)) return [];
  const out: { buffer: Buffer; label: string }[] = [];
  let cursor = 0;
  for (const room of rooms) {
    for (let i = 0; i < room.photoCount && cursor < flat.length; i++) {
      const buf = decodeDataUrl(flat[cursor]);
      cursor += 1;
      if (buf) out.push({ buffer: buf, label: room.label });
      if (out.length >= 20) return out; // garde-fou volumétrie
    }
  }
  // Photos orphelines (roomsData absent) — légende générique.
  if (out.length === 0) {
    for (const item of flat.slice(0, 20)) {
      const buf = decodeDataUrl(item);
      if (buf) out.push({ buffer: buf, label: 'Photo' });
    }
  }
  return out;
}

function parseInventory(raw: unknown): { keys: number; remotes: number; towels: number } {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : d);
  return { keys: num(obj.keys, 0), remotes: num(obj.remotes, 0), towels: num(obj.towels, 0) };
}

/** v4.80 — parse minibarData (Json SQLite) — tolérant, jamais throw. */
function parseMinibarRows(raw: unknown): { name: string; consumed: number }[] {
  if (!Array.isArray(raw)) return [];
  const rows: { name: string; consumed: number }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    const consumed = typeof r.consumed === 'number' && Number.isFinite(r.consumed) && r.consumed >= 0 ? Math.round(r.consumed) : 0;
    if (name && consumed > 0) rows.push({ name: name.slice(0, 80), consumed });
  }
  return rows;
}

/** Décale en nouvelle page si l'espace restant est insuffisant. */
function ensureSpace(doc: PdfDoc, needed: number): void {
  if (doc.y + needed > PAGE_H - MARGIN - 34) doc.addPage();
}

/** Bandeau d'en-tête commun (logo + marque + titre + propriété). */
function drawHeader(
  doc: PdfDoc,
  title: string,
  property: InspectionPdfProperty,
  logo?: Buffer | null,
): void {
  // v4.82 — white-label : couleur + nom commercial du branding du bien.
  const brandColor = brandHex(property.branding?.primaryColor) ?? BRAND;
  const companyNameRaw = property.branding?.companyName;
  const brandLabel =
    typeof companyNameRaw === 'string' && companyNameRaw.trim()
      ? companyNameRaw.trim().slice(0, 60)
      : 'RoomScan';

  // Bandeau couleur de marque
  doc.rect(MARGIN, MARGIN, CONTENT_W, 4).fill(brandColor);

  doc.moveDown(0.6);
  // v4.82/v5.1 — logo à gauche (logo du bien white-label OU logo
  // RoomScan officiel), titre décalé à droite. Cadre 72×56 : un logo
  // carré reste 56×56, le logo RoomScan (ratio 1.3) occupe 72×55.
  const yTop = doc.y;
  let logoIndent = 0;
  if (logo) {
    try {
      doc.image(logo, MARGIN, yTop, { fit: [72, 56] });
      logoIndent = 84;
    } catch {
      // logo illisible — en-tête sans logo, le PDF ne plante jamais.
    }
  }
  doc
    .font('Helvetica-Bold')
    .fontSize(17)
    .fillColor(INK)
    .text(title, MARGIN + logoIndent, doc.y, { width: CONTENT_W - logoIndent });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(`${brandLabel} — document de preuve horodaté`, MARGIN + logoIndent, doc.y + 2, {
      width: CONTENT_W - logoIndent,
    });
  if (logoIndent > 0) {
    // garantir que la suite descend sous le logo (plus haut que le titre)
    doc.y = Math.max(doc.y, yTop + 60);
  }

  doc.moveDown(0.8);
  const boxTop = doc.y;
  // v5.1 — bloc « infos du bien » : nom, adresse, type de logement, hôte.
  const typeLabel = propertyTypeLabel(property.propertyType);
  const boxH =
    (property.address ? 58 : 44) + (typeLabel ? 13 : 0) + (property.host?.name ? 13 : 0);
  doc.roundedRect(MARGIN, boxTop, CONTENT_W, boxH, 6).fill('#FAFAF9');
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(INK)
    .text(property.name, MARGIN + 12, boxTop + 10, { width: CONTENT_W - 24 });
  if (property.address) {
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(property.address, MARGIN + 12, doc.y + 2, { width: CONTENT_W - 24 });
  }
  if (typeLabel) {
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(`Type de logement : ${typeLabel}`, MARGIN + 12, doc.y + 2, {
        width: CONTENT_W - 24,
      });
  }
  // v4.82 — informations de l'hôte dans le bloc propriété.
  const hostName = property.host?.name?.trim();
  if (hostName) {
    const hostContact = [
      property.host?.email?.trim() || null,
      property.host?.phone?.trim() || null,
    ]
      .filter(Boolean)
      .join(' · ');
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(`Hôte : ${hostName}${hostContact ? ` — ${hostContact}` : ''}`, MARGIN + 12, doc.y + 2, {
        width: CONTENT_W - 24,
      });
  }
  doc.y = boxTop + boxH + 14;
}

/** Pied de page légal sur TOUTES les pages (numérotation incluse). */
function drawFooters(
  doc: PdfDoc,
  opts: { token: string; id: string; ip?: string | null; generatedAt: Date },
): void {
  const range = doc.bufferedPageRange();
  const legal =
    `Document généré électroniquement le ${frDateTime(opts.generatedAt)}` +
    ` — ${opts.token} · ID ${opts.id}` +
    (opts.ip ? ` · IP ${opts.ip}` : '');
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(legal, MARGIN, PAGE_H - 44, { width: CONTENT_W - 60, lineBreak: false });
    doc
      .text(`Page ${i + 1}/${range.count}`, PAGE_W - MARGIN - 55, PAGE_H - 44, {
        width: 55,
        align: 'right',
        lineBreak: false,
      });
  }
}

/** Ligne « libellé : valeur » des blocs d'infos. */
function infoLine(doc: PdfDoc, label: string, value: string): void {
  const y = doc.y;
  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(label, MARGIN, y, {
    width: 130,
    lineBreak: false,
  });
  doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(value, MARGIN + 135, y, {
    width: CONTENT_W - 135,
  });
  doc.x = MARGIN;
  doc.moveDown(0.35);
}

/** Titre de section (petit filet). */
function sectionTitle(doc: PdfDoc, title: string): void {
  ensureSpace(doc, 40);
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(title, MARGIN, doc.y, {
    width: CONTENT_W,
  });
  doc
    .moveTo(MARGIN, doc.y + 3)
    .lineTo(PAGE_W - MARGIN, doc.y + 3)
    .lineWidth(0.75)
    .strokeColor(LINE)
    .stroke();
  doc.y += 10;
}

// ---------- Document 1 : ÉTAT DES LIEUX DE SORTIE ----------

export async function renderCheckOutInspectionPdf(
  inspection: CheckOutInspectionPdfData,
): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, info: { Title: inspection.type === 'checkin' ? "État des lieux d'entrée" : 'État des lieux de sortie' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // v4.80 — entrée (checkin) vs sortie (checkout) : titre + sections.
  const isCheckin = inspection.type === 'checkin';
  // v4.82 — logo du bien white-label ; v5.1 — repli : logo RoomScan officiel.
  const logo =
    (await loadLogoBuffer(inspection.property.branding?.logoUrl)) ?? (await loadRoomScanLogo());
  drawHeader(
    doc,
    isCheckin ? "État des lieux d'entrée" : 'État des lieux de sortie',
    inspection.property,
    logo,
  );

  // ── Bloc infos ──
  infoLine(doc, 'Invité', inspection.guestName + (inspection.guestEmail ? ` (${inspection.guestEmail})` : ''));
  if (inspection.booking) {
    infoLine(
      doc,
      'Séjour',
      `du ${frDate(inspection.booking.checkIn)} au ${frDate(inspection.booking.checkOut)}`,
    );
  }
  infoLine(doc, 'Signé le', frDateTime(inspection.signedAt));
  if (!isCheckin) {
    infoLine(doc, 'Auto-évaluation', `${inspection.selfAssessment} / 5`);
  }

  // ── Tableau des 5 pièces ──
  sectionTitle(doc, 'État des pièces');
  const rooms = parseRooms(inspection.roomsData);
  const list = rooms.length > 0 ? rooms : Object.entries(ROOM_FALLBACK_LABEL).map(([id, label]) => ({ id, label, status: 'good', comment: null, photoCount: 0 }));
  const colLabel = MARGIN;
  const colStatus = MARGIN + 200;
  const colStatusW = 90;
  for (const room of list) {
    ensureSpace(doc, 46);
    const startY = doc.y;
    const isIssue = room.status !== 'good';
    // Fond teinté pour les pièces signalées
    if (isIssue) {
      doc
        .rect(MARGIN - 6, startY - 3, CONTENT_W + 12, 14)
        .fill(room.status === 'damaged' ? '#FEF2F2' : '#FFFBEB');
    }
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(room.label, colLabel, startY, {
      width: 190,
      lineBreak: false,
    });
    doc
      .font(isIssue ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(9.5)
      .fillColor(room.status === 'damaged' ? '#B91C1C' : room.status === 'dirty' ? '#B45309' : '#059669')
      .text(STATUS_LABEL[room.status] ?? room.status, colStatus, startY, {
        width: colStatusW,
        lineBreak: false,
      });
    doc.y = startY + 14;
    if (room.comment) {
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(`Commentaire : ${room.comment}`, MARGIN, doc.y, { width: CONTENT_W });
      doc.moveDown(0.2);
    }
    doc.x = MARGIN;
    doc.moveDown(0.55);
  }

  // ── Inventaire rendu (sortie uniquement) ──
  if (!isCheckin) {
    sectionTitle(doc, 'Inventaire rendu');
    const inv = parseInventory(inspection.inventoryCheck);
    infoLine(doc, 'Clés', String(inv.keys));
    infoLine(doc, 'Télécommandes', String(inv.remotes));
    infoLine(doc, 'Serviettes', String(inv.towels));
  }

  // ── v4.80 — Inventaire du minibar déclaré (sortie) ──
  const minibarRows = parseMinibarRows(inspection.minibarData);
  if (minibarRows.length > 0) {
    sectionTitle(doc, 'Minibar — consommations déclarées');
    for (const row of minibarRows) {
      ensureSpace(doc, 24);
      infoLine(doc, `${row.consumed} ×`, row.name);
    }
    doc.moveDown(0.4);
  }

  // ── Dégâts signalés ──
  if (inspection.damages) {
    sectionTitle(doc, 'Dégâts et anomalies signalés');
    doc.font('Helvetica').fontSize(9.5).fillColor('#B91C1C').text(inspection.damages, MARGIN, doc.y, {
      width: CONTENT_W,
    });
    doc.moveDown(0.5);
  }

  // ── Commentaires libres ──
  if (inspection.issues) {
    sectionTitle(doc, 'Commentaires de l’invité');
    doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(inspection.issues, MARGIN, doc.y, {
      width: CONTENT_W,
    });
    doc.moveDown(0.5);
  }

  // ── Photos (2 colonnes, légende pièce) ──
  const photos = labeledPhotos(parseRooms(inspection.roomsData), inspection.damagePhotos);
  if (photos.length > 0) {
    sectionTitle(doc, `Photos jointes (${photos.length})`);
    const cellW = (CONTENT_W - 14) / 2;
    const cellH = 150;
    let col = 0;
    for (const photo of photos) {
      ensureSpace(doc, cellH + 24);
      const x = MARGIN + col * (cellW + 14);
      const y = doc.y;
      try {
        doc.image(photo.buffer, x, y, { fit: [cellW, cellH - 16], align: 'center', valign: 'center' });
      } catch {
        // dataURL invalide — cadre vide, le PDF ne plante jamais.
        doc.roundedRect(x, y, cellW, cellH - 16, 4).lineWidth(0.75).strokeColor(LINE).stroke();
      }
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(photo.label, x, y + cellH - 10, { width: cellW, align: 'center', lineBreak: false });
      if (col === 1) {
        doc.y = y + cellH + 8;
        doc.x = MARGIN;
        col = 0;
      } else {
        col = 1;
      }
    }
    if (col === 1) doc.y += cellH + 8;
  }

  // ── Signature ──
  sectionTitle(doc, 'Signature de l’invité');
  ensureSpace(doc, 110);
  const sigBoxTop = doc.y;
  doc.roundedRect(MARGIN, sigBoxTop, 220, 78, 6).lineWidth(0.75).strokeColor(LINE).stroke();
  const sigBuf = decodeDataUrl(inspection.guestSignature);
  if (sigBuf) {
    try {
      doc.image(sigBuf, MARGIN + 8, sigBoxTop + 6, { fit: [204, 58] });
    } catch {
      /* signature illisible — cadre conservé */
    }
  } else {
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text('Signature non transmise', MARGIN + 12, sigBoxTop + 32, { lineBreak: false });
  }
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(INK)
    .text(`${inspection.guestName} — certifie sur l'honneur l'exactitude des informations déclarées.`, MARGIN + 232, sigBoxTop + 8, {
      width: CONTENT_W - 232,
    });
  // v4.82 — fix chevauchement : les mentions légales commencent SOUS le
  // cadre signature (78 px), jamais par-dessus.
  doc.y = Math.max(doc.y, sigBoxTop + 86);

  // ── Mentions légales (fin de corps, dernière page) ──
  doc.moveDown(1);
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(
      isCheckin
        ? "Ce document est édité par la plateforme RoomScan. Il fait foi comme état des lieux d'entrée contradictoire entre l'invité et l'hôte. " +
            'Il est horodaté, associé à l\'adresse IP de signature et consultable en ligne à vie via son jeton public.'
        : 'Ce document est édité par la plateforme RoomScan. Il fait foi comme état des lieux de sortie contradictoire entre l\'invité et l\'hôte. ' +
            'Il est horodaté, associé à l\'adresse IP de signature et consultable en ligne à vie via son jeton public.',
      MARGIN,
      doc.y,
      { width: CONTENT_W },
    );

  drawFooters(doc, {
    token: inspection.publicToken,
    id: inspection.id,
    ip: inspection.ipAddress,
    generatedAt: new Date(),
  });

  doc.end();
  return finished;
}

// ---------- Document 2 : PREUVE D'INVENTAIRE D'ARRIVÉE ----------

export async function renderCheckInProofPdf(check: CheckInProofPdfData): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, info: { Title: "Preuve d'inventaire d'arrivée" } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // v4.82 — logo du bien white-label ; v5.1 — repli : logo RoomScan officiel.
  const logo =
    (await loadLogoBuffer(check.property.branding?.logoUrl)) ?? (await loadRoomScanLogo());
  drawHeader(doc, "Preuve d'inventaire d'arrivée", check.property, logo);

  infoLine(doc, 'Invité', check.guestName?.trim() ? check.guestName : 'Invité (non identifié)');
  if (check.booking) {
    infoLine(
      doc,
      'Séjour',
      `du ${frDate(check.booking.checkIn)} au ${frDate(check.booking.checkOut)}`,
    );
  }
  infoLine(doc, 'Validé le', frDateTime(check.checkedAt));

  sectionTitle(doc, 'Objet de la preuve');
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(INK)
    .text(
      "À son arrivée, l'invité a validé l'inventaire du logement (dont l'état du minibar photographié par l'hôte) via le système de confiance du Hub. " +
        'Aucun défaut ni manquant n\'a été constaté à l\'entrée : l\'inventaire est réputé complet et le logement rendu en bon état de départ sur ces mêmes points.',
      MARGIN,
      doc.y,
      { width: CONTENT_W },
    );

  doc.moveDown(1);
  const boxTop = doc.y;
  doc.roundedRect(MARGIN, boxTop, CONTENT_W, 34, 6).fill('#ECFDF5');
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#047857')
    .text('Inventaire d\'arrivée validé', MARGIN + 12, boxTop + 11, { lineBreak: false });

  doc.moveDown(1.4);
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(
      'Cette preuve électronique est éditée par la plateforme RoomScan, horodatée et consultable en ligne à vie via son jeton public. ' +
        'Elle protège équitablement l\'hôte et l\'invité en cas de litige sur l\'inventaire ou les consommations.',
      MARGIN,
      doc.y,
      { width: CONTENT_W },
    );

  drawFooters(doc, {
    token: check.publicToken,
    id: check.id,
    ip: null,
    generatedAt: new Date(),
  });

  doc.end();
  return finished;
}
