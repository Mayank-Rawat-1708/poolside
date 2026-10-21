import { randomUUID } from 'node:crypto';
import { trace } from '@opentelemetry/api';
import { LogController, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { IncomingMessage } from 'node:http';
import { stdTimeFunctions } from 'pino';
import { httpRequestDuration } from './metrics.js';
import { currentTraceId } from './spans.js';
import type { PoolStats } from '../db/instrumented-pool.js';
import type { RecentRequests } from './recent-requests.js';
import { newContext, runWithContext, type RequestContext } from './request-context.js';

// Accept a caller's request id only if it looks like one; otherwise mint our own.
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

function requestIdFrom(req: IncomingMessage): string {
  const incoming = req.headers['x-request-id'];
  return typeof incoming === 'string' && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
}

export function loggingOptions(level: string): FastifyServerOptions {
  return {
    logger: {
      level,
      base: { service: 'api' },
      timestamp: stdTimeFunctions.isoTime,
    },
    requestIdHeader: false,
    genReqId: requestIdFrom,
    // We emit one summary line per request ourselves (see below).
    logController: new LogController({ requestIdLogLabel: 'requestId', disableRequestLogging: true }),
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    errorClass?: string;
    ctx: RequestContext;
  }
}

interface HookOptions {
  poolStats: () => PoolStats;
  recent: RecentRequests;
}

export function registerHttpHooks(app: FastifyInstance, opts: HookOptions) {
  // Callback-style hook: everything after done() runs inside the context.
  app.addHook('onRequest', (req, reply, done) => {
    reply.header('x-request-id', req.id);
    req.ctx = newContext(req.id, currentTraceId());
    // Name the server span after the route template ("POST /orders"), not the raw URL.
    const route = req.routeOptions.url;
    if (route) trace.getActiveSpan()?.updateName(`${req.method} ${route}`).setAttribute('http.route', route);
    runWithContext(req.ctx, done);
  });

  app.addHook('onResponse', (req, reply, done) => {
    // Use the route template, not the raw URL, to keep label cardinality bounded.
    const route = req.routeOptions.url ?? 'unmatched';
    // Prometheus scrapes are not user traffic: keep them out of metrics and logs.
    if (route === '/metrics') return done();
    // Admin polling (the console) is operational traffic: logged at debug only.
    const operational = route.startsWith('/admin');
    if (!operational) {
      httpRequestDuration.labels(req.method, route, String(reply.statusCode)).observe(reply.elapsedTime / 1000);
    }

    const fields = {
      traceId: req.ctx.traceId,
      method: req.method,
      route,
      status: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime * 10) / 10,
      errorClass: req.errorClass,
      // Where the time went, and the pool's state as this request finished.
      timings: roundTimings(req.ctx.timings),
      pool: opts.poolStats(),
    };
    if (operational) {
      req.log.debug(fields, 'request completed');
      return done();
    }
    if (reply.statusCode >= 500) req.log.error(fields, 'request completed');
    else req.log.info(fields, 'request completed');
    opts.recent.push({
      requestId: req.id,
      traceId: req.ctx.traceId,
      method: req.method,
      route,
      status: reply.statusCode,
      durationMs: fields.durationMs,
      timings: fields.timings,
      errorClass: req.errorClass,
      finishedAt: new Date().toISOString(),
    });
    done();
  });
}

function roundTimings(t: RequestContext['timings']) {
  return {
    acquireMs: Math.round(t.acquireMs * 10) / 10,
    queryMs: Math.round(t.queryMs * 10) / 10,
    downstreamMs: Math.round(t.downstreamMs * 10) / 10,
  };
}
