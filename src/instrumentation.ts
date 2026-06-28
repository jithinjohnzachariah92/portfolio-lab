// instrumentation.ts
export async function register() {
  const { onAIEvent } = await import('@jz92/ai-provider');

  onAIEvent((event) => {
    // Structured logging — forward to your observability stack
    switch (event.type) {
      case 'request.failure':
        console.error('[ai-observability]', JSON.stringify(event));
        break;
      case 'request.retry':
        console.warn('[ai-observability]', JSON.stringify(event));
        break;
      case 'request.success':
      case 'cache.hit':
        // Only log these if you want full telemetry; comment out to reduce noise
        if (process.env.AI_LOG_USAGE === 'true') {
          console.log('[ai-observability]', JSON.stringify(event));
        }
        break;
    }
  });
}