import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import type { IncomingMessage } from 'node:http';
import { stdTimeFunctions } from 'pino';
import { runWithContext } from './request-context.js';

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
  }
}

export function registerRequestLogging(app: FastifyInstance) {
  // Callback-style hook: everything after done() runs inside the context.
  app.addHook('onRequest', (req, reply, done) => {
    reply.header('x-request-id', req.id);
    runWithContext({ requestId: req.id }, done);
  });

  app.addHook('onResponse', (req, reply, done) => {
    const fields = {
      method: req.method,
      route: req.routeOptions.url ?? 'unmatched',
      status: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime * 10) / 10,
      errorClass: req.errorClass,
    };
    if (reply.statusCode >= 500) req.log.error(fields, 'request completed');
    else req.log.info(fields, 'request completed');
    done();
  });
}
