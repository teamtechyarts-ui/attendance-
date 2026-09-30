import { performance } from 'perf_hooks';

const BASE_URL = 'http://localhost:4000';

async function timeRequest(name, url, options = {}) {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE_URL}${url}`, options);
    const duration = performance.now() - start;
    const data = await res.json();
    return { name, duration: Math.round(duration), status: res.status, success: res.ok, data };
  } catch (err) {
    const duration = performance.now() - start;
    return { name, duration: Math.round(duration), status: 'ERR', success: false, error: err.message };
  }
}

async function run() {
  console.log('--- Profiling Backend APIs ---');

  // Let's test login with employee and admin if credentials known, or check existing sessions
  // Let's check /health first
  const health = await timeRequest('GET /health', '/health');
  console.log(health);

  // We can also test auth if we test with an email from DB or check login
}

run();
