import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/supabase'

// ─── Singleton Supabase Client ───────────────────────────────
// createBrowserClient is called ONCE and reused across the entire
// app. This means ONE WebSocket connection instead of a new one
// per component. Never reassigned — safe for concurrent React renders.
let _client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (!_client) {
    _client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}
