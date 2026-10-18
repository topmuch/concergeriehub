import { PrismaClient } from '@prisma/client'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, sep } from 'node:path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * FIX-12 — le client en cache (globalThis, HMR) peut dater d'un schéma
 * antérieur : après `prisma db push` (+ generate) pendant que le serveur
 * tourne, l'instance ne connaît PAS les nouveaux modèles
 * (db.nouveauModèle === undefined → TypeError au premier appel).
 * On compare donc les délégués du client aux `model` du schema.prisma
 * sur disque. Coût nul en production (instance unique et fraîche ; le
 * schéma n'est pas lu s'il est absent du bundle standalone).
 */
function cachedClientIsStale(client: PrismaClient): boolean {
  try {
    const schemaPath = join(process.cwd(), 'prisma', 'schema.prisma')
    if (!existsSync(schemaPath)) return false
    const schema = readFileSync(schemaPath, 'utf8')
    const models = [...schema.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1])
    const bag = client as unknown as Record<string, unknown>
    // Conventions Prisma : model PascalCase → délégué lowerCamelCase.
    return models.some((name) => {
      const delegate = name.charAt(0).toLowerCase() + name.slice(1)
      return typeof bag[delegate] !== 'object' || bag[delegate] === null
    })
  } catch {
    return false
  }
}

/**
 * FIX-12 — rechargement à chaud RÉSERVÉ AU DÉV (v4.97) : le serveur dev est
 * un process long-lived qui garde l'ancien module généré dans le cache
 * require de Node après `prisma db push` + generate. En production
 * (standalone boot neuf, NODE_ENV=production forcé par server.js) le
 * rechargement n'a AUCUNE valeur — et sous webpack, createRequire est
 * réécrit par le bundler (warning « failed parsing argument » à la
 * compilation + re-require qui échoue dans le worker de collecte de pages).
 * On retourne donc le constructeur statique en prod : boot propre et
 * silencieux, même garanties.
 */
function freshPrismaCtor(): typeof PrismaClient {
  if (process.env.NODE_ENV === 'production') return PrismaClient
  return loadFreshPrismaClientCtor()
}

function loadFreshPrismaClientCtor(): typeof PrismaClient {
  try {
    const req = createRequire(join(process.cwd(), 'package.json'))
    for (const key of Object.keys(req.cache)) {
      if (key.includes(`${sep}@prisma${sep}client`) || key.includes(`${sep}.prisma${sep}`)) {
        delete req.cache[key]
      }
    }
    const fresh = req('@prisma/client') as { PrismaClient: typeof PrismaClient }
    return fresh.PrismaClient
  } catch (error) {
    console.error('[db] rechargement du client Prisma impossible, module importé utilisé :', error)
    return PrismaClient
  }
}

const cached = globalForPrisma.prisma

export const db =
  cached && !cachedClientIsStale(cached)
    ? cached
    : new (freshPrismaCtor())({
        // Only log queries in development
        ...(process.env.NODE_ENV !== 'production' ? { log: ['query'] as const } : {}),
      })

// Cache in globalThis for hot-reload in dev AND for single-process in
// production standalone. Affectation inconditionnelle : un client périmé
// (schéma régénéré) est remplacé par l'instance fraîche.
globalForPrisma.prisma = db

// =============================================================
// v4.50 « AUTO-MIGRATION AU BOOT » — ensureSchema()
//
// Historique : les déploiements Coolify n'avaient AUCUN mécanisme de
// migration visible (pas d'instrumentation, pas de `prisma db push`
// au démarrage — les tables récentes s'étaient retrouvées en prod par
// le volume SQLite persistant + build précédent). Résultat : toute
// NOUVELLE colonne/table casse la prod au premier appel
// (« Unknown field », « no such column »).
//
// Solution : DDL idempotent appliqué UNE FOIS par processus, au
// premier import de db. Chaque énoncé est sûr :
//   • CREATE TABLE / INDEX IF NOT EXISTS → no-op si déjà présent ;
//   • ALTER TABLE ADD COLUMN → exécuté SEULEMENT si la colonne manque
//     (vérification pragma_table_info).
// Jamais de throw bloquant : en cas d'échec, on trace et on continue
// (le comportement historique reprend).
// =============================================================

