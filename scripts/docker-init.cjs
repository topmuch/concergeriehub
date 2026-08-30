// =============================================================
// ORDOMOTIK - Docker Init: Schema + Seed (single script)
// Runs on every container start.
// Uses PrismaClient $executeRawUnsafe with schema.sql
// (schema.sql has IF NOT EXISTS on all statements → idempotent)
// =============================================================

const fs = require('fs');
const path = require('path');
const { hash } = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── 1. Init schema from schema.sql ──
async function initSchema() {
  const sqlPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('[init] FATAL: schema.sql not found at', sqlPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf-8');
  // Split on semicolons, strip comment lines from each statement
  const raw = sql.split(';');
  const statements = [];
  for (const chunk of raw) {
    // Remove lines that are only comments
    const cleaned = chunk
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .trim();
    if (
      cleaned.length > 0 &&
      cleaned.toUpperCase() !== 'BEGIN TRANSACTION' &&
      cleaned.toUpperCase() !== 'COMMIT'
    ) {
      statements.push(cleaned);
    }
  }

  console.log(`[init] Executing ${statements.length} SQL statements...`);
  
  let errors = 0;
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await prisma.$executeRawUnsafe(stmt + ';');
    } catch (err) {
      errors++;
      // Log first 5 errors only (avoid spam on re-runs)
      if (errors <= 5) {
        console.error(`[init] SQL error #${i + 1}: ${err.message?.substring(0, 120)}`);
      }
    }
  }
  console.log(`[init] Schema done. (${statements.length} statements, ${errors} errors)`);
}

// ── 2. Seed users ──
async function seedUsers() {
  try {
    // Super Admin
    const adminHash = await hash('QrDomotik2024!', 12);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@qrdomotik.roomscan.pro' },
      update: { passwordHash: adminHash, fullName: 'Administrateur ORDOMOTIK', role: 'superadmin' },
      create: {
        email: 'admin@qrdomotik.roomscan.pro',
        fullName: 'Administrateur ORDOMOTIK',
        passwordHash: adminHash,
        role: 'superadmin',
      },
    });
    console.log('[init] Super Admin OK:', admin.email);

    const adminHomeCount = await prisma.home.count({ where: { ownerId: admin.id } });
    if (adminHomeCount === 0) {
      await prisma.home.create({ data: { name: 'ORDOMOTIK HQ', ownerId: admin.id, address: 'Siege Social' } });
      console.log('[init] Home ORDOMOTIK HQ created');
    }

    // Demo Client
    const demoHash = await hash('demo123', 12);
    const demo = await prisma.user.upsert({
      where: { email: 'demo@qrdomotik.roomscan.pro' },
      update: { passwordHash: demoHash, fullName: 'Utilisateur Demo', role: 'user' },
      create: {
        email: 'demo@qrdomotik.roomscan.pro',
        fullName: 'Utilisateur Demo',
        passwordHash: demoHash,
        role: 'user',
      },
    });
    console.log('[init] Demo Client OK:', demo.email);

    const demoHomeCount = await prisma.home.count({ where: { ownerId: demo.id } });
    if (demoHomeCount === 0) {
      await prisma.home.create({ data: { name: 'Ma Maison Demo', ownerId: demo.id, address: '' } });
      console.log('[init] Home Ma Maison Demo created');
    }
  } catch (err) {
    console.error('[init] Seed error:', err.message);
  }
}

// ── Main ──
async function main() {
  console.log('[init] Starting database initialization...');
  try {
    await initSchema();
    await seedUsers();
    console.log('[init] COMPLETE.');
  } catch (err) {
    console.error('[init] FATAL:', err.message);
    console.error(err.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();
