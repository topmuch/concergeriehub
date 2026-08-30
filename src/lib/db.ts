import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Only log queries in development
    ...(process.env.NODE_ENV !== 'production' ? { log: ['query'] as const } : {}),
  })

// Cache in globalThis for hot-reload in dev AND for single-process in production standalone
if (!globalForPrisma.prisma) globalForPrisma.prisma = db
