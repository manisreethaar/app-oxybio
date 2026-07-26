import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId');
    const category = searchParams.get('category');

    if (!employeeId || !category) {
      return NextResponse.json({ error: 'Missing employeeId or category' }, { status: 400 });
    }

    // Find the latest active SOP for this category
    const { data: latestSOP, error: sopError } = await supabase
      .from('sop_library')
      .select('id, version')
      .eq('category', category)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sopError) throw sopError;
    if (!latestSOP) return NextResponse.json({ isTrained: true, message: 'No active SOP for this category' });

    // Check if this employee has acknowledged THIS specific SOP ID
    const { data: ack, error: ackError } = await supabase
      .from('sop_acknowledgements')
      .select('id, acknowledged_at')
      .eq('sop_id', latestSOP.id)
      .eq('employee_id', employeeId)
      .maybeSingle();

    if (ackError) throw ackError;

    return NextResponse.json({
      isTrained: !!ack,
      sopId: latestSOP.id,
      version: latestSOP.version,
      acknowledgedAt: ack?.acknowledged_at || null
    });
  } catch (error) {
    console.error('Training Check Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

