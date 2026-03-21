import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';

export async function POST(req) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { subscription } = await req.json();
    if (!subscription) {
      return NextResponse.json({ error: 'Missing subscription object' }, { status: 400 });
    }

    const { error } = await supabase
      .from('employees')
      .update({ push_subscription: subscription })
      .eq('id', user.id);
      
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Subscription Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
