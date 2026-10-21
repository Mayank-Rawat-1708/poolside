// Shared traffic mix for all k6 scenarios.
// 70% create order, 20% read a recent order, 10% health check: the reads
// matter because they share the DB pool with writes.
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

export const API = __ENV.API_URL || 'http://localhost:3000';
export const DOWNSTREAM = __ENV.DOWNSTREAM_URL || 'http://localhost:4001';
export const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || 'local-dev-admin-token';

// Client-side timeout, like a mobile app or upstream proxy would have.
const params = (endpoint) => ({ timeout: '10s', tags: { endpoint } });

const responses = new Counter('responses_by_status');
const recentIds = [];

function record(res, endpoint) {
  // status 0 = client timeout / connection error
  responses.add(1, { status: String(res.status), endpoint });
}

export function trafficMix() {
  const roll = Math.random();
  if (roll < 0.7 || recentIds.length === 0) {
    const res = http.post(
      `${API}/orders`,
      JSON.stringify({ customerId: `cust_${__VU}`, amountCents: 1000 + (__ITER % 500) }),
      { ...params('create_order'), headers: { 'content-type': 'application/json' } },
    );
    record(res, 'create_order');
    check(res, { 'create 201': (r) => r.status === 201 });
    if (res.status === 201) {
      recentIds.push(res.json('id'));
      if (recentIds.length > 50) recentIds.shift();
    }
  } else if (roll < 0.9) {
    const id = recentIds[Math.floor(Math.random() * recentIds.length)];
    const res = http.get(`${API}/orders/${id}`, params('get_order'));
    record(res, 'get_order');
    check(res, { 'get 200': (r) => r.status === 200 });
  } else {
    const res = http.get(`${API}/health`, params('health'));
    record(res, 'health');
    check(res, { 'health 200': (r) => r.status === 200 });
  }
}

export function setDownstream(behaviour) {
  const res = http.put(`${DOWNSTREAM}/admin/latency`, JSON.stringify(behaviour), {
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  if (res.status !== 200) throw new Error(`could not configure downstream: ${res.status}`);
}

// p(99) is not in k6's default summary; the evidence table needs it.
export const summaryTrendStats = ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'];

// Per-endpoint thresholds make k6 print per-endpoint latency and error rate.
export const thresholds = {
  http_req_failed: ['rate<0.01'],
  'http_req_duration{endpoint:create_order}': ['p(95)<1000'],
  'http_req_duration{endpoint:get_order}': ['p(95)<200'],
  'http_req_duration{endpoint:health}': ['p(95)<200'],
  'http_req_failed{endpoint:create_order}': ['rate<0.01'],
  'http_req_failed{endpoint:get_order}': ['rate<0.01'],
  'http_req_failed{endpoint:health}': ['rate<0.01'],
  // Always-passing thresholds, only so the summary prints a count per status.
  // status 0 = client-side timeout or connection error.
  'responses_by_status{status:201}': ['count>=0'],
  'responses_by_status{status:200}': ['count>=0'],
  'responses_by_status{status:500}': ['count>=0'],
  'responses_by_status{status:503}': ['count>=0'],
  'responses_by_status{status:0}': ['count>=0'],
};
