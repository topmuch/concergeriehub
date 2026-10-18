// =============================================================
// ROOMSCAN BOUCLIER AUTOMATISÉ — Génération des références
// documentaires (v5.1).
//
//   · Onboarding :  ONB-DAK-2026-001   (une fois par logement)
//   · Appareil  :   REF-PLQ-12126      (code date DD + M + YY)
//   · Session   :  CHK-DAK-18102026-778 (check-in / check-out)
//
// Le code appareil reprend la date de référence du cliché :
// 12/01/2026 → DD=12, M=1, YY=26 → « 12126 » (conforme au modèle
// client). Session : JJMMAAAA + séquence du jour.
// =============================================================

/** Code ville (3 lettres A-Z, fallback « LOG »). */
export function cityCode(city: string): string {
  const clean = (city || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (clean.length >= 3) return clean.slice(0, 3);
  return (clean + 'LOG').slice(0, 3);
}

const pad = (n: number, len: number) => String(n).padStart(len, '0');

/** ONB-{VIL}-{AAAA}-{nnn} */
export function onboardingRef(city: string, sequence: number): string {
  return `ONB-${cityCode(city)}-${new Date().getFullYear()}-${pad(sequence, 3)}`;
}

/** Code date d'un appareil : DD + M (non paddé) + YY → 12126. */
export function deviceDateCode(date: Date): string {
  const dd = pad(date.getDate(), 2);
  const m = String(date.getMonth() + 1); // non paddé (12/01 → « 1 »)
  const yy = pad(date.getFullYear() % 100, 2);
  return `${dd}${m}${yy}`;
}

/** REF-{KIND}-{code} */
export function deviceRefCode(kind: string, date: Date): string {
  const k = (kind || 'CUSTOM').replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'CUSTOM';
  return `REF-${k}-${deviceDateCode(date)}`;
}

/** CHK-{VIL}-{JJMMAAAA}-{nnn} */
export function sessionRef(city: string, date: Date, sequence: number): string {
  const ddmmyyyy = `${pad(date.getDate(), 2)}${pad(date.getMonth() + 1, 2)}${date.getFullYear()}`;
  return `CHK-${cityCode(city)}-${ddmmyyyy}-${pad(sequence, 3)}`;
}

/** Token public alphanumérique de 24 caractères (vidéos). */
export function randomPublicToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  const uuid = crypto.randomUUID().replace(/-/g, '');
  for (let i = 0; i < 24; i++) {
    const c = alphabet[Math.floor(Math.random() * alphabet.length)];
    token += c ?? uuid[i % uuid.length];
  }
  return token;
}

/** Kinds d'appareils permanents (bibliothèque de référence).
 *  Wizard post-paiement : liste COMPLÈTE groupée par catégorie —
 *  l'hôte ne coche QUE ce qu'il possède (règle d'or « zéro N/A » :
 *  les non-cochés n'apparaissent ni dans l'UI ni dans le PDF). */
export const SHIELD_DEVICE_KINDS = [
  { kind: 'PLQ', name: 'PLAQUE DE CUISSON', category: 'CUISSON' },
  { kind: 'MO', name: 'MICRO-ONDES', category: 'CUISSON' },
  { kind: 'FRIGO', name: 'RÉFRIGÉRATEUR', category: 'CUISSON' },
  { kind: 'LV', name: 'LAVE-VAISSELLE', category: 'CUISSON' },
  { kind: 'FOUR', name: 'FOUR', category: 'CUISSON' },
  { kind: 'CLMS', name: 'CLIM SALON', category: 'CLIM / CHAUFFAGE' },
  { kind: 'CLC1', name: 'CLIM CHAMBRE 1', category: 'CLIM / CHAUFFAGE' },
  { kind: 'CLC2', name: 'CLIM CHAMBRE 2', category: 'CLIM / CHAUFFAGE' },
  { kind: 'LAV', name: 'MACHINE À LAVER', category: 'LAVAGE' },
  { kind: 'SEC', name: 'SÈCHE-LINGE', category: 'LAVAGE' },
  { kind: 'TV', name: 'TÉLÉVISION (TV)', category: 'AUTRES' },
  { kind: 'SCH', name: 'SÈCHE-CHEVEUX', category: 'AUTRES' },
  { kind: 'COFFRE', name: 'COFFRE-FORT', category: 'AUTRES' },
  { kind: 'BUIL', name: 'BOUILLOIRE', category: 'AUTRES' },
] as const;

/** Catégories d'équipements dans l'ordre d'affichage du wizard. */
export const SHIELD_DEVICE_CATEGORIES = [
  'CUISSON',
  'CLIM / CHAUFFAGE',
  'LAVAGE',
  'AUTRES',
] as const;

/** Les 6 zones fixes (mêmes angles à chaque check-in / check-out). */
export const SHIELD_ZONES = [
  'SALON',
  'COULOIR',
  'CHAMBRE 1',
  'CHAMBRE 2',
  'CUISINE',
  'TOILETTE / SDB',
] as const;

/** Statuts autorisés pour une photo de zone. */
export const SHIELD_ZONE_STATUSES = ['IMPECCABLE', 'A_NETTOYER', 'DEGRADATION'] as const;
export type ShieldZoneStatus = (typeof SHIELD_ZONE_STATUSES)[number];
