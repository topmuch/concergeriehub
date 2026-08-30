import { withAuth } from 'next-auth/middleware';

export default withAuth({
  callbacks: {
    authorized({ req, token }) {
      const { pathname } = req.nextUrl;

      // Paths publics - aucun token requis
      const publicPaths = [
        '/',
        '/api/auth',
        '/setup',
        '/hub',
      ];
      if (publicPaths.some((p) => pathname.startsWith(p))) return true;

      // API routes sont protegees par token
      // mais on laisse passer pour eviter les boucles
      if (pathname.startsWith('/api/')) return true;

      return !!token;
    },
  },
  pages: {
    signIn: '/',
  },
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\.ico|logo\.svg).*)',
  ],
};
