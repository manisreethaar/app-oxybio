const fs = require('fs');
const env = fs.readFileSync('e:/OXYBIO/.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...valParts] = line.split('=');
  if (key && valParts.length) acc[key] = valParts.join('=').trim().replace(/^\"|\"$/g, '');
  return acc;
}, {});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function runAudit() {
  const query = `
    WITH table_rls AS (
        SELECT 
            c.relname AS tablename,
            c.relrowsecurity AS rls_enabled,
            c.relforcerowsecurity AS rls_forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' 
          AND c.relkind = 'r'
    ),
    table_policies AS (
        SELECT 
            tablename,
            json_agg(json_build_object(
                'policyname', policyname,
                'roles', roles,
                'cmd', cmd,
                'qual', qual,
                'with_check', with_check
            )) AS policies
        FROM pg_policies 
        WHERE schemaname = 'public'
        GROUP BY tablename
    )
    SELECT 
        tr.tablename,
        tr.rls_enabled,
        tr.rls_forced,
        COALESCE(tp.policies, '[]'::json) AS policies
    FROM table_rls tr
    LEFT JOIN table_policies tp ON tr.tablename = tp.tablename
    ORDER BY tr.tablename;
  `;

  const { data, error } = await supabase.rpc('exec_sql', { query });
  
  if (error) {
    console.error('Error running audit:', error);
    return;
  }

  let missingRLS = [];
  let permissivePolicies = [];

  for (const table of data) {
    if (!table.rls_enabled) {
      missingRLS.push(table.tablename);
    } else {
      for (const pol of table.policies) {
        // Look for policies that apply to 'public' or 'anon' without a good using clause, or simply just note them
        const roles = pol.roles || [];
        if (roles.includes('public') || roles.includes('anon') || roles.length === 0) {
            // Check if qual is too simple like 'true' or missing
            if (!pol.qual || pol.qual === '(true)' || pol.qual === 'true') {
                 permissivePolicies.push({ table: table.tablename, policy: pol.policyname, roles, cmd: pol.cmd, qual: pol.qual });
            }
        }
      }
    }
  }

  console.log("=== RLS AUDIT REPORT ===");
  console.log(`\n🚨 Tables completely missing RLS (${missingRLS.length}):`);
  missingRLS.forEach(t => console.log(` - ${t}`));

  console.log(`\n⚠️ Permissive/Public Policies found (${permissivePolicies.length}):`);
  permissivePolicies.forEach(p => {
    console.log(` - ${p.table} -> ${p.policy} (Cmd: ${p.cmd}, Roles: ${p.roles}, Qual: ${p.qual})`);
  });
  
  // Write full output to file
  fs.writeFileSync('e:/OXYBIO/scratch/rls_audit_full_results.json', JSON.stringify(data, null, 2));
  console.log('\nFull results saved to scratch/rls_audit_full_results.json');
}

runAudit();
