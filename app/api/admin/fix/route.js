import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('role', 'admin');

    if (error || !data || data.length === 0) return NextResponse.json({ error: 'No admin found' });

    const adminId = data[0].id;

    const { error: updateError } = await supabase
      .from('employees')
      .update({ 
        full_name: 'Mr. Manisreethaar Selvaraj',
        employee_code: 'O2B-CE-001',
        designation: 'Chief of Excellence (COE)'
      })
      .eq('id', adminId);

    if (updateError) return NextResponse.json({ error: updateError });
    return NextResponse.json({ success: true, message: 'Admin updated to O2B-CE-001' });
  } catch (err) {
    return NextResponse.json({ error: err.message });
  }
}
