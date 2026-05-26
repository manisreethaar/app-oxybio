import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sampleId = searchParams.get('sampleId');
    const flaskId = searchParams.get('flaskId');
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    const { data, error } = await sb.from('batch_flask_qc_tests').insert([{
      sample_id: sampleId, flask_id: flaskId,
      test_name: 'test', target_spec: 'test',
      result_unit: 'test', pass_fail: 'Pending'
    }]);
    
    return NextResponse.json({ error, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
