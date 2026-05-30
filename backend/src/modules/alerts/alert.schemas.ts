import { z } from 'zod'

export const createAlertSchema = z.object({
  patternId: z.string().min(1),
  fixtureId: z.string().min(1),
  confidence: z.number().min(0).max(100),
  signalState: z.string().default('ready_to_alert'),
  triggerMinute: z.number().nullable().optional(),
  triggerScoreHome: z.number().default(0),
  triggerScoreAway: z.number().default(0),
  evidenceJson: z.string().default('[]'),
  temporalEvidenceJson: z.string().nullable().optional(),
  duplicateSignature: z.string().nullable().optional(),
})

export const resolveAlertSchema = z.object({
  resolutionStatus: z.enum(['confirmed', 'confirmed_partial', 'failed', 'unknown', 'expired']),
  resolutionType: z.string().nullable().optional(),
  windowMinutes: z.number().nullable().optional(),
  evidenceJson: z.string().default('[]'),
})

export type CreateAlertInput = z.infer<typeof createAlertSchema>
export type ResolveAlertInput = z.infer<typeof resolveAlertSchema>
