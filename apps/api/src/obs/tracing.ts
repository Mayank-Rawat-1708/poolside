// Loaded before the app with `node --import ./dist/obs/tracing.js`, so the
// instrumentations can patch http/pg/undici before anything imports them.
// Configured through standard OTEL_* env vars (OTEL_SERVICE_NAME,
// OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SDK_DISABLED).
import { register } from 'node:module';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { NodeSDK } from '@opentelemetry/sdk-node';

// ESM imports (our `import pg from 'pg'`) are only patchable through this loader hook.
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [
    new HttpInstrumentation({
      // Prometheus scrapes every 2s; tracing those would drown real traffic.
      ignoreIncomingRequestHook: (req) => req.url === '/metrics',
    }),
    new UndiciInstrumentation(), // global fetch
    new PgInstrumentation(),
  ],
});

sdk.start();

process.once('SIGTERM', () => void sdk.shutdown());