type ColumnDef = { table: string; column: string; ddl: string }

const BOOT_TABLES_DDL: string[] = [
  // v4.50 — sessions d'accès hub (verrouillage par code)
  `CREATE TABLE IF NOT EXISTS "hub_access_sessions" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "property_id" TEXT NOT NULL,
      "booking_id" TEXT,
      "token_hash" TEXT NOT NULL,
      "hard_expires_at" DATETIME NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "last_used_at" DATETIME,
      CONSTRAINT "hub_access_sessions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "hub_access_sessions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  // v4.50 — commandes minibar persistées
  `CREATE TABLE IF NOT EXISTS "minibar_orders" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "property_id" TEXT NOT NULL,
      "booking_id" TEXT,
      "guest_name" TEXT,
      "items_json" TEXT NOT NULL DEFAULT '[]',
      "total_eur" REAL NOT NULL DEFAULT 0,
      "payment" TEXT NOT NULL DEFAULT 'onsite',
      "status" TEXT NOT NULL DEFAULT 'OPEN',
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "minibar_orders_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "minibar_orders_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  // v4.50 — validations d'inventaire d'arrivée
  `CREATE TABLE IF NOT EXISTS "minibar_checks" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "property_id" TEXT NOT NULL,
      "booking_id" TEXT,
      "guest_name" TEXT,
      "checked_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "minibar_checks_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "minibar_checks_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  // v4.50 — demandes « Recharger le frigo »
  `CREATE TABLE IF NOT EXISTS "minibar_restock_requests" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "property_id" TEXT NOT NULL,
      "booking_id" TEXT,
      "guest_name" TEXT,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "handled_at" DATETIME,
      CONSTRAINT "minibar_restock_requests_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "minibar_restock_requests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  // v4.52 — MIDDLE-STAY CARE (réassort / ménage en cours de séjour)
  `CREATE TABLE IF NOT EXISTS "middle_stay_requests" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "property_id" TEXT NOT NULL,
      "booking_id" TEXT,
      "guest_name" TEXT NOT NULL,
      "guest_email" TEXT,
      "request_type" TEXT NOT NULL,
      "details" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "assigned_to" TEXT,
      "price" REAL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completed_at" DATETIME,
      CONSTRAINT "middle_stay_requests_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "middle_stay_requests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  // v4.52 — LIVRE D'OR VIVANT (mur de souvenirs modéré)
  `CREATE TABLE IF NOT EXISTS "guest_memories" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "property_id" TEXT NOT NULL,
      "booking_id" TEXT,
      "guest_name" TEXT NOT NULL,
      "guest_email" TEXT,
      "guest_country" TEXT,
      "rating" INTEGER NOT NULL,
      "message" TEXT,
      "photo_urls_json" TEXT NOT NULL DEFAULT '[]',
      "audio_url" TEXT,
      "is_public" BOOLEAN NOT NULL DEFAULT true,
      "is_approved" BOOLEAN NOT NULL DEFAULT false,
      "is_pinned" BOOLEAN NOT NULL DEFAULT false,
      "host_reply" TEXT,
      "host_reply_at" DATETIME,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "guest_memories_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "guest_memories_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  // v4.54 — PRESSING & BLANCHISSERIE EXPRESS (commandes invité)
  `CREATE TABLE IF NOT EXISTS "laundry_orders" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "property_id" TEXT NOT NULL,
      "booking_id" TEXT,
      "guest_name" TEXT,
      "guest_email" TEXT,
      "service_type" TEXT NOT NULL,
      "pieces" INTEGER NOT NULL DEFAULT 1,
      "pickup_slot" TEXT NOT NULL DEFAULT 'morning',
      "notes" TEXT,
      "amount_eur" REAL NOT NULL DEFAULT 0,
      "payment" TEXT NOT NULL DEFAULT 'host',
      "status" TEXT NOT NULL DEFAULT 'REQUESTED',
      "stripe_session_id" TEXT,
      "paid_at" DATETIME,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "laundry_orders_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "laundry_orders_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  // v4.54 — ALERTES STOCK (signalements équipe de ménage)
  `CREATE TABLE IF NOT EXISTS "inventory_alerts" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "property_id" TEXT NOT NULL,
      "booking_id" TEXT,
      "item" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "reported_by" TEXT,
      "note" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "resolved_at" DATETIME,
      CONSTRAINT "inventory_alerts_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "inventory_alerts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  // v4.56 — CONFIG PLATEFORME (clé/valeur, éditable Console Superadmin)
  // ex : email.from, email.provider — priorité DB > env > défaut.
  `CREATE TABLE IF NOT EXISTS "system_settings" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "value" TEXT NOT NULL,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // v5.0 — état des lieux de sortie (inspection signée + preuve publique)
  `CREATE TABLE IF NOT EXISTS "check_out_inspections" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "property_id" TEXT NOT NULL,
      "booking_id" TEXT,
      "guest_name" TEXT NOT NULL,
      "guest_email" TEXT,
      "entrance_status" TEXT NOT NULL DEFAULT 'good',
      "kitchen_status" TEXT NOT NULL DEFAULT 'good',
      "living_room_status" TEXT NOT NULL DEFAULT 'good',
      "bedrooms_status" TEXT NOT NULL DEFAULT 'good',
      "bathroom_status" TEXT NOT NULL DEFAULT 'good',
      "issues" TEXT,
      "damages" TEXT,
      "damage_photos" TEXT,
      "rooms_data" TEXT,
      "inventory_check" TEXT,
      "self_assessment" INTEGER NOT NULL DEFAULT 5,
      "guest_signature" TEXT,
      "signed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "ip_address" TEXT,
      "public_token" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "host_notes" TEXT,
      "resolved_at" DATETIME,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "check_out_inspections_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "check_out_inspections_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
]

