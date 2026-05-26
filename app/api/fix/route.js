import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  const adminDb = createAdminClient();
  const { data, error } = await adminDb
    .from('formulations')
    .update({ base_volume_ml: 200 })
    .in('code', ['R02', 'R03'])
    .select('code, base_volume_ml');
    
  return NextResponse.json({ data, error });
}
