import { prisma } from '../../db/client.js'
import type { CreatePatternInput, UpdatePatternInput } from './pattern.schemas.js'

const DEFAULT_USER = 'default'

export async function listPatterns() {
  return prisma.pattern.findMany({
    where: { userId: DEFAULT_USER },
    orderBy: { updatedAt: 'desc' },
  })
}

export async function getPattern(id: string) {
  return prisma.pattern.findFirst({ where: { id, userId: DEFAULT_USER } })
}

export async function createPattern(input: CreatePatternInput) {
  return prisma.pattern.create({
    data: { ...input, userId: DEFAULT_USER },
  })
}

export async function updatePattern(id: string, input: UpdatePatternInput) {
  return prisma.pattern.updateMany({
    where: { id, userId: DEFAULT_USER },
    data: input,
  })
}

export async function deletePattern(id: string) {
  return prisma.pattern.updateMany({
    where: { id, userId: DEFAULT_USER },
    data: { status: 'archived' },
  })
}
