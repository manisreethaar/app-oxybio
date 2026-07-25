const fs = require('fs');

let content = fs.readFileSync('app/api/lab-notebook/[id]/route.js', 'utf8');

// Add import
content = content.replace(
  "import { createClient } from '@/utils/supabase/server';",
  "import { createClient } from '@/utils/supabase/server';\nimport { createAdminClient } from '@/utils/supabase/admin';"
);

// In PUT
content = content.replace(
  /const \{ data, error \} = await supabase\s*\n\s*\.from\('lab_notebook_entries'\)\s*\n\s*\.update\(updates\)\s*\n\s*\.eq\('id', id\)/g,
  "const adminSupabase = createAdminClient();\n    const { data, error } = await adminSupabase\n      .from('lab_notebook_entries')\n      .update(updates)\n      .eq('id', id)"
);

// In PATCH
content = content.replace(
  /const \{ data, error \} = await supabase\s*\n\s*\.from\('lab_notebook_entries'\)\s*\n\s*\.update\(\{\s*\n\s*status: 'Countersigned',/g,
  "const adminSupabase = createAdminClient();\n    const { data, error } = await adminSupabase\n      .from('lab_notebook_entries')\n      .update({\n        status: 'Countersigned',"
);

// In DELETE
content = content.replace(
  /if \(permanent\) \{\s*\n\s*const \{ error \} = await supabase\.from\('lab_notebook_entries'\)\.delete\(\)\.eq\('id', id\);/g,
  "const adminSupabase = createAdminClient();\n\n    if (permanent) {\n      const { error } = await adminSupabase.from('lab_notebook_entries').delete().eq('id', id);"
);

content = content.replace(
  /const \{ error \} = await supabase\s*\n\s*\.from\('lab_notebook_entries'\)\s*\n\s*\.update\(\{ archived_at: new Date\(\)\.toISOString\(\), archived_by: emp\.id \}\)\s*\n\s*\.eq\('id', id\);/g,
  "const { error } = await adminSupabase\n      .from('lab_notebook_entries')\n      .update({ archived_at: new Date().toISOString(), archived_by: emp.id })\n      .eq('id', id);"
);

fs.writeFileSync('app/api/lab-notebook/[id]/route.js', content, 'utf8');
