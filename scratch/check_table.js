const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy'
); // wait, it's better to just use the one configured in the app, but env vars aren't loaded easily in raw node unless I use dotenv.
// Let's use `psql` or `check2.js` which is already in scratch!
