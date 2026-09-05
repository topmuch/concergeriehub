import { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

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
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
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
