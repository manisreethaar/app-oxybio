require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  const { data, error } = await supabase.from('sop_library').select('*'); // using admin key
  
  // also check if normal user can access it
  const { data: userData } = await supabase.auth.admin.listUsers();
  if (userData.users && userData.users.length > 0) {
      const user = userData.users[0];
      const anonClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      
      const { data: normalData, error: normalErr } = await anonClient.from('sop_library').select('*');
      console.log('Normal users access (without login):', normalData ? normalData.length : 'error', normalErr);
      
      // try to query pg_policies using admin
      // Supabase rest API doesn't expose pg_policies by default, but we can try
      const res = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/?apikey=' + process.env.SUPABASE_SERVICE_ROLE_KEY);
      // not needed, let's just see if normalData works
  }
})();
