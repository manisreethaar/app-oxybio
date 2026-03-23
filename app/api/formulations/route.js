import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('formulations')
      .select('*')
      .eq('status', 'active') // Only show active recipes defaults
      .order('version', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { code, name, ingredients, notes, base_version_id } = body;

    let nextVersion = 1;
    if (base_version_id) {
      const { data: base } = await supabase.from('formulations').select('version').eq('id', base_version_id).single();
      if (base) nextVersion = base.version + 1;
    } else {
      const { data: latest } = await supabase.from('formulations')
        .select('version')
        .eq('code', code)
        .order('version', { ascending: false })
        .limit(1)
        .single();
      if (latest) nextVersion = latest.version + 1;
    }

    const { data, error } = await supabase.from('formulations').insert({
      code, name, ingredients, notes,
      version: nextVersion,
      created_by: user.id,
      base_version_id: base_version_id || null,
      status: 'active'
    }).select().single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, status } = await request.json();
    if (!id || !status) return NextResponse.json({ error: 'Missing ID or Status' }, { status: 400 });

    const { data, error } = await supabase
      .from('formulations')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
