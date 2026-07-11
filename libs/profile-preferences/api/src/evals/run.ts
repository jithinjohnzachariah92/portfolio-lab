import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { inferPreferences } from '../parseService'
import { TEST_CASES } from './testCases'
import {
  scoreAccuracy,
  scoreConsistency,
  scoreEmpty,
  scoreHallucination,
  buildReport,
} from './scoring'
import type { CaseResult, ConsistencyResult, EvalReport } from './scoring'

const BASELINE_PATH = join(process.cwd(), 'libs/profile-preferences/api/src/evals/baseline.json')
const CONSISTENCY_RUNS = 3    // how many times to run each case for consistency check
const PASS_THRESHOLDS = {
  accuracyScore:     0.80,    // fail if accuracy drops below 80%
  consistencyScore:  0.70,    // fail if consistency drops below 70%
  hallucinationRate: 0.10,    // fail if hallucination rate exceeds 10%
  emptyRate:         0.20,    // fail if empty rate exceeds 20%
}

// ── Run a single test case ────────────────────────────────────────────────────

const runCase = async (tc: typeof TEST_CASES[0]): Promise<CaseResult> => {
  const start = Date.now()
  try {
    const result = await inferPreferences(tc.input, { traceId: randomUUID() })

    if (!result.success) {
      return {
        id: tc.id, input: tc.input, passed: false,
        accuracyScore: 0, hallucinated: [], isEmpty: true,
        shouldBeEmpty: tc.shouldBeEmpty, emptyCorrect: false,
        durationMs: Date.now() - start,
        error: result.errorMessage,
      }
    }

    const { preferences, quality } = result
    const accuracyScore = scoreAccuracy(preferences, tc.expected)
    const hallucinated  = scoreHallucination(preferences)
    const isEmpty       = quality.isEmpty
    const emptyCorrect  = scoreEmpty(preferences, tc)

    // Case passes if: accuracy >= 80% AND empty handled correctly
    const passed = accuracyScore >= 0.8 && emptyCorrect

    return {
      id: tc.id, input: tc.input, passed,
      accuracyScore, hallucinated, isEmpty,
      shouldBeEmpty: tc.shouldBeEmpty, emptyCorrect,
      durationMs: Date.now() - start,
    }

  } catch (err) {
    return {
      id: tc.id, input: tc.input, passed: false,
      accuracyScore: 0, hallucinated: [], isEmpty: true,
      shouldBeEmpty: tc.shouldBeEmpty, emptyCorrect: false,
      durationMs: Date.now() - start,
      error: String(err),
    }
  }
}

// ── Run consistency check ─────────────────────────────────────────────────────

const runConsistency = async (tc: typeof TEST_CASES[0]): Promise<ConsistencyResult> => {
  const runs = []
  for (let i = 0; i < CONSISTENCY_RUNS; i++) {
    const result = await inferPreferences(tc.input, { traceId: randomUUID() })
    if (result.success) runs.push(result.preferences)
  }
  return { id: tc.id, input: tc.input, runs, consistent: scoreConsistency(runs) }
}

// ── Print report ──────────────────────────────────────────────────────────────

const printReport = (report: EvalReport, baseline?: EvalReport) => {
  const diff = (current: number, base?: number) => {
    if (base === undefined) return ''
    const d = current - base
    const sign = d >= 0 ? '+' : ''
    return ` (${sign}${d.toFixed(3)} vs baseline)`
  }

  console.log('\n══════════════════════════════════════════')
  console.log('  EVAL REPORT — Preference Parser')
  console.log(`  ${report.timestamp}`)
  console.log('══════════════════════════════════════════')
  console.log(`  Cases:        ${report.totalCases}`)
  console.log(`  Accuracy:     ${report.accuracyScore.toFixed(3)}${diff(report.accuracyScore, baseline?.accuracyScore)}`)
  console.log(`  Consistency:  ${report.consistencyScore.toFixed(3)}${diff(report.consistencyScore, baseline?.consistencyScore)}`)
  console.log(`  Hallucinate:  ${report.hallucinationRate.toFixed(3)}${diff(report.hallucinationRate, baseline?.hallucinationRate)}`)
  console.log(`  Empty rate:   ${report.emptyRate.toFixed(3)}${diff(report.emptyRate, baseline?.emptyRate)}`)
  console.log('──────────────────────────────────────────')

  for (const r of report.caseResults) {
    const status = r.passed ? '✓' : '✗'
    const acc = r.accuracyScore.toFixed(2)
    const hall = r.hallucinated.length > 0 ? ` [hallucinated: ${r.hallucinated.join(', ')}]` : ''
    const empty = !r.emptyCorrect ? ` [isEmpty: got ${r.isEmpty}, expected ${r.shouldBeEmpty}]` : ''
    console.log(`  ${status}  ${r.id}  acc:${acc}  ${r.durationMs}ms${hall}${empty}`)
    if (r.error) console.log(`     error: ${r.error}`)
  }

  console.log('──────────────────────────────────────────')
  console.log(`  ${report.failed.length === 0 ? 'ALL PASSED' : `FAILED: ${report.failed.join(', ')}`}`)
  console.log('══════════════════════════════════════════\n')
}

