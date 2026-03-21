import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const supabase = createClient();
  const { id } = params;
  const { employee_id, signature_text } = await request.json();

  if (!employee_id || !signature_text) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Get IP and User Agent for audit trail
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const ua = request.headers.get('user-agent') || 'Unknown';

  const { data, error } = await supabase
    .from('sop_acknowledgements')
    .insert([
      {
        sop_id: id,
        employee_id,
        signature_text,
        ip_address: ip,
        user_agent: ua,
        acknowledged_at: new Date().toISOString()
      }
    ])
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data[0]);
}
