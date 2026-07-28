import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.from('calibration_logs').insert({
      equipment_id: '00000000-0000-0000-0000-000000000000',
      calibration_date: '2026-07-28',
      log_type: 'Cleaning',
      result: 'Test'
    }).select();
    
    return NextResponse.json({ data, error });
  } catch (error) {
    return NextResponse.json({ error: error.message });
  }
}
