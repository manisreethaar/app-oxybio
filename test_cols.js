const {createClient} = require('@supabase/supabase-js');
require('dotenv').config({path: '.env.local'});
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
s.from('inventory_items').select('*').limit(1).then(r => console.log(Object.keys(r.data[0] || {})));
