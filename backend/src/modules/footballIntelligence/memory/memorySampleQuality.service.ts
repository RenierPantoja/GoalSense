/**
 * Memory Sample Quality Engine (B45 / Bloco 2) — PURE.
 * ─────────────────────────────────────────────────────────────────────────────
 * The disciplined heart of historical memory: decides whether a sample is strong /
 * usable / weak / insufficient / misleading_risk. NO persistence, NO provider, NO
 * randomness — deterministic from counts + recency. Encodes the inviolable rules:
 *   - no sample → insufficient (never a tendency);
 *   - small sample → weak (never a strong conclusion);
 *   - mostly old / mixed-context with few recent cases → misleading_risk;
 *   - reliability is data-confidence, NOT a probability of winning.
 *
 * Pure, env-free, Noop-safe: importable in smokes without touching Firebase.
 */
import type { SampleQuality, SampleQualityAssessment, TabooStatus } from './fundamentalMemory.types.js'

export interface SampleQualityInput {
  sampleSize: number
  recentSampleSize?: number          // within recency window
  outdatedSampleSize?: number        // older than recency window
  contextMatchedSampleSize?: number  // matched the target context (home/away, competition, etc.)
  strongThreshold?: number           // default 8
  usableThreshold?: number           // default 4
}

const DEFAULT_STRONG = 8
const DEFAULT_USABLE = 4

/**
 * Core, fully deterministic sample-quality evaluation. Recent in-context cases drive
 * the verdict; old-only or sparse-recent samples are demoted / flagged misleading.
 */
export function evaluateSampleQuality(input: SampleQualityInput): SampleQualityAssessment {
  const total = Math.max(0, Math.floor(input.sampleSize || 0))
  const strongAt = input.strongThreshold ?? DEFAULT_STRONG
  const usableAt = input.usableThreshold ?? DEFAULT_USABLE
  // When recency/context splits are not provided, treat the whole sample as recent+matched.
  const recent = clampTo(input.recentSampleSize ?? total, total)
  const outdated = clampTo(input.outdatedSampleSize ?? Math.max(0, total - recent), total)
  const contextMatched = clampTo(input.contextMatchedSampleSize ?? recent, total)

  const warnings: string[] = []
  const limitations: string[] = []

  if (total === 0) {
    return {
      quality: 'insufficient', sampleSize: 0, recentSampleSize: 0, outdatedSampleSize: 0, contextMatchedSampleSize: 0,
      reliability: 'insufficient', canConclude: false,
      warnings: [], limitations: ['Sem amostra — insufficient_history (não é tendência nem dado negativo).'],
    }
  }

  // Effective evidence = recent AND context-matched cases.
  const effective = Math.min(recent, Math.max(contextMatched, 0)) || recent

  let quality: SampleQuality
  // Mostly old with very little recent evidence → risky to use even if total looks ok.
  if (total >= usableAt && recent < usableAt && outdated >= recent) {
    quality = 'misleading_risk'
    warnings.push('Amostra dominada por casos antigos — risco de leitura enganosa.')
    limitations.push('Maioria do histórico está fora da janela de recência (outdated).')
  } else if (effective >= strongAt) {
    quality = 'strong'
  } else if (effective >= usableAt) {
    quality = 'usable'
    warnings.push('Amostra moderada — usar apenas como apoio, sem conclusão forte.')
  } else {
    quality = 'weak'
    warnings.push('Amostra pequena — não tirar conclusões (sem tabu/curse).')
  }

  if (outdated > 0 && quality !== 'misleading_risk') {
    limitations.push(`${outdated} caso(s) antigo(s) têm peso menor.`)
  }
  if (contextMatched < recent) {
    limitations.push('Parte da amostra é de contexto diferente (down-weighted).')
  }

  const reliability: SampleQualityAssessment['reliability'] =
    quality === 'strong' ? 'high'
      : quality === 'usable' ? 'medium'
        : quality === 'misleading_risk' ? 'low'
          : quality === 'weak' ? 'low'
            : 'insufficient'

  const canConclude = quality === 'strong'

  return {
    quality, sampleSize: total, recentSampleSize: recent, outdatedSampleSize: outdated, contextMatchedSampleSize: contextMatched,
    reliability, canConclude, warnings, limitations,
  }
}

function clampTo(v: number, max: number): number {
  const n = Math.max(0, Math.floor(v || 0))
  return Math.min(n, max)
}

/**
 * H2H sample quality. Insufficient confrontations NEVER become a taboo. Old-only H2H
 * is misleading. Mirrors the deterministic core with H2H-tuned thresholds.
 */
