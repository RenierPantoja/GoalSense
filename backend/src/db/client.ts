import { PrismaClient } from '@prisma/client'

/**
 * Prisma client singleton.
 * Construction is lazy w.r.t. the DB connection — PrismaClient only connects
 * on the first query, so this is safe to import even in firebase mode
 * (where no Prisma queries should run).
 */
export const prisma = new PrismaClient()
