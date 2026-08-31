import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

/** Same path resolution as auth.ts and instrumentation.ts */
function getDbPath(): string {
  const envUrl = process.env.DATABASE_URL || ''
  if (envUrl.includes('://')) return envUrl.replace(/^file:\/\//, '/')
  if (envUrl.startsWith('file:')) {
    const rest = envUrl.replace(/^file:/, '')
    if (rest.startsWith('/')) return rest
  }
  return '/app/data/qrdomotik.db'
}

export async function GET() {
  const dbPath = getDbPath()
  const dbExists = existsSync(dbPath)
  const isDev = process.env.NODE_ENV !== 'production'

  let tableCount = 0
  let tables: string[] = []
  let users: { email: string; role: string }[] = []

  try {
    if (dbExists) {
      const result = execSync(
        `sqlite3 -json "${dbPath}" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      )
      tables = JSON.parse(result).map((r: { name: string }) => r.name)
      tableCount = tables.length

      const usersResult = execSync(
        `sqlite3 -json "${dbPath}" "SELECT email, role FROM users ORDER BY email;"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      )
      users = JSON.parse(usersResult)
    }
  } catch (err) {
    console.error('[debug/db]', err)
  }

  // Check SQL files
  const sqlDirs = ['/app/data', '/app/scripts']
  const schemaInfo = sqlDirs.map(d => ({
    path: `${d}/schema.sql`,
    exists: existsSync(`${d}/schema.sql`)
  }))
  const seedInfo = sqlDirs.map(d => ({
    path: `${d}/seed-users.sql`,
    exists: existsSync(`${d}/seed-users.sql`)
  }))

  // Check init log
  let initLog = ''
  const logPath = '/app/data/init.log'
  if (existsSync(logPath)) {
    initLog = readFileSync(logPath, 'utf-8').trim()
  }

  return NextResponse.json({
    environment: isDev ? 'development' : 'production',
    dbPath,
    dbExists,
    tableCount,
    tables: tables.slice(0, 10),
    users,
    schemaFiles: schemaInfo,
    seedFiles: seedInfo,
    initLog,
    cwd: process.cwd(),
  })
}
