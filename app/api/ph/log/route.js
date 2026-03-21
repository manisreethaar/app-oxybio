import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get employee id
    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp || (emp.role !== 'admin' && emp.role !== 'staff')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { batch_id, ph_value, notes } = body;

    // Get batch start time
    const { data: batch } = await supabase.from('batches').select('start_time').eq('id', batch_id).single();
    if (!batch) {
      return NextResponse.json({ success: false, error: 'Batch not found' }, { status: 404 });
    }

    const elapsed = (new Date().getTime() - new Date(batch.start_time).getTime()) / (1000 * 60 * 60);

    const { data, error } = await supabase
      .from('ph_readings')
      .insert({
        batch_id,
        logged_by: emp.id,
        ph_value,
        time_elapsed_hours: elapsed,
        notes
      })
      .select()
      .single();

    if (error) throw error;

    // Check if deviation to trigger email (Mocked Resend for now, or use Supabase trigger)
    // The trigger sets is_deviation automatically but we can check here to send emails
    if (ph_value < 4.2 || ph_value > 4.5) {
        // Send email to admins logic here
        await supabase.from('batches').update({ status: 'deviation' }).eq('id', batch_id);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
