import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauth' });
    
    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).single();

    // fetch 1 unread notification
    const { data: notif } = await supabase.from('notifications').select('*').eq('employee_id', emp.id).eq('is_read', false).limit(1).single();

    if (!notif) return NextResponse.json({ message: 'no unread notifs' });

    // try update
    const { data, error } = await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id).select();
    
    return NextResponse.json({ 
      attempted_id: notif.id,
      error, 
      data 
    });
  } catch (err) {
    return NextResponse.json({ error: err.message });
  }
}
