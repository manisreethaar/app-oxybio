import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

// AQL Level II sample sizes (ISO 2859)
const AQL_TABLE = {
  '2':    { sample: 2,   accept: 0, reject: 1 },
  '3-5':  { sample: 3,   accept: 0, reject: 1 },
  '6-8':  { sample: 5,   accept: 0, reject: 1 },
  '9-15': { sample: 8,   accept: 0, reject: 1 },
  '16-25':{ sample: 13,  accept: 0, reject: 1 },
  '26-50':{ sample: 20,  accept: 1, reject: 2 },
  '51-90':{ sample: 32,  accept: 1, reject: 2 },
  '91-150':{ sample: 50, accept: 1, reject: 2 },
  '151-280':{ sample: 80, accept: 2, reject: 3 },
  '281-500':{ sample: 125, accept: 3, reject: 4 },
};

export function getAqlSampleSize(lotQty) {
  const qty = parseInt(lotQty) || 0;
  if (qty <= 1)   return AQL_TABLE['2'];
  if (qty <= 5)   return AQL_TABLE['3-5'];
  if (qty <= 8)   return AQL_TABLE['6-8'];
  if (qty <= 15)  return AQL_TABLE['9-15'];
  if (qty <= 25)  return AQL_TABLE['16-25'];
  if (qty <= 50)  return AQL_TABLE['26-50'];
  if (qty <= 90)  return AQL_TABLE['51-90'];
  if (qty <= 150) return AQL_TABLE['91-150'];
  if (qty <= 280) return AQL_TABLE['151-280'];
  return AQL_TABLE['281-500'];
}

export async function GET(request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const itemId  = searchParams.get('item_id');
    const lotQty  = searchParams.get('lot_qty'); // auto-compute AQL sample size

    if (lotQty) {
      return NextResponse.json({ success: true, data: getAqlSampleSize(lotQty) });
    }

    let q = supabase.from('aql_sampling_plans').select('*, inventory_items(name, unit, category)').order('created_at', { ascending: false });
    if (itemId) q = q.eq('item_id', itemId);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { item_id, aql_level, sample_size_pct, accept_number, reject_number, tests_required } = body;
    if (!item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 });

    const { data, error } = await supabase.from('aql_sampling_plans').upsert({
      item_id, aql_level: aql_level || 'II',
      sample_size_pct: sample_size_pct ? parseFloat(sample_size_pct) : 10,
      accept_number: accept_number ?? 0,
      reject_number: reject_number ?? 1,
      tests_required: tests_required || [],
    }, { onConflict: 'item_id' }).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
