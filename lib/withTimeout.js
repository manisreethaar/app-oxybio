// Wraps a promise so it rejects after `ms` instead of hanging forever.
//
// supabase-js requests over a stalled/dead connection (flaky wifi, a sleeping
// laptop waking up, a Supabase connection-pool stall) can sit pending with no
// browser-level timeout of their own. A bare `await Promise.all([...])` in a
// mount effect then never resolves *or* rejects, so `finally { setLoading(false) }`
// never runs and the page is stuck on its loading state until the user does a
// hard refresh — this is what was happening across most modules in the app.
// Race every such fetch against this to guarantee the catch/finally fires.
export function withTimeout(promise, ms = 20000, message = 'Request timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
