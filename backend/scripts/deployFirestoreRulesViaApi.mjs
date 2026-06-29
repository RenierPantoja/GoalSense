#!/usr/bin/env node
/**
 * Deploy Firestore Rules via Firebase Rules REST API — B65
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses the LOCAL service account (gitignored) to mint a cloud-platform access
 * token and publish ../firestore.rules to the cloud.firestore release.
 * Never prints the token or any secret. Local-only admin operation.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { GoogleAuth } from 'google-auth-library'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')

const SA_PATH = path.join(repoRoot, 'goalsense-29892-firebase-adminsdk-fbsvc-1c86135720.json')
const RULES_PATH = path.join(repoRoot, 'firestore.rules')
const PROJECT_ID = 'goalsense-29892'

async function main() {
  const rulesContent = readFileSync(RULES_PATH, 'utf8')
  const auth = new GoogleAuth({
    keyFile: SA_PATH,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const client = await auth.getClient()

  // 1. Create ruleset
  const createRulesetUrl = `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`
  const rulesetRes = await client.request({
    url: createRulesetUrl,
    method: 'POST',
    data: { source: { files: [{ name: 'firestore.rules', content: rulesContent }] } },
  })
  const rulesetName = rulesetRes.data?.name
  if (!rulesetName) throw new Error('ruleset creation returned no name')
  console.log('ruleset created:', rulesetName.split('/').pop())

  // 2. Update (or create) the cloud.firestore release to point at the new ruleset
  const releaseId = 'cloud.firestore'
  const releaseFullName = `projects/${PROJECT_ID}/releases/${releaseId}`
  const releaseBody = { name: releaseFullName, rulesetName }

  // Try PATCH (update existing release) first
  try {
    const patchUrl = `https://firebaserules.googleapis.com/v1/${releaseFullName}`
    await client.request({ url: patchUrl, method: 'PATCH', data: { release: releaseBody } })
    console.log('release updated (PATCH): cloud.firestore')
  } catch (e) {
    // Fall back to POST create if release did not exist
    const createUrl = `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases`
    await client.request({ url: createUrl, method: 'POST', data: releaseBody })
    console.log('release created (POST): cloud.firestore')
  }

  console.log('FIRESTORE RULES DEPLOYED OK')
}

main().catch(err => {
  const status = err?.response?.status
  const safe = status ? `HTTP ${status}` : (err?.message || 'unknown error')
  console.error('DEPLOY FAILED:', safe)
  process.exit(1)
})