export function evaluateH2HSampleQuality(input: { matchesFound: number; relevantMatches: number; outdatedMatches: number }): SampleQualityAssessment {
  const a = evaluateSampleQuality({
    sampleSize: Math.max(0, input.matchesFound || 0),
    recentSampleSize: Math.max(0, input.relevantMatches || 0),
    outdatedSampleSize: Math.max(0, input.outdatedMatches || 0),
    strongThreshold: 6,   // H2H needs fewer cases to be "strong" but still > a couple
    usableThreshold: 3,
  })
  if (a.sampleSize > 0 && a.quality === 'weak') {
    a.warnings = [...a.warnings, 'Confronto direto insuficiente — não é tabu.']
  }
  return a
}

/** Team-memory quality from the B39 team-memory shape (sampleSize + competition spread). */
export function evaluateTeamMemoryQuality(input: { sampleSize: number; fixturesAnalyzed?: number; competitions?: number }): SampleQualityAssessment {
  return evaluateSampleQuality({
    sampleSize: Math.max(0, input.sampleSize || 0),
    // Spreading across many competitions slightly dilutes context match.
    contextMatchedSampleSize: input.competitions && input.competitions > 3
      ? Math.floor((input.sampleSize || 0) * 0.7)
      : (input.sampleSize || 0),
  })
}

/** Pattern×context quality. confirmed_partial counts as partial-useful, never as failed. */
export function evaluatePatternContextQuality(input: { confirmed: number; confirmedPartial: number; failed: number; unknown: number; notEvaluable: number; recentSample?: number }): SampleQualityAssessment {
  const evaluable = (input.confirmed || 0) + (input.confirmedPartial || 0) + (input.failed || 0)
  const total = evaluable + (input.unknown || 0) + (input.notEvaluable || 0)
  const a = evaluateSampleQuality({
    sampleSize: evaluable,
    recentSampleSize: input.recentSample ?? evaluable,
  })
  if (total > 0 && evaluable === 0) {
    a.limitations = [...a.limitations, 'Casos apenas unknown/not_evaluable — não avaliável (≠ falha).']
  }
  return a
}

/** Plain-language limitations for a verdict (UI/explanation helper). */
export function explainSampleLimitations(a: SampleQualityAssessment): string[] {
  const out: string[] = []
  switch (a.quality) {
    case 'insufficient': out.push('Sem base suficiente — insufficient_history (não concluir nada).'); break
    case 'weak': out.push(`Amostra pequena (${a.sampleSize}) — apenas observação, sem conclusão.`); break
    case 'misleading_risk': out.push('Amostra potencialmente enganosa (antiga/contexto misto) — não usar como base.'); break
    case 'usable': out.push(`Amostra utilizável (${a.recentSampleSize} recentes) — apoio, não certeza.`); break
    case 'strong': out.push(`Amostra forte (${a.recentSampleSize} recentes em contexto) — confiabilidade de dado, NÃO probabilidade de acerto.`); break
    default: out.push('Qualidade de amostra desconhecida.')
  }
  return [...out, ...a.limitations]
}

/**
 * Map a sample-quality verdict + support/contradiction counts to a taboo status.
 * PURE governance: weak/insufficient/old/superstition-shaped never becomes a usable
 * constraint.
 */
export function classifyTabooFromSample(input: {
  sample: SampleQualityAssessment
  supportingCases: number
  contradictingCases: number
}): { status: TabooStatus; isUsableConstraint: boolean; note: string } {
  const { sample } = input
  const support = Math.max(0, input.supportingCases || 0)
  const contra = Math.max(0, input.contradictingCases || 0)

  if (sample.sampleSize === 0 || sample.quality === 'insufficient') {
    return { status: 'not_enough_data', isUsableConstraint: false, note: 'Sem evidência — não é tabu.' }
  }
  if (contra > 0 && contra >= support) {
    return { status: 'contradicted', isUsableConstraint: false, note: 'Evidência posterior contradiz a restrição.' }
  }
  if (sample.quality === 'misleading_risk') {
    return { status: 'outdated', isUsableConstraint: false, note: 'Evidência majoritariamente antiga — outdated.' }
  }
  if (sample.quality === 'weak') {
    // A "100% so far" finding on a tiny sample is exactly the superstition trap.
    if (support >= 1 && contra === 0 && sample.sampleSize < 3) {
      return { status: 'superstition_risk', isUsableConstraint: false, note: 'Padrão de pouquíssimos casos sem contraexemplo — risco de superstição.' }
    }
    return { status: 'weak_sample', isUsableConstraint: false, note: 'Amostra pequena — não asseverar restrição.' }
  }
  if (sample.quality === 'strong' && support > contra) {
    return { status: 'supported', isUsableConstraint: true, note: 'Restrição com base recente e suficiente.' }
  }
  // usable but not strong → keep as candidate, not usable yet.
  return { status: 'candidate', isUsableConstraint: false, note: 'Indício; ainda não suficiente para usar como restrição.' }
}
