import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { isMasterAdmin } from '@/lib/permissions';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';

export const dynamic = 'force-dynamic';

const ALLOWED_KEYS = ['experiment_types', 'sku_targets', 'document_categories'];

async function getAdminEmp(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { authError: 'Unauthorized' };
  const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
  const isAdmin = ['admin', 'ceo', 'cto'].includes(emp?.role) || isMasterAdmin(user.email);
  return { user, emp, isAdmin };
}

// GET — returns both experiment_types and sku_targets (all authenticated users)
export async function GET() {
  try {
    const supabase = createClient();
    const user = await getApiUserOrFallback(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error: dbErr } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ALLOWED_KEYS);
    if (dbErr) throw dbErr;

    const result = {
      experiment_types: [
        { value: 'F1', label: 'F1 — Ragi only' },
        { value: 'F2', label: 'F2 — Ragi + Kavuni' },
        { value: 'PROTO', label: 'PROTO — Prototype' },
        { value: 'SHELF', label: 'SHELF — Shelf-life run' },
      ],
      sku_targets: [
        { value: 'Unassigned', label: 'Unassigned' },
        { value: 'CLARITY', label: 'CLARITY' },
        { value: 'MOMENTUM', label: 'MOMENTUM' },
        { value: 'VITALITY', label: 'VITALITY' },
      ],
      document_categories: [
        { value: 'Fermentation', label: 'Fermentation' },
        { value: 'QC', label: 'QC' },
        { value: 'Sanitation', label: 'Sanitation' },
        { value: 'Safety', label: 'Safety' },
      ],
    };

    for (const row of (data || [])) {
      try { result[row.key] = JSON.parse(row.value); } catch {}
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST — upsert one setting key (admin only)
// Body: { key: 'experiment_types' | 'sku_targets', options: [{value, label}, ...] }
export async function POST(request) {
  try {
    const supabase = createClient();
    const { authError, emp, isAdmin } = await getAdminEmp(supabase);
    if (authError) return NextResponse.json({ error: authError }, { status: 401 });
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { key, options } = await request.json();
    if (!ALLOWED_KEYS.includes(key)) return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
    if (!Array.isArray(options) || options.length === 0)
      return NextResponse.json({ error: 'options must be a non-empty array' }, { status: 400 });

    // Validate each option has value and label
    for (const o of options) {
      if (!o.value?.trim() || !o.label?.trim())
        return NextResponse.json({ error: 'Each option needs a value and label' }, { status: 400 });
    }

    const { error: upsertErr } = await supabase.from('app_settings').upsert({
      key,
      value: JSON.stringify(options),
      description: key === 'experiment_types'
        ? 'Experiment type options shown in the New Batch form'
        : 'SKU target options shown in the New Batch form',
      updated_by: emp?.id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    if (upsertErr) throw upsertErr;
    return NextResponse.json({ success: true, data: options });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
