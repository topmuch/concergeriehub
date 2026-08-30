import { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, chmodSync, accessSync, readFileSync, unlinkSync, constants } from 'fs';
import { join, dirname } from 'path';

// =============================================================
// NO PRISMA IN AUTH - uses sqlite3 CLI exclusively.
// Reads the working DB path from /tmp/ordomotik-db-path
// (set by instrumentation.ts) with fallback probing.
// =============================================================

let _schemaReady = false;
let _workingDbPath: string | null = null;

/** Test if sqlite3 can write to a directory */
function testSqlite3Write(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    try { chmodSync(dir, 0o777) } catch { /* ignore */ }
    const testDb = join(dir, '.sqlite3-test');
    execSync(`/usr/bin/sqlite3 "${testDb}" "CREATE TABLE t(x); DROP TABLE t;"`, {
      stdio: 'pipe', timeout: 5000,
    });
    try { unlinkSync(testDb) } catch { /* ignore */ }
    return true;
  } catch {
    return false;
  }
}

/** Get the working DB path — read from instrumentation's saved path or probe */
function getWorkingDbPath(): string {
  if (_workingDbPath) return _workingDbPath;

  // 1. Try the path saved by instrumentation.ts
  try {
    const saved = readFileSync('/tmp/ordomotik-db-path', 'utf-8').trim();
    if (saved && existsSync(saved)) {
      _workingDbPath = saved;
      return saved;
    }
  } catch { /* ignore */ }

  // 2. Probe candidate paths
  const envUrl = process.env.DATABASE_URL || '';
  let configured = '';
  if (envUrl.includes('://')) configured = envUrl.replace(/^file:\/\//, '/');
  else if (envUrl.startsWith('file:')) {
    const rest = envUrl.replace(/^file:/, '');
    configured = rest.startsWith('/') ? rest : join(process.cwd(), rest);
  } else if (envUrl.startsWith('/')) configured = envUrl;
  else configured = join(process.cwd(), 'data', 'qrdomotik.db');

  const candidates = [
    dirname(configured),
    '/tmp',
    process.cwd(),
  ];

  for (const dir of candidates) {
    if (testSqlite3Write(dir)) {
      _workingDbPath = join(dir, 'qrdomotik.db');
      return _workingDbPath;
    }
  }

  // Last resort
  _workingDbPath = '/tmp/qrdomotik.db';
  return _workingDbPath;
}

function ensureSchemaAndUsers() {
  if (_schemaReady) return;
  _schemaReady = true;

  try {
    const dbPath = getWorkingDbPath();

    // Find SQL files
    const sqlSearchPaths = [
      '/app/data', '/app/scripts',
      join(process.cwd(), 'data'), join(process.cwd(), 'scripts'),
    ];
    let schemaPath: string | undefined;
    let seedPath: string | undefined;

    for (const dir of sqlSearchPaths) {
      if (!schemaPath && existsSync(join(dir, 'schema.sql'))) schemaPath = join(dir, 'schema.sql');
      if (!seedPath && existsSync(join(dir, 'seed-users.sql'))) seedPath = join(dir, 'seed-users.sql');
    }

    if (schemaPath) {
      const sql = readFileSync(schemaPath, 'utf-8');
      execSync(`/usr/bin/sqlite3 "${dbPath}"`, { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
      console.log('[auth-init] Schema OK');
    } else {
      console.error('[auth-init] WARN: schema.sql not found');
    }

    if (seedPath) {
      const sql = readFileSync(seedPath, 'utf-8');
      execSync(`/usr/bin/sqlite3 "${dbPath}"`, { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
      console.log('[auth-init] Users seeded');
    }
  } catch (err) {
    console.error('[auth-init] FAILED:', String(err).substring(0, 300));
  }
}

/** Query a user by email using sqlite3 CLI */
function queryUserByEmail(email: string): { id: string; email: string; full_name: string; password_hash: string; role: string } | null {
  try {
    const dbPath = getWorkingDbPath();
    if (!existsSync(dbPath)) {
      console.error('[auth] DB file not found:', dbPath);
      return null;
    }
    const sql = `SELECT id, email, full_name, password_hash, role FROM users WHERE email = '${email.replace(/'/g, "''")}' LIMIT 1;`;
    const result = execSync(`/usr/bin/sqlite3 -json "${dbPath}" "${sql}"`, { encoding: 'utf-8', stdio: 'pipe' });
    const rows = JSON.parse(result);
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error('[auth] queryUserByEmail error:', String(err).substring(0, 200));
    return null;
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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          ensureSchemaAndUsers();
          const user = queryUserByEmail(credentials.email);
          if (!user) {
            console.log('[auth] User not found:', credentials.email);
            return null;
          }

          const hash = user.password_hash || '';
          if (!hash) {
            console.error('[auth] User has no password hash:', credentials.email);
            return null;
          }

          const isValid = await compare(credentials.password, hash);
          if (!isValid) {
            console.log('[auth] Invalid password for:', credentials.email);
            return null;
          }

          console.log('[auth] Login OK:', credentials.email, 'role:', user.role);
          return {
            id: user.id,
            email: user.email,
            name: user.full_name,
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
