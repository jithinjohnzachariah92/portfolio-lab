import { onEvent } from '@jz92/ai-core'

export const register = async () => {
  onEvent((event) => {
    const icon = event.type.includes('failure') ? '✗'
      : event.type.includes('empty')            ? '○'
      : '✓'

    const parts: string[] = []

    if (event.durationMs !== undefined) parts.push(`${event.durationMs}ms`)

    if (event.source === 'vector' && (event.type === 'search.success' || event.type === 'search.empty')) {
      if (event.topScore !== undefined) parts.push(`score:${event.topScore.toFixed(3)}`)
      parts.push(`returned:${event.returned}`)
    }

    if (event.source === 'retrieval' && event.type === 'retrieved') {
      if (event.count !== undefined) parts.push(`count:${event.count}`)
      if (event.topScore !== undefined) parts.push(`score:${event.topScore.toFixed(3)}`)
    }

    if (event.source === 'ai-provider' && event.type === 'embedding.success') {
      parts.push(`dims:${event.dimensions}`)
    }

    console.log(`[event] ${icon} ${event.source}.${event.type}  trace:${event.traceId}  ${parts.join(' ')}`)
  })
}