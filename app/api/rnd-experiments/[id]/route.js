export const dynamic = 'force-dynamic';
import { createClient as createAnonClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(request, { params }) {
  try {
    const authClient = createAnonClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const db = adminClient();
    const { data, error } = await db
      .from('rnd_experiments')
      .select(`
        id, experiment_id, title, status, target_volume_ml, target_ph, target_brix, notes,
        review_notes, reviewed_at, created_at,
        created_by_employee:created_by(full_name),
        reviewed_by_employee:reviewed_by(full_name),
        rnd_experiment_ingredients(id, item_name, amount, unit)
      `)
      .eq('id', params.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, error: 'Experiment not found' }, { status: 404 });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('RND Experiment Get Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
