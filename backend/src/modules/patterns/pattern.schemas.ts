import { z } from 'zod'

export const createPatternSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).default(''),
  status: z.enum(['active', 'paused', 'draft', 'archived']).default('paused'),
  severity: z.enum(['critical', 'attention', 'info']).default('attention'),
  scope: z.enum(['all', 'favorites_only', 'specific_leagues', 'specific_teams', 'specific_matches']).default('all'),
  action: z.enum(['register_alert', 'suggest_only', 'highlight']).default('register_alert'),
  minConfidence: z.number().min(20).max(99).default(50),
  requireRichData: z.boolean().default(false),
  onlyLive: z.boolean().default(false),
  onlyPreMatch: z.boolean().default(false),
  conditionsJson: z.string().default('[]'),
  scopeFilterJson: z.string().nullable().optional(),
  extendedJson: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
})

export const updatePatternSchema = createPatternSchema.partial()

export type CreatePatternInput = z.infer<typeof createPatternSchema>
export type UpdatePatternInput = z.infer<typeof updatePatternSchema>
