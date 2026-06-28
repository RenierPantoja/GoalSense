import { runCausalLearningForToday } from '../dist/modules/footballIntelligence/causal/causalLearningRunner.service.js'

async function runPostMatchReview() {
  console.log('--- GoalSense B54: Post-Match Causal Review (Day 3) ---')
  console.log("Starting causal learning for today's finished matches...\n")

  const run = await runCausalLearningForToday()

  console.log(`Run ID: ${run.id}`)
  console.log(`Status: ${run.status}`)
  console.log(`Cases Analyzed: ${run.casesAnalyzed}`)
  console.log(`Evaluable Cases: ${run.casesAnalyzed - run.notEvaluableCount}`)
  console.log(`Not Evaluable: ${run.notEvaluableCount}`)
  console.log(`Insights Created: ${run.insightsCreated}`)
  console.log(`Suggestions Created: ${run.suggestionsCreated}`)

  if (run.notes && run.notes.length > 0) {
    console.log('\nNotes:')
    run.notes.forEach(n => console.log(`- ${n}`))
  }

  console.log('\nLimitations:')
  run.limitations.forEach(l => console.log(`- ${l}`))

  console.log('\n--- Summary ---')
  console.log('Post-Match Causal Review complete.')
  console.log('Suggestions generated are observational and will NOT be automatically applied.')
  console.log('Proceed to generate the Daily Validation Report.')
}

runPostMatchReview().catch(console.error)
