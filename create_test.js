import fs from 'fs';

let code = fs.readFileSync('test_queries2.mjs', 'utf-8');
code = code.replace("console.log('Starting batches_active...');", `
  console.log('Starting insert...');
  const { data, error } = await supabase.from('titration_logs').insert({ 
    source_type: 'standalone', 
    sample_name: 'test user', 
    acid_type: 'Lactic Acid', 
    equivalent_weight: 90.08, 
    titrant_normality: 0.1, 
    sample_volume_ml: 10, 
    initial_burette_ml: 0, 
    final_burette_ml: 2, 
    logged_by: '19c5a607-a003-456a-a9b4-551925daad80' 
  }).select();
  console.log('Insert Error:', error);
  console.log('Starting batches_active...');
`);
fs.writeFileSync('test_queries6.mjs', code);
