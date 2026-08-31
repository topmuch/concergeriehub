// =============================================================
// Guard Superadmin — Conciergerie Hub (ÉTAPE 9)
// À utiliser UNIQUEMENT côté serveur (pages + API routes /admin/*).
// Le rôle est stocké dans le JWT (session callback de lib/auth.ts).
// =============================================================
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export interface SuperadminSession {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Retourne la session si (et seulement si) l'utilisateur connecté
 * porte le rôle 'superadmin'. Sinon null.
 */
export async function requireSuperadmin(): Promise<SuperadminSession | null> {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session?.user || role !== 'superadmin') return null;

  return {
    id: (session.user as { id: string }).id,
    email: session.user.email ?? '',
    name: session.user.name ?? null,
  };
}

/** Réponse JSON 401/403 standardisée pour les routes /api/admin/*. */
export function adminUnauthorized() {
  return Response.json({ error: 'Accès réservé au Superadmin' }, { status: 403 });
}
