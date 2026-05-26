import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

async function generatePrepCode(supabase, type) {
  const year = new Date().getFullYear();
  const prefix = `OB-CB-${year}-`;
  const { data: last } = await supabase
    .from('cell_bank_preparations')
    .select('prep_code')
    .like('prep_code', `${prefix}%`)
    .order('prep_code', { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (last?.prep_code) {
    const n = parseInt(last.prep_code.split('-').pop(), 10);
    if (!isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

export const dynamic = 'force-dynamic';

const MASTER_EMAIL = 'manisreethaar@gmail.com';

async function requireAccess(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
  if (!emp && user.email !== MASTER_EMAIL) return { error: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }) };
  return { user, emp };
}

const strainSchema = z.object({
  type: z.literal('strain'),
  name: z.string().min(1),
  source_type: z.enum(['MTCC', 'NCIM', 'Isolated', 'Other']),
  formulation_id: z.string().uuid().optional().nullable(),
  accession_number: z.string().optional().nullable(),
  isolation_source: z.string().optional().nullable(),
  received_date: z.string().optional().nullable(),
  taxonomy: z.string().optional().nullable(),
  strain_short_code: z.string().max(4).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const prepSchema = z.object({
  type: z.enum(['MCB', 'WCB', 'RCB']),
  strain_id: z.string().uuid(),
  parent_id: z.string().uuid().optional().nullable(),
  formulation_id: z.string().uuid().optional().nullable(),
  prep_code: z.string().optional().nullable(),
  passage_number: z.coerce.number().int().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(request) {
  try {
    const supabase = createClient();
    const access = await requireAccess(supabase);
    if (access.error) return access.error;

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'preparations';
    const strainId = searchParams.get('strain_id');

    if (view === 'strains') {
      const { data, error } = await supabase
        .from('cell_bank_strains')
        .select('*, employees(full_name), linked_formulation:formulations!cell_bank_strains_formulation_id_fkey(id, code, name, version, category, status)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return NextResponse.json({ success: true, data });
    }

    let query = supabase
      .from('cell_bank_preparations')
      .select(`
        id, type, prep_code, status, passage_number, vial_count, notes,
        formulation_id, created_at, completed_at,
        linked_formulation:formulations!cell_bank_preparations_formulation_id_fkey(id, code, name, version, category, status),
        cell_bank_strains(id, name, source_type, accession_number, formulation_id, linked_formulation:formulations!cell_bank_strains_formulation_id_fkey(id, code, name, version, category, status)),
        parent:parent_id(id, prep_code, type),
        employees(full_name)
      `)
      .order('created_at', { ascending: false });

    if (strainId) query = query.eq('strain_id', strainId);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const access = await requireAccess(supabase);
    if (access.error) return access.error;

    const body = await request.json();

    if (body.type === 'strain') {
      const parsed = strainSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues.map(i => i.message).join(', ') }, { status: 400 });
      const { type: _t, ...fields } = parsed.data;
      const { data, error } = await supabase.from('cell_bank_strains').insert({ ...fields, created_by: access.emp?.id }).select().single();
      if (error) throw error;
      return NextResponse.json({ success: true, data });
    }

    // preparation
    const parsed = prepSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues.map(i => i.message).join(', ') }, { status: 400 });
    const prepCode = parsed.data.prep_code?.trim() || await generatePrepCode(supabase, parsed.data.type);
    let formulationId = parsed.data.formulation_id || null;
    if (!formulationId) {
      const { data: strain } = await supabase
        .from('cell_bank_strains')
        .select('formulation_id')
        .eq('id', parsed.data.strain_id)
        .maybeSingle();
      formulationId = strain?.formulation_id || null;
    }
    const { data, error } = await supabase.from('cell_bank_preparations').insert({
      ...parsed.data,
      formulation_id: formulationId,
      prep_code: prepCode,
      status: 'In Progress',
      step_data: {},
      created_by: access.emp?.id,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
