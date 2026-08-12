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
  // Pass-through: We've removed the artificial Promise.race timeout because it was causing
  // React state to get stuck in "Loading..." permanently when waking from sleep.
  // Network timeouts are now handled cleanly at the window.fetch level in AuthContext.
  return promise;
}

// Retries a transient failure (a dropped connection, a slow auth round-trip,
// a momentary Supabase hiccup) before giving up. Without this, a single bad
// request makes a page's data look permanently empty rather than the blip it
// actually was -- pass fn as a function so each attempt re-runs the request.
export async function withRetry(fn, attempts = 3, delayMs = 1500) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fn();
      
      // Supabase .select() doesn't throw on network errors, it returns { error }
      const isSupaError = (r) => r && typeof r === 'object' && r.error;
      
      if (Array.isArray(res) && res.some(isSupaError)) {
        lastErr = new Error(res.find(isSupaError).error.message || 'Supabase request failed');
      } else if (isSupaError(res)) {
        lastErr = new Error(res.error.message || 'Supabase request failed');
      } else {
        return res; // Success
      }
    } catch (err) {
      lastErr = err;
    }
    
    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  throw lastErr;
}
