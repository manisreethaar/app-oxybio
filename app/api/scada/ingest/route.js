import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    // SCADA API Keys validation
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid API Key' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    const supabaseAdmin = createAdminClient();
    
    // Verify API Key
    const { data: apiKey } = await supabaseAdmin.from('api_keys').select('id, is_revoked').eq('key_hash', token).single();
    if (!apiKey || apiKey.is_revoked) {
      return NextResponse.json({ error: 'Unauthorized: Invalid or revoked API Key' }, { status: 403 });
    }

    const { equipment_id, batch_id, sensor_type, sensor_value, unit } = await request.json();

    if (!equipment_id || !sensor_type || sensor_value === undefined) {
      return NextResponse.json({ error: 'Missing required SCADA payload fields' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from('scada_streams').insert({
      equipment_id,
      batch_id,
      sensor_type,
      sensor_value,
      unit,
      timestamp: new Date().toISOString()
    }).select().single();

    if (error) throw error;
    
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
