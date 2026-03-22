import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('formulations')
      .select('*')
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
    }

    const { data, error } = await supabase.from('formulations').insert({
      code, name, ingredients, notes,
      version: nextVersion,
      created_by: user.id,
      base_version_id: base_version_id || null
    }).select().single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
