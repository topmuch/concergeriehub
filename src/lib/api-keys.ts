// =============================================================
// Module 7 Sécurité — Clés d'API externes (lib/api-keys.ts)
// Format : chq_<40 hex>. La clé en clair n'est JAMAIS stockée —
// uniquement son hash SHA-256 + un préfixe de 8 caractères pour
// l'identification dans la console. Consommation réelle sur
// /api/external/v1/stats (header x-api-key).
// =============================================================
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';

export const API_KEY_PREFIX = 'chq_';

/** Génère une clé, la persiste hachée et renvoie la valeur en clair
 *  (affichée UNE seule fois au Superadmin). */
export async function createApiKey(
  name: string,
  createdBy: string,
): Promise<{ id: string; plaintext: string; prefix: string }> {
  const plaintext = `${API_KEY_PREFIX}${randomBytes(20).toString('hex')}`;
  const prefix = plaintext.slice(0, 8 + API_KEY_PREFIX.length); // ex: chq_1a2b3c4d
  const hashedKey = hashKey(plaintext);

  const row = await db.apiKey.create({
    data: { name: name.slice(0, 60), prefix, hashedKey, createdBy },
  });
  return { id: row.id, plaintext, prefix };
}

export function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/** Vérifie une clé présentée (comparaison en temps constant) et
 *  met à jour lastUsedAt. Renvoie la clé si valide et non révoquée. */
export async function verifyApiKey(plaintext: string | null) {
  if (!plaintext || !plaintext.startsWith(API_KEY_PREFIX)) return null;

  const hashedKey = hashKey(plaintext);
  // Pré-échantillonnage en temps constant pour éviter les shorts-circuits
  const candidate = Buffer.from(hashedKey);
  const rows = await db.apiKey.findMany({
    where: { prefix: plaintext.slice(0, 8 + API_KEY_PREFIX.length) },
    take: 5,
  });

  for (const row of rows) {
    const stored = Buffer.from(row.hashedKey);
    if (stored.length === candidate.length && timingSafeEqual(stored, candidate)) {
      if (row.revokedAt) return null;
      await db.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
      return row;
    }
  }
  return null;
}
