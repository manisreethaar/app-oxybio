import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client — bypasses RLS.
 * Use ONLY in server-side API routes for cross-user operations
 * (e.g. inserting a notification for a different user).
 * Never expose this to the client.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
