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

    const { pin, currentPin } = await request.json();

    if (!pin || pin.length < 4 || pin.length > 6) {
      return NextResponse.json({ error: 'PIN must be between 4 and 6 characters' }, { status: 400 });
    }

    // Changing an existing PIN requires proving the current one first — this
    // guards the e-signature PIN (used for 21 CFR Part 11 signing) against a
    // logged-in session alone being enough to silently take it over.
    if (emp.esignature_pin_hash) {
      if (!currentPin) {
        return NextResponse.json({ error: 'Current PIN is required to change your PIN' }, { status: 400 });
      }
      const { data: isValid, error: verifyError } = await supabase.rpc('verify_pin', {
        user_id: emp.id,
        pin: currentPin
      });
      if (verifyError) throw verifyError;
      if (!isValid) {
        return NextResponse.json({ error: 'Current PIN is incorrect' }, { status: 401 });
      }
    }

    // Call the RPC function to hash and store the PIN
    const { error: rpcError } = await supabase.rpc('set_pin', {
      user_id: emp.id,
      pin: pin
    });

    if (rpcError) throw rpcError;

    return NextResponse.json({ success: true, message: 'PIN configured successfully' });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
