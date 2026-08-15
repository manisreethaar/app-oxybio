export const dynamic = 'force-dynamic';
import { createClient as createAnonClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { can, isMasterAdmin } from '@/lib/permissions';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request, { params }) {
  try {
    const authClient = createAnonClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { decision, review_notes } = await request.json();
    if (!['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ success: false, error: 'Decision must be "approved" or "rejected".' }, { status: 400 });
    }

    const db = adminClient();
    const { data: emp } = await db.from('employees').select('id, role, custom_permissions').eq('email', user.email).single();
    if (!emp) {
      return NextResponse.json({ success: false, error: 'Employee profile not found.' }, { status: 404 });
    }
    if (!can(emp.role, 'rnd_experiments', 'review', emp.custom_permissions) && !isMasterAdmin(user.email)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions to review experiments.' }, { status: 403 });
    }

    const { data: experiment, error: fetchErr } = await db
      .from('rnd_experiments')
      .select('id, status')
      .eq('id', params.id)
      .single();
    if (fetchErr || !experiment) {
      return NextResponse.json({ success: false, error: 'Experiment not found.' }, { status: 404 });
    }
    if (experiment.status !== 'pending_review') {
      return NextResponse.json({ success: false, error: `Experiment already ${experiment.status}.` }, { status: 409 });
    }

    const { error: updateErr } = await db
      .from('rnd_experiments')
      .update({
        status: decision,
        reviewed_by: emp.id,
        reviewed_at: new Date().toISOString(),
        review_notes: review_notes || null,
      })
      .eq('id', params.id);
    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true, status: decision });
  } catch (err) {
    console.error('RND Experiment Review Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
