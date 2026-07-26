import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get employee id — lookup by email (CEO/CTO may have been manually inserted)
    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    const ALLOWED_ROLES = ['admin', 'ceo', 'cto', 'staff', 'research_fellow', 'scientist', 'intern'];
    if (!emp || !ALLOWED_ROLES.includes(emp.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { batch_id, ph_value, notes } = body;

    // Input validation: ph_value must be a finite number in a realistic biological range
    const phNum = parseFloat(ph_value);
    if (!batch_id || isNaN(phNum) || phNum < 1.0 || phNum > 14.0) {
      return NextResponse.json({ success: false, error: 'Invalid input. pH must be a number between 1.0 and 14.0.' }, { status: 400 });
    }

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

    // Check if deviation to trigger alert and update status
    // Thresholds: pH < 4.2 or pH > 4.5
    if (ph_value < 4.2 || ph_value > 4.5) {
        const { error: updateError } = await supabase
          .from('batches')
          .update({ 
            status: 'deviation',
            updated_at: new Date().toISOString() 
          })
          .eq('id', batch_id);
        
        if (updateError) {
          console.error("Deviation status sync failed:", updateError);
          // We don't throw here to avoid losing the log entry, but we log the sync failure
        }
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
