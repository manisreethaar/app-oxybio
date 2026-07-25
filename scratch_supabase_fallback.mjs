import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function testFallback() {
  const { data: latest } = await supabaseAdmin
    .from('growth_studies')
    .select('study_code')
    .like('study_code', 'OB-GCS-%')
    .order('study_code', { ascending: false })
    .limit(1);

  console.log("Latest:", latest);

  let nextNum = 1;
  const currentYear = new Date().getFullYear().toString().slice(-2);
  
  if (latest && latest.length > 0 && latest[0].study_code) {
    const match = latest[0].study_code.match(new RegExp(`OB-GCS-${currentYear}-(\\d{3})`));
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }
  const generatedCode = `OB-GCS-${currentYear}-${nextNum.toString().padStart(3, '0')}`;
  console.log("Generated:", generatedCode);
}

testFallback().catch(console.error);
