// =============================================================
// Génération des codes d'activation des plaques QR physiques.
//
// v4.81 (AUDIT QA-3) — CSPRNG : Math.random n'est PAS un générateur
// cryptographique (prévisible, seedable). On utilise crypto.getRandomValues
// (WebCrypto — dispo dans les navigateurs ET Node 18+ via globalThis),
// isomorphe client/serveur. Alphabet 32 caractères sans 0/O/1/I.
// =============================================================

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0,O,1,I to avoid confusion

/** Octets aléatoires cryptographiques (isomorphe navigateur + Node). */
function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  // Filet de sécurité (Node sans globalThis.crypto — très ancien) :
  // require ciblé pour rester isomorphe sans casser le bundler client.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto') as { randomBytes: (n: number) => Uint8Array };
  return nodeCrypto.randomBytes(count);
}

export function generateActivationCode(): string {
  let code = 'QR-';
  const bytes = randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += CHARS.charAt(bytes[i] % CHARS.length);
  }
  return code;
}

export function generateUniqueCodes(
  quantity: number,
  existingCodes: string[] = []
): string[] {
  const codes: string[] = [];
  const existing = new Set(existingCodes);
  let attempts = 0;
  const maxAttempts = quantity * 10;

  while (codes.length < quantity && attempts < maxAttempts) {
    const code = generateActivationCode();
    if (!existing.has(code) && !codes.includes(code)) {
      codes.push(code);
      existing.add(code);
    }
    attempts++;
  }

  if (codes.length < quantity) {
    throw new Error(`Could not generate ${quantity} unique codes after ${maxAttempts} attempts`);
  }

  return codes;
}
