import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { can } from '@/lib/permissions';
import { incubationSchema } from './_validation';

export const dynamic = 'force-dynamic';

const MASTER_EMAIL = 'manisreethaar@gmail.com';

async function requireLabAccess(supabase, action = 'view') {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('id, role, full_name')
    .eq('email', user.email)
    .single();

  if (!employee && user.email !== MASTER_EMAIL) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden: Employee not found' }, { status: 403 }) };
  }

  if (user.email !== MASTER_EMAIL && !can(employee?.role, 'batches', action)) {
    return { error: NextResponse.json({ success: false, error: 'Permission Denied' }, { status: 403 }) };
  }

  return { user, employee };
}

function parsePayload(body) {
  const parsed = incubationSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.map(issue => issue.message).join(', ');
    return { error: NextResponse.json({ success: false, error: message }, { status: 400 }) };
  }

  return { data: parsed.data };
}

export async function GET(request) {
  try {
    const supabase = createClient();
    const access = await requireLabAccess(supabase, 'view');
    if (access.error) return access.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const search = searchParams.get('q');

    let query = supabase
      .from('sample_incubation_records')
      .select('*, employees(full_name), batches(batch_id)')
      .order('created_at', { ascending: false });

    if (status === 'ongoing') query = query.is('end_time', null);
    if (status === 'completed') query = query.not('end_time', 'is', null);
    if (category && category !== 'all') query = query.eq('sample_category', category);
    if (search) query = query.ilike('sample_name', `%${search}%`);

    const { data, error } = await query.limit(200);

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Sample incubation API error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const access = await requireLabAccess(supabase, 'edit');
    if (access.error) return access.error;

    const parsed = parsePayload(await request.json());
    if (parsed.error) return parsed.error;

    const { id, ...payload } = parsed.data;

    const { data, error } = await supabase
      .from('sample_incubation_records')
      .insert({ ...payload, logged_by: access.employee?.id || null })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Sample incubation API error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const supabase = createClient();
    const access = await requireLabAccess(supabase, 'edit');
    if (access.error) return access.error;

    const parsed = parsePayload(await request.json());
    if (parsed.error) return parsed.error;

    const { id, ...updates } = parsed.data;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing record id' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('sample_incubation_records')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Sample incubation API error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
