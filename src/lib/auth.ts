import { type NextAuthOptions, type Session } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { type JWT } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { isIpBlacklisted, ipFromAuthReq } from '@/lib/security';

// =============================================================
// Auth via Prisma — même base que le reste de l'app (db/custom.db).
// (Ancienne version : CLI sqlite3 + fichier séparé qrdomotik.db,
//  inopérant en sandbox et désynchronisée du schéma Prisma.)
// =============================================================

// NextAuth v4 (App Router) passe à authorize un objet dont `headers`
// est tantôt une instance Headers, tantôt un record plat — on gère
// les deux formes. Jamais throw : fail-open vers 'local'.
function clientIpFromReq(req: unknown): string {
  try {
    const h = (req as { headers?: unknown } | undefined)?.headers;
    if (!h) return 'local';
    if (typeof (h as Headers).get === 'function') {
      return (
        (h as Headers).get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
      );
    }
    const rec = h as Record<string, string | string[] | undefined>;
    const raw = Array.isArray(rec['x-forwarded-for'])
      ? rec['x-forwarded-for'][0]
      : rec['x-forwarded-for'];
    return raw?.split(',')[0]?.trim() || 'local';
  } catch {
    return 'local';
  }
}

// =============================================================
// Révocation de session (FIX-2 — audit AUD-FULL, Module 6) :
// le JWT a une durée de vie de 30 jours — sans revalidation, un
// compte désactivé (isActive=false) ou supprimé par le superadmin
// conserverait l'accès complet jusqu'à expiration. Le callback
// jwt() revalide donc { isActive, role } en base à CHAQUE
// invocation (cache mémoire 15 s pour ne pas marteler SQLite).
// Token vidé ⇒ session callback renvoie {} ⇒ getServerSession()
// retourne null ⇒ les layouts redirigent (logout forcé, mécanisme
// canonique NextAuth v4 : session body vide = non authentifié).
// =============================================================

/** Cache mémoire : userId → état du compte. Invalidé par TTL seul. */
type UserStatus = { isActive: boolean; role: string; expires: number };
const userStatusCache = new Map<string, UserStatus>();
const USER_STATUS_TTL_MS = 15_000;

/** État courant du compte (cache 15 s), ou null si utilisateur inconnu. */
async function fetchUserStatus(userId: string): Promise<UserStatus | null> {
  const cached = userStatusCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isActive: true, role: true },
  });
  if (!user) return null;

  const status: UserStatus = {
    isActive: user.isActive,
    role: user.role,
    expires: Date.now() + USER_STATUS_TTL_MS,
  };
  userStatusCache.set(userId, status);
  return status;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        // Blacklist IP (Module 7 Sécurité) : IP bannie → refus générique.
        if (await isIpBlacklisted(ipFromAuthReq(req) ?? clientIpFromReq(req))) {
          console.warn('[auth] IP blacklistée', clientIpFromReq(req));
          return null;
        }

        // Anti brute-force : max 10 tentatives/minute/IP (fail-open,
        // cf. lib/rate-limit.ts — même garde-fou que /api/auth/register).
        if (!(await rateLimit(`login:${clientIpFromReq(req)}`, 10))) {
          console.warn('[auth] Rate limit atteint pour', clientIpFromReq(req));
          return null; // refus générique (comme un mauvais mot de passe)
        }

        try {
          const user = await db.user.findUnique({
            where: { email: credentials.email.trim().toLowerCase() },
            select: {
              id: true,
              email: true,
              fullName: true,
              passwordHash: true,
              role: true,
              isActive: true,
            },
          });

          if (!user) {
            console.log('[auth] Login refusé : utilisateur inconnu');
            return null;
          }

          if (user.isActive === false) {
            console.log('[auth] Login refusé : compte désactivé');
            return null;
          }

          if (!user.passwordHash) {
            console.error('[auth] Login refusé : compte sans mot de passe');
            return null;
          }

          const isValid = await compare(credentials.password, user.passwordHash);
          if (!isValid) {
            console.log('[auth] Login refusé : mot de passe invalide');
            return null;
          }

          console.log('[auth] Login OK (rôle:', user.role + ')');
          return {
            id: user.id,
            email: user.email,
            name: user.fullName,
            role: user.role,
          };
        } catch (err) {
          console.error('[auth] authorize() error:', err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Sign-in : comportement inchangé (id + role du compte authentifié).
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
      }

      // Revalidation à chaque invocation tant qu'un token existe.
      if (token.sub) {
        try {
          const status = await fetchUserStatus(token.sub);
          // Compte supprimé ou désactivé : révocation stricte — on vide le
          // token (sub/id/role retirés) pour forcer le logout côté serveur.
          if (!status || status.isActive === false) {
            return {} as JWT;
          }
          // Changement de rôle du superadmin : prend effet sans re-login.
          token.role = status.role;
        } catch {
          // Fail-open assumé sur erreur d'infra (DB indisponible) : on garde
          // le token tel quel pour ne pas déloguer toute la base utilisateur.
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Token vidé par jwt() (compte révoqué) : session vide ⇒
      // getServerSession() retourne null ⇒ les layouts redirigent.
      if (!token.sub) {
        return {} as Session;
      }
      if (session.user) {
        (session.user as { id: string }).id = token.id as string;
        (session.user as { role: string }).role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
};
