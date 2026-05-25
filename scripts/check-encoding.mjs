#!/usr/bin/env node
/**
 * Encoding regression guard.
 * Scans src/ for:
 *  - U+FFFD replacement characters (lossy decode artifacts)
 *  - common UTF-8-as-Latin1 mojibake sequences (Ã©, Ãµ, Ã£, Ã§, Ã¡, Ã³, Ã­, Ã , Ãº, Â)
 *  - smart-punct mojibake: â€™, â€œ, â€, â€¢, â€“, â€”
 *
 * Exit 1 if anything is found, 0 otherwise.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname, sep } from 'node:path'

const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.json', '.md'])
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vercel', '.netlify', '.next', 'build'])

// Mojibake patterns we treat as definitely wrong inside our codebase strings.
// Each pattern includes typical Portuguese mojibake forms.
const MOJIBAKE_PATTERNS = [
  { re: /\uFFFD/g, name: 'U+FFFD replacement char' },
  { re: /Ã[©£§³¡­ªºÀ-ÿ]/g, name: 'UTF-8 read as Latin1 (Ã*)' },
  { re: /â€[™œ¢“”–—˜š]/g, name: 'Smart punct mojibake (â€*)' },
  { re: /Â[°¤¥¦§¨©ª«¬­®¯ ]/g, name: 'Mojibake (Â*)' },
]

const problems = []
function walk(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const f of entries) {
    if (SKIP_DIRS.has(f)) continue
    const p = join(dir, f)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) walk(p)
    else if (EXTS.has(extname(p))) {
      let txt
      try { txt = readFileSync(p, 'utf8') } catch { continue }
      const lines = txt.split('\n')
      for (let i = 0; i < lines.length; i++) {
        for (const { re, name } of MOJIBAKE_PATTERNS) {
          re.lastIndex = 0
          if (re.test(lines[i])) {
            problems.push({ file: p, line: i + 1, kind: name, snippet: lines[i].trim().slice(0, 160) })
            break
          }
        }
      }
    }
  }
}

walk('src')

if (problems.length === 0) {
  console.log('✓ encoding clean — no mojibake or U+FFFD in src/')
  process.exit(0)
}

console.error(`✗ encoding regression: ${problems.length} occurrence(s)`)
const byFile = new Map()
for (const p of problems) {
  if (!byFile.has(p.file)) byFile.set(p.file, [])
  byFile.get(p.file).push(p)
}
for (const [file, occ] of byFile) {
  console.error(`\n  ${file} — ${occ.length} issue(s)`)
  for (const o of occ) {
    console.error(`    L${o.line} [${o.kind}]: ${o.snippet}`)
  }
}
process.exit(1)
