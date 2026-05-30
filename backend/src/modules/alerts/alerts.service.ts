import { prisma } from '../../db/client.js'
import type { CreateAlertInput, ResolveAlertInput } from './alert.schemas.js'

const DEFAULT_USER = 'default'

export async function listAlerts(filters?: { status?: string; patternId?: string; limit?: number }) {
  return prisma.alert.findMany({
    where: {
      userId: DEFAULT_USER,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.patternId ? { patternId: filters.patternId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: filters?.limit || 50,
  })
}

export async function getAlert(id: string) {
  return prisma.alert.findFirst({ where: { id, userId: DEFAULT_USER } })
}

export async function createAlert(input: CreateAlertInput) {
  return prisma.alert.create({
    data: { ...input, userId: DEFAULT_USER },
  })
}

export async function resolveAlert(alertId: string, input: ResolveAlertInput) {
  const [, resolution] = await prisma.$transaction([
    prisma.alert.update({ where: { id: alertId }, data: { status: input.resolutionStatus } }),
    prisma.alertResolution.create({
      data: {
        alertId,
        resolutionStatus: input.resolutionStatus,
        resolutionType: input.resolutionType,
        windowMinutes: input.windowMinutes,
        evidenceJson: input.evidenceJson,
      },
    }),
  ])
  return resolution
}
