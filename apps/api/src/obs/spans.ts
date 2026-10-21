import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';

export const tracer = trace.getTracer('poolside-api');

// Runs fn inside an active span, marking it failed if fn throws.
export async function inSpan<T>(
  name: string,
  attributes: Record<string, number | string>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}

export function currentTraceId(): string | undefined {
  return trace.getActiveSpan()?.spanContext().traceId;
}
