export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(req) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { subscription } = await req.json();
    if (subscription === undefined) {
      return NextResponse.json({ error: 'Missing subscription object' }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    const { error } = await supabaseAdmin
      .from('employees')
      .update({ push_subscription: subscription })
      .eq('id', user.id);
      
    if (error) {
      console.error("Supabase Update Error:", error);
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Subscription Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