// ── CI gate ───────────────────────────────────────────────────────────────────

const checkThresholds = (report: EvalReport): boolean => {
  const failures: string[] = []

  if (report.accuracyScore     < PASS_THRESHOLDS.accuracyScore)
    failures.push(`accuracy ${report.accuracyScore.toFixed(3)} < ${PASS_THRESHOLDS.accuracyScore}`)
  if (report.consistencyScore  < PASS_THRESHOLDS.consistencyScore)
    failures.push(`consistency ${report.consistencyScore.toFixed(3)} < ${PASS_THRESHOLDS.consistencyScore}`)
  if (report.hallucinationRate > PASS_THRESHOLDS.hallucinationRate)
    failures.push(`hallucination ${report.hallucinationRate.toFixed(3)} > ${PASS_THRESHOLDS.hallucinationRate}`)
  if (report.emptyRate         > PASS_THRESHOLDS.emptyRate)
    failures.push(`empty rate ${report.emptyRate.toFixed(3)} > ${PASS_THRESHOLDS.emptyRate}`)

  if (failures.length > 0) {
    console.error('\n❌ EVAL GATE FAILED:')
    failures.forEach(f => console.error(`   ${f}`))
    return false
  }

  console.log('\n✅ EVAL GATE PASSED')
  return true
}

// ── Main ──────────────────────────────────────────────────────────────────────

const main = async () => {
  const isCI      = process.argv.includes('--ci')
  const updateBaseline = process.argv.includes('--update-baseline')

  console.log('\nRunning preference parser evals...')
  console.log(`Mode: ${isCI ? 'CI gate' : 'manual'} | Cases: ${TEST_CASES.length} | Consistency runs: ${CONSISTENCY_RUNS}`)

  // Run all cases
  const caseResults: CaseResult[] = []
  for (const tc of TEST_CASES) {
    process.stdout.write(`  Running ${tc.id}...`)
    const result = await runCase(tc)
    caseResults.push(result)
    process.stdout.write(` ${result.passed ? '✓' : '✗'}\n`)
  }

  // Run consistency checks (subset — expensive, 3 runs each)
  console.log('\nRunning consistency checks...')
  const consistencyResults: ConsistencyResult[] = []
  for (const tc of TEST_CASES.slice(0, 3)) {  // first 3 cases only to keep it fast
    process.stdout.write(`  Consistency ${tc.id}...`)
    const result = await runConsistency(tc)
    consistencyResults.push(result)
    process.stdout.write(` ${result.consistent ? '✓' : '✗'}\n`)
  }

  // Build report
  const report = buildReport(caseResults, consistencyResults)

  // Load baseline for comparison
  const baseline: EvalReport | undefined = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'))
    : undefined

  // Print
  printReport(report, baseline)

  // Update baseline if requested
  if (updateBaseline) {
    writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2))
    console.log(`✅ Baseline updated: ${BASELINE_PATH}`)
  }

  // CI gate
  if (isCI) {
    const passed = checkThresholds(report)
    process.exit(passed ? 0 : 1)
  }
}

main().catch(err => {
  console.error('Eval runner failed:', err)
  process.exit(1)
})