const fs = require('fs');

function loadEnv() {
  return Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=');
        return [
          line.slice(0, index),
          line.slice(index + 1).replace(/^['"]|['"]$/g, ''),
        ];
      })
  );
}

async function main() {
  const env = loadEnv();
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!json) {
    console.log(text.slice(0, 500));
    return;
  }
  const paths = Object.keys(json.paths || {});
  console.log(JSON.stringify({
    status: res.status,
    tableCount: paths.length,
    paths: paths.slice(0, 50),
    hasBatches: paths.includes('/batches'),
    batchLike: paths.filter(path => path.toLowerCase().includes('batch')).slice(0, 50),
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
