import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import type { IncomingMessage } from 'node:http';
import { stdTimeFunctions } from 'pino';
import { httpRequestDuration } from './metrics.js';
import type { PoolStats } from '../db/instrumented-pool.js';
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
    requestIdLogLabel: 'requestId',
    // We emit one summary line per request ourselves (see below).
    disableRequestLogging: true,
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    errorClass?: string;
    ctx: RequestContext;
  }
}

export function registerHttpHooks(app: FastifyInstance, opts: { poolStats: () => PoolStats }) {
  // Callback-style hook: everything after done() runs inside the context.
  app.addHook('onRequest', (req, reply, done) => {
    reply.header('x-request-id', req.id);
    req.ctx = newContext(req.id);
    runWithContext(req.ctx, done);
  });

  app.addHook('onResponse', (req, reply, done) => {
    // Use the route template, not the raw URL, to keep label cardinality bounded.
    const route = req.routeOptions.url ?? 'unmatched';
    if (route !== '/metrics') {
      httpRequestDuration
        .labels(req.method, route, String(reply.statusCode))
        .observe(reply.elapsedTime / 1000);
    }

    const fields = {
      method: req.method,
      route,
      status: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime * 10) / 10,
      errorClass: req.errorClass,
      // Where the time went, and the pool's state as this request finished.
      timings: roundTimings(req.ctx.timings),
      pool: opts.poolStats(),
    };
    if (reply.statusCode >= 500) req.log.error(fields, 'request completed');
    else req.log.info(fields, 'request completed');
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
