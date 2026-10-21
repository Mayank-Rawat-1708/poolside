// Writes the end-of-test summary to stdout and, when RESULTS_DIR is set,
// to <RESULTS_DIR>/<name>.json and .txt so `make evidence` can keep it.
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

export function summaryFor(name) {
  return (data) => {
    const text = textSummary(data, { indent: ' ', enableColors: false });
    const out = { stdout: text };
    const dir = __ENV.RESULTS_DIR;
    if (dir) {
      out[`${dir}/${name}.json`] = JSON.stringify(data, null, 2);
      out[`${dir}/${name}.txt`] = text;
    }
    return out;
  };
}
