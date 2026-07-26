import { headers } from 'next/headers';

// Reads the identity middleware.js already validated for this request (via
// supabase.auth.getUser()) off the trusted x-user-id / x-user-email headers
// it sets. middleware.js is the only place that strips/sets these headers,
// so by the time a Server Component sees them they can't have been spoofed
// by the client. Use this instead of calling supabase.auth.getUser() again
// in layouts/pages — that used to mean 3-5 redundant Supabase Auth
// round-trips stacked on every single navigation.
export function getRequestUser(): { id: string; email: string } | null {
  const h = headers();
  const id = h.get('x-user-id');
  const email = h.get('x-user-email');
  if (!id || !email) return null;
  return { id, email };
}
