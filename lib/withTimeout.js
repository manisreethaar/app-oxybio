// Wraps a promise so it rejects after `ms` instead of hanging forever.
//
// supabase-js requests over a stalled/dead connection (flaky wifi, a sleeping
// laptop waking up, a Supabase connection-pool stall) can sit pending with no
// browser-level timeout of their own. A bare `await Promise.all([...])` in a
// mount effect then never resolves *or* rejects, so `finally { setLoading(false) }`
// never runs and the page is stuck on its loading state until the user does a
// hard refresh — this is what was happening across most modules in the app.
// Race every such fetch against this to guarantee the catch/finally fires.
export function withTimeout(promise, ms = 45000, message = 'Request timed out') {
  let timer;
  return Promise.race([
    promise.then((result) => {
      clearTimeout(timer);
      return result;
    }).catch((err) => {
      clearTimeout(timer);
      throw err;
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('oxybio-timeout', { detail: { message } }));
        }
        reject(new Error(message));
      }, ms);
    }),
  ]);
}

// Retries a transient failure (a dropped connection, a slow auth round-trip,
// a momentary Supabase hiccup) before giving up. Without this, a single bad
// request makes a page's data look permanently empty rather than the blip it
// actually was -- pass fn as a function so each attempt re-runs the request.
export async function withRetry(fn, attempts = 2, delayMs = 1500) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
