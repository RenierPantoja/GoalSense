/**
 * Patterns Service — persistence-agnostic via the repository layer (Phase E3).
 * Works in both PERSISTENCE_PROVIDER=prisma and =firebase modes.
 * Routes and payloads are unchanged.
 */
import { createRepositories } from '../../repositories/index.js'
import type { CreatePatternInput, UpdatePatternInput } from './pattern.schemas.js'

const DEFAULT_USER = 'default'

export async function listPatterns() {
  const repos = createRepositories()
  return repos.patterns.listAll(DEFAULT_USER)
}

export async function getPattern(id: string) {
  const repos = createRepositories()
  return repos.patterns.findById(id, DEFAULT_USER)
}

export async function createPattern(input: CreatePatternInput) {
  const repos = createRepositories()
  return repos.patterns.create(input as any, DEFAULT_USER)
}

export async function updatePattern(id: string, input: UpdatePatternInput) {
  const repos = createRepositories()
  return repos.patterns.update(id, input as any, DEFAULT_USER)
}

export async function deletePattern(id: string) {
  // Soft delete (status='archived'), matching legacy behaviour.
  const repos = createRepositories()
  return repos.patterns.archive(id, DEFAULT_USER)
}
