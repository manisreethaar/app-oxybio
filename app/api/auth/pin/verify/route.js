export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id, esignature_pin_hash').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'User not found in employees table' }, { status: 403 });

    const { pin } = await request.json();
    if (!pin) {
      return NextResponse.json({ error: 'PIN is required' }, { status: 400 });
    }

    if (!emp.esignature_pin_hash) {
      return NextResponse.json({ error: 'PIN not configured', not_configured: true }, { status: 403 });
    }

    // Call the RPC function to verify the PIN
    const { data: isValid, error: rpcError } = await supabase.rpc('verify_pin', {
      user_id: emp.id,
      pin: pin
    });

    if (rpcError) throw rpcError;

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
    }

    return NextResponse.json({ success: true, message: 'PIN verified successfully' });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
