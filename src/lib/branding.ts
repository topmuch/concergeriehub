// =============================================================
// ÉTAPE 19 (V3) — WHITE-LABEL : helpers de branding par bien.
// Source de vérité de la forme du JSON Property.branding :
//   { logoUrl, primaryColor, companyName, welcomeMessage }
// Validé côté API (PATCH/upload) ET consommé par l'app invitée.
// N'utilise AUCUN accès DB → importable partout (client inclus).
// =============================================================

/** Couleur de repli = identité Conciergerie Hub (émeraude manifest). */
export const DEFAULT_PRIMARY_COLOR = '#059669';

export interface PropertyBranding {
  /** Chemin public du logo (ex: /uploads/branding/xxx.png) — null = aucun. */
  logoUrl: string | null;
  /** Couleur d'accent principale (hex #RRGGBB). */
  primaryColor: string;
  /** Nom commercial affiché à la place de "Conciergerie Hub". */
  companyName: string | null;
  /** Message d'accueil personnalisé (affiché sur l'onglet Accueil). */
  welcomeMessage: string | null;
}

/** Parse tolérant du JSON Prisma → objet validé (jamais de throw). */
export function parseBranding(raw: unknown): PropertyBranding {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    logoUrl:
      typeof obj.logoUrl === 'string' && obj.logoUrl.startsWith('/uploads/branding/')
        ? obj.logoUrl
        : null,
    primaryColor:
      isValidHexColor(obj.primaryColor) ? (obj.primaryColor as string) : DEFAULT_PRIMARY_COLOR,
    companyName:
      typeof obj.companyName === 'string' && obj.companyName.trim()
        ? obj.companyName.trim().slice(0, 60)
        : null,
    welcomeMessage:
      typeof obj.welcomeMessage === 'string' && obj.welcomeMessage.trim()
        ? obj.welcomeMessage.trim().slice(0, 280)
        : null,
  };
}

/** Hex strict #RRGGBB (insensible à la casse). */
export function isValidHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

/** Normalise un domaine saisi : minuscule, sans protocole/chemin/port. */
export function normalizeCustomDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

/**
 * Domaine personnalisé valide : 1-63 chars/label, lettres/chiffres/
 * tirets, au moins un point, pas d'underscore, pas localhost/IP.
 */
export function isValidCustomDomain(v: string): boolean {
  if (!v || v.length > 253) return false;
  if (v === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return false;
  if (v.includes('_') || v.includes(' ') || !v.includes('.')) return false;
  return v.split('.').every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}
