const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=\"(.*?)\"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=\"(.*?)\"/)[1];
fetch(url + '/rest/v1/formulations?select=*&limit=1', { headers: { apikey: key, Authorization: 'Bearer ' + key }})
.then(r => r.json()).then(j => console.log(j));
