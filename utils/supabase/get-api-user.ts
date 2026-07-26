import { headers } from 'next/headers';

// Fast alternative to supabase.auth.getUser() for API route GET handlers.
//
// middleware.js already validates the JWT via supabase.auth.getUser() once for
// every request and forwards the verified identity in two trusted headers
// (x-user-id / x-user-email). Calling supabase.auth.getUser() *again* inside
// each API route is a redundant network round-trip to Supabase Auth — 200ms on
// a good day, 3-10 s when the auth service is under any load. That delay is
// what made every module appear to "infinitely load" on the first navigation.
//
// Usage (in an API route GET handler):
//   const user = getApiUser();
//   if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
//   // user.id and user.email are safe to use; middleware validated the JWT.
//
// ⚠️  Do NOT use this in POST/PUT/PATCH/DELETE handlers that perform writes —
// those should keep `supabase.auth.getUser()` for defence-in-depth, or use
// RLS through the server client. This helper is safe for reads because
// middleware already guards all protected routes.
export function getApiUser(): { id: string; email: string } | null {
  const h = headers();
  const id = h.get('x-user-id');
  const email = h.get('x-user-email');
  if (!id || !email) return null;
  return { id, email };
}
