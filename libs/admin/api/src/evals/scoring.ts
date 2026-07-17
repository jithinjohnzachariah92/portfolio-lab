import { Customer } from '@shared/models'
import type { NL2MongoTestCase } from './testCases'
import type { GeneratedQuery } from '../queryService'

export type CaseResult = {
  id: string
  input: string
  llmFilter: Record<string, unknown> | undefined
  llmCount: number
  groundTruthCount: number
  precision: number
  recall: number
  correctEmptyHandling: boolean | null
  passed: boolean
  durationMs: number
  error?: string
}

export type EvalReport = {
  timestamp: string
  totalCases: number
  avgPrecision: number
  avgRecall: number
  emptyHandlingCorrect: number
  emptyHandlingTotal: number
  caseResults: CaseResult[]
  failed: string[]
}

export const scoreCase = async (
  testCase: NL2MongoTestCase,
  llmQuery: GeneratedQuery,
  durationMs: number
): Promise<CaseResult> => {
  try {
    const llmDocs = await Customer.find(llmQuery.filter ?? {})
      .limit(llmQuery.limit ?? 10)
      .select('_id')

    const truthDocs = await Customer.find(testCase.groundTruthFilter).select('_id')

    const llmIds = new Set(llmDocs.map((d: any) => String(d._id)))
    const truthIds = new Set(truthDocs.map((d: any) => String(d._id)))

    const intersection = [...llmIds].filter((id) => truthIds.has(id)).length

    const precision = llmIds.size === 0 ? (truthIds.size === 0 ? 1 : 0) : intersection / llmIds.size
    const recall = truthIds.size === 0 ? (llmIds.size === 0 ? 1 : 0) : intersection / truthIds.size

    const correctEmptyHandling = testCase.expectEmpty ? llmIds.size === 0 : null

    const passed = testCase.expectEmpty
      ? llmIds.size === 0
      : precision >= 0.8 && recall >= 0.8

    return {
      id: testCase.id,
      input: testCase.input,
      llmFilter: llmQuery.filter,
      llmCount: llmIds.size,
      groundTruthCount: truthIds.size,
      precision: +precision.toFixed(3),
      recall: +recall.toFixed(3),
      correctEmptyHandling,
      passed,
      durationMs,
    }
  } catch (err) {
    return {
      id: testCase.id,
      input: testCase.input,
      llmFilter: llmQuery.filter,
      llmCount: 0,
      groundTruthCount: 0,
      precision: 0,
      recall: 0,
      correctEmptyHandling: testCase.expectEmpty ? false : null,
      passed: false,
      durationMs,
      error: String(err),
    }
  }
}

export const buildReport = (results: CaseResult[]): EvalReport => {
  const avgPrecision = results.reduce((s, r) => s + r.precision, 0) / results.length
  const avgRecall = results.reduce((s, r) => s + r.recall, 0) / results.length

  const emptyResults = results.filter((r) => r.correctEmptyHandling !== null)
  const emptyHandlingCorrect = emptyResults.filter((r) => r.correctEmptyHandling === true).length

  return {
    timestamp: new Date().toISOString(),
    totalCases: results.length,
    avgPrecision: +avgPrecision.toFixed(3),
    avgRecall: +avgRecall.toFixed(3),
    emptyHandlingCorrect,
    emptyHandlingTotal: emptyResults.length,
    caseResults: results,
    failed: results.filter((r) => !r.passed).map((r) => r.id),
  }
}