const BOOT_INDEXES_DDL: string[] = [
  `CREATE INDEX IF NOT EXISTS "hub_access_sessions_property_id_idx" ON "hub_access_sessions"("property_id")`,
  `CREATE INDEX IF NOT EXISTS "hub_access_sessions_booking_id_idx" ON "hub_access_sessions"("booking_id")`,
  `CREATE INDEX IF NOT EXISTS "minibar_orders_property_id_created_at_idx" ON "minibar_orders"("property_id", "created_at")`,
  `CREATE INDEX IF NOT EXISTS "minibar_orders_booking_id_idx" ON "minibar_orders"("booking_id")`,
  `CREATE INDEX IF NOT EXISTS "minibar_checks_property_id_checked_at_idx" ON "minibar_checks"("property_id", "checked_at")`,
  `CREATE INDEX IF NOT EXISTS "minibar_checks_booking_id_idx" ON "minibar_checks"("booking_id")`,
  `CREATE INDEX IF NOT EXISTS "minibar_restock_requests_property_id_status_idx" ON "minibar_restock_requests"("property_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "minibar_restock_requests_booking_id_idx" ON "minibar_restock_requests"("booking_id")`,
  `CREATE INDEX IF NOT EXISTS "bookings_property_id_access_code_idx" ON "bookings"("property_id", "access_code")`,
  // v4.52 — middle-stay + livre d'or
  `CREATE INDEX IF NOT EXISTS "middle_stay_requests_property_id_status_idx" ON "middle_stay_requests"("property_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "middle_stay_requests_booking_id_idx" ON "middle_stay_requests"("booking_id")`,
  `CREATE INDEX IF NOT EXISTS "guest_memories_property_id_approved_public_idx" ON "guest_memories"("property_id", "is_approved", "is_public")`,
  `CREATE INDEX IF NOT EXISTS "guest_memories_property_id_pinned_idx" ON "guest_memories"("property_id", "is_pinned")`,
  `CREATE INDEX IF NOT EXISTS "guest_memories_booking_id_idx" ON "guest_memories"("booking_id")`,
  // v4.54 — pressing + alertes stock
  `CREATE INDEX IF NOT EXISTS "laundry_orders_property_id_status_idx" ON "laundry_orders"("property_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "laundry_orders_property_id_created_at_idx" ON "laundry_orders"("property_id", "created_at")`,
  `CREATE INDEX IF NOT EXISTS "laundry_orders_booking_id_idx" ON "laundry_orders"("booking_id")`,
  `CREATE INDEX IF NOT EXISTS "inventory_alerts_property_id_status_idx" ON "inventory_alerts"("property_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "inventory_alerts_property_id_created_at_idx" ON "inventory_alerts"("property_id", "created_at")`,
  // v5.0 — état des lieux de sortie : index + tokens publics uniques
  `CREATE INDEX IF NOT EXISTS "check_out_inspections_property_id_created_at_idx" ON "check_out_inspections"("property_id", "created_at")`,
  `CREATE INDEX IF NOT EXISTS "check_out_inspections_booking_id_idx" ON "check_out_inspections"("booking_id")`,
  `CREATE INDEX IF NOT EXISTS "check_out_inspections_status_idx" ON "check_out_inspections"("status")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "check_out_inspections_public_token_key" ON "check_out_inspections"("public_token")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "minibar_checks_public_token_key" ON "minibar_checks"("public_token")`,
]
const BOOT_COLUMNS_DDL: ColumnDef[] = [
  { table: 'bookings', column: 'access_code', ddl: `ALTER TABLE "bookings" ADD COLUMN "access_code" TEXT` },
  { table: 'bookings', column: 'late_checkout_until', ddl: `ALTER TABLE "bookings" ADD COLUMN "late_checkout_until" DATETIME` },
  { table: 'cleaning_reports', column: 'start_lat', ddl: `ALTER TABLE "cleaning_reports" ADD COLUMN "start_lat" REAL` },
  { table: 'cleaning_reports', column: 'start_lng', ddl: `ALTER TABLE "cleaning_reports" ADD COLUMN "start_lng" REAL` },
  { table: 'cleaning_reports', column: 'end_lat', ddl: `ALTER TABLE "cleaning_reports" ADD COLUMN "end_lat" REAL` },
  { table: 'cleaning_reports', column: 'end_lng', ddl: `ALTER TABLE "cleaning_reports" ADD COLUMN "end_lng" REAL` },
  // v4.54 « ALERTE VOCALE & CHECKLIST DE DÉPART » — checklist confirmée
  { table: 'checkout_final_events', column: 'checklist_json', ddl: `ALTER TABLE "checkout_final_events" ADD COLUMN "checklist_json" TEXT` },
  // v5.0 « ÉTAT DES LIEUX D'ENTRÉE » — preuve publique du minibar-check.
  { table: 'minibar_checks', column: 'public_token', ddl: `ALTER TABLE "minibar_checks" ADD COLUMN "public_token" TEXT` },
]

