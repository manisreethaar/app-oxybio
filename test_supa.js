const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321', 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy'
);

// We don't have the keys here unless I load them from .env.local
