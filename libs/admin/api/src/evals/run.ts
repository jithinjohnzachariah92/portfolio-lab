import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { runNaturalLanguageQuery } from '../queryService'
import { NL2MONGO_TEST_CASES } from './testCases'
import { scoreCase, buildReport } from './scoring'
import type { CaseResult, EvalReport } from './scoring'

const BASELINE_PATH = join(process.cwd(), 'libs/admin/api/src/evals/baseline.json')

const PASS_THRESHOLDS = {
  avgPrecision: 0.75,
  avgRecall:    0.75,
  emptyHandlingRate: 0.90,   // fraction of empty-expected cases correctly returning nothing
}

const printReport = (report: EvalReport, baseline?: EvalReport) => {
  const diff = (current: number, base?: number) => {
    if (base === undefined) return ''
    const d = current - base
    const sign = d >= 0 ? '+' : ''
    return ` (${sign}${d.toFixed(3)} vs baseline)`
  }

  console.log('\n══════════════════════════════════════════')
  console.log('  EVAL REPORT — NL2Mongo Query Generator')
  console.log(`  ${report.timestamp}`)
  console.log('══════════════════════════════════════════')
  console.log(`  Cases:          ${report.totalCases}`)
  console.log(`  Avg precision:  ${report.avgPrecision.toFixed(3)}${diff(report.avgPrecision, baseline?.avgPrecision)}`)
  console.log(`  Avg recall:     ${report.avgRecall.toFixed(3)}${diff(report.avgRecall, baseline?.avgRecall)}`)
  console.log(`  Empty handling: ${report.emptyHandlingCorrect}/${report.emptyHandlingTotal} correct`)
  console.log('──────────────────────────────────────────')

  for (const r of report.caseResults) {
    const status = r.passed ? '✓' : '✗'
    const empty = r.correctEmptyHandling !== null ? ` [empty:${r.correctEmptyHandling ? 'ok' : 'WRONG'}]` : ''
    console.log(`  ${status}  ${r.id}  P:${r.precision.toFixed(2)} R:${r.recall.toFixed(2)}  llm:${r.llmCount} truth:${r.groundTruthCount}  ${r.durationMs}ms${empty}`)
    if (r.error) console.log(`     error: ${r.error}`)
  }

  console.log('──────────────────────────────────────────')
  console.log(`  ${report.failed.length === 0 ? 'ALL PASSED' : `FAILED: ${report.failed.join(', ')}`}`)
  console.log('══════════════════════════════════════════\n')
}

const checkThresholds = (report: EvalReport): boolean => {
  const failures: string[] = []
  const emptyRate = report.emptyHandlingTotal > 0 ? report.emptyHandlingCorrect / report.emptyHandlingTotal : 1

  if (report.avgPrecision < PASS_THRESHOLDS.avgPrecision)
    failures.push(`precision ${report.avgPrecision} < ${PASS_THRESHOLDS.avgPrecision}`)
  if (report.avgRecall < PASS_THRESHOLDS.avgRecall)
    failures.push(`recall ${report.avgRecall} < ${PASS_THRESHOLDS.avgRecall}`)
  if (emptyRate < PASS_THRESHOLDS.emptyHandlingRate)
    failures.push(`empty-handling rate ${emptyRate.toFixed(2)} < ${PASS_THRESHOLDS.emptyHandlingRate}`)

  if (failures.length > 0) {
    console.error('\n❌ EVAL GATE FAILED:')
    failures.forEach(f => console.error(`   ${f}`))
    return false
  }
  console.log('\n✅ EVAL GATE PASSED')
  return true
}

const main = async () => {
  const isCI = process.argv.includes('--ci')
  const updateBaseline = process.argv.includes('--update-baseline')

  console.log(`\nRunning NL2Mongo evals... (${NL2MONGO_TEST_CASES.length} cases)`)

  const results: CaseResult[] = []
  for (const tc of NL2MONGO_TEST_CASES) {
    process.stdout.write(`  Running ${tc.id}...`)
    const start = Date.now()
    try {
      const { generatedQuery } = await runNaturalLanguageQuery(tc.input)
      const result = await scoreCase(tc, generatedQuery, Date.now() - start)
      results.push(result)
      process.stdout.write(` ${result.passed ? '✓' : '✗'}\n`)
    } catch (err) {
      results.push({
        id: tc.id, input: tc.input, llmFilter: undefined,
        llmCount: 0, groundTruthCount: 0, precision: 0, recall: 0,
        correctEmptyHandling: tc.expectEmpty ? false : null,
        passed: false, durationMs: Date.now() - start, error: String(err),
      })
      process.stdout.write(' ✗\n')
    }
  }

  const report = buildReport(results)
  const baseline: EvalReport | undefined = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'))
    : undefined

  printReport(report, baseline)

  if (updateBaseline) {
    writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2))
    console.log(`✅ Baseline updated: ${BASELINE_PATH}`)
  }

  if (isCI) {
    process.exit(checkThresholds(report) ? 0 : 1)
  }
}

main().catch(err => {
  console.error('Eval runner failed:', err)
  process.exit(1)
})