let ensureSchemaDone = false

/** Applique une seule fois le DDL de v4.50 (jamais bloquant). */
async function ensureSchema(): Promise<void> {
  if (ensureSchemaDone) return
  ensureSchemaDone = true
  try {
    // 1. Colonnes manquantes (via pragma_table_info — SQLite idempotent).
    for (const def of BOOT_COLUMNS_DDL) {
      try {
        const cols = await db.$queryRawUnsafe<{ name: string }[]>(
          `SELECT name FROM pragma_table_info('${def.table}')`,
        )
        if (Array.isArray(cols) && !cols.some((c) => c.name === def.column)) {
          await db.$executeRawUnsafe(def.ddl)
          console.log(`[db] ensureSchema — colonne ajoutée : ${def.table}.${def.column}`)
        }
      } catch (e) {
        console.error(`[db] ensureSchema — ${def.table}.${def.column} :`, e)
      }
    }
    // 2. Tables v4.50 (IF NOT EXISTS).
    for (const ddl of BOOT_TABLES_DDL) {
      try {
        await db.$executeRawUnsafe(ddl)
      } catch (e) {
        console.error('[db] ensureSchema — table :', e)
      }
    }
    // 3. Index (IF NOT EXISTS).
    for (const ddl of BOOT_INDEXES_DDL) {
      try {
        await db.$executeRawUnsafe(ddl)
      } catch {
        // Index : échec silencieux (perf, pas correction).
      }
    }
  } catch (e) {
    console.error('[db] ensureSchema — échec global (non bloquant) :', e)
  }
}

// Boot paresseux : le DDL part en arrière-plan, le serveur démarre
// immédiatement (aucun route-block au cold start).
void ensureSchema()
