import { createClient as createAnonClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Service-role client — bypasses RLS entirely (server-side only)
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request, { params }) {
  try {
    // 1. Verify caller is authenticated
    const authClient = createAnonClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { batchId } = params;
    const body = await request.json();
    const { flask_id, yield_volume_ml, bottles_produced, bottle_volume_ml, release_notes } = body;

    if (!flask_id) return NextResponse.json({ error: 'flask_id is required' }, { status: 400 });
    if (!batchId)  return NextResponse.json({ error: 'batchId is required' },  { status: 400 });

    // 2. Check role (admin client so RLS doesn't block the employees lookup)
    const db = adminClient();
    const { data: emp, error: empErr } = await db
      .from('employees')
      .select('id, role')
      .eq('email', user.email)
      .single();

    if (empErr || !emp) {
      return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 });
    }
    if (!['ceo', 'admin', 'cto'].includes(emp.role)) {
      return NextResponse.json({ error: 'Release requires CEO / Admin role' }, { status: 403 });
    }

    // 3. Upsert release record (admin client → RLS bypassed)
    // The live table may be missing newer columns (batch_id, yield_volume_ml, etc.) if the
    // schema migration hasn't been applied yet.  Try the full payload first; on a PostgREST
    // schema-cache column error fall back to the minimal safe set so the release still lands.
    const fullPayload = {
      flask_id,
      released_by:      emp.id,
      release_date:     new Date().toISOString(),
      yield_volume_ml:  yield_volume_ml  ?? null,
      bottles_produced: bottles_produced ?? null,
      bottle_volume_ml: bottle_volume_ml ?? null,
      release_notes:    release_notes    ?? null,
    };

    let { error: relErr } = await db
      .from('batch_flask_release_record')
      .upsert(fullPayload, { onConflict: 'flask_id' });

    if (relErr && (relErr.code === 'PGRST204' || relErr.message?.includes('schema cache'))) {
      // Columns not yet in the live schema — retry with only the guaranteed-safe set
      console.warn('[release] full upsert hit schema gap, retrying minimal:', relErr.message);
      const minimalPayload = {
        flask_id,
        released_by:   emp.id,
        release_date:  new Date().toISOString(),
        release_notes: release_notes ?? null,
      };
      const { error: minErr } = await db
        .from('batch_flask_release_record')
        .upsert(minimalPayload, { onConflict: 'flask_id' });
      relErr = minErr ?? null;
    }

    if (relErr) {
      console.error('[release] upsert error:', relErr);
      return NextResponse.json({ error: relErr.message }, { status: 500 });
    }

    // 4. Mark flask as released
    const { error: flaskUpdateErr } = await db.from('batch_flasks')
      .update({ status: 'released', current_stage: 'released' })
      .eq('id', flask_id);
    if (flaskUpdateErr) {
      console.error('[release] flask update error:', flaskUpdateErr);
      return NextResponse.json({ error: flaskUpdateErr.message }, { status: 500 });
    }

    // 5. Check if ALL non-rejected flasks are now released → close out batch
    const { data: allFlasks } = await db
      .from('batch_flasks')
      .select('id, status, current_stage')
      .eq('batch_id', batchId);

    const nonRejected = (allFlasks || []).filter(f => f.status !== 'rejected');
    const allReleased  = nonRejected.length > 0 && nonRejected.every(f =>
      f.status === 'released' || f.current_stage === 'released'
    );

    if (allReleased) {
      const { error: batchUpdateErr } = await db.from('batches')
        .update({ status: 'released', current_stage: 'released' })
        .eq('id', batchId);
      if (batchUpdateErr) {
        console.error('[release] batch update error:', batchUpdateErr);
        return NextResponse.json({ error: batchUpdateErr.message }, { status: 500 });
      }

      db.from('stage_transitions').insert({
        batch_id: batchId, from_stage: 'qc_hold', to_stage: 'released',
        changed_by: emp.id, notes: 'All trials released',
      }).then(() => {}).catch(() => {});
    }

    // 6. Kick off shelf-life study (non-blocking)
    const start  = new Date().toISOString().slice(0, 10);
    const expiry = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    db.from('shelf_life_studies').insert({
      batch_id: batchId, storage_condition: '2-8°C',
      test_parameters: ['pH', 'CFU count', 'Sensory', 'Appearance'],
      start_date: start, expiry_date: expiry, status: 'In Progress', created_by: emp.id,
    }).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, all_released: allReleased });

  } catch (err) {
    console.error('[release] unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Unexpected server error' }, { status: 500 });
  }
}
