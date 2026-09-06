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
 * FIX-12 — recharge le module généré de @prisma/client : le serveur dev
 * est un process long-lived qui garde l'ancien module généré dans le
 * cache require de Node, même après `prisma db push` + generate (le
 * `import` statique comme un `new PrismaClient()` retombent sur l'ancien).
 * On purge les entrées de cache liées à Prisma puis on re-require →
 * constructeur à jour (nouveaux modèles disponibles SANS redémarrer le
 * serveur dev). Fallback silencieux sur le module importé statiquement.
 */
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
    : new (loadFreshPrismaClientCtor())({
        // Only log queries in development
        ...(process.env.NODE_ENV !== 'production' ? { log: ['query'] as const } : {}),
      })

// Cache in globalThis for hot-reload in dev AND for single-process in
// production standalone. Affectation inconditionnelle : un client périmé
// (schéma régénéré) est remplacé par l'instance fraîche.
globalForPrisma.prisma = db
