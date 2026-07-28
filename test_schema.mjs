import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function check() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/?apikey=' + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const res = await fetch(url);
  const data = await res.json();
  const docDef = data.components?.schemas?.documents || data.definitions?.documents;
  console.log(JSON.stringify(docDef, null, 2));
}
check();
