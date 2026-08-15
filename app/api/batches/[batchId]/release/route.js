export const dynamic = 'force-dynamic';
import { createClient as createAnonClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isMasterAdmin } from '@/lib/permissions';
import { canOperateBatch } from '@/lib/batches/stagePolicy';

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
    const { flask_id, yield_volume_ml, bottles_produced, bottle_volume_ml, release_notes,
            formulation_id, sku_name, esig_confirmed_at,
            label_verified, label_batch_number, label_mfd, label_bbd,
            pack_integrity_check, fill_weight_g } = body;

    if (!flask_id) return NextResponse.json({ error: 'flask_id is required' }, { status: 400 });
    if (!batchId)  return NextResponse.json({ error: 'batchId is required' },  { status: 400 });

    // 2. Auth — same canOperateBatch gate as every other transition path.
    // By the time this route is called the flask has already been moved to
    // 'released' via advance_flask_stage() (QCHoldPanel), which is itself
    // gated on canOperateBatch — so gating this record-detail save any more
    // tightly than the transition that already happened is inconsistent.
    const db = adminClient();
    const { data: emp, error: empErr } = await db
      .from('employees')
      .select('id, role')
      .eq('email', user.email)
      .single();

    if (empErr || !emp) {
      return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 });
    }

    const { data: batch, error: batchErr } = await db
      .from('batches')
      .select('id, status, current_stage, assigned_team, created_by')
      .eq('id', batchId)
      .single();
    if (batchErr || !batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const access = canOperateBatch({ batch, employee: emp, isMaster: isMasterAdmin(user.email) });
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    // 3. Upsert release record (admin client → RLS bypassed)
    // Try progressively smaller payloads until one succeeds, in case the live table
    // was created before all columns were added to the schema.
    const isSchemaErr = (e) => e && (e.code === 'PGRST204' || e.message?.includes('schema cache'));

    const payloads = [
      // Full — all fields including labelling verification
      { flask_id, released_by: emp.id, release_date: new Date().toISOString(),
        yield_volume_ml: yield_volume_ml ?? null, bottles_produced: bottles_produced ?? null,
        bottle_volume_ml: bottle_volume_ml ?? null, release_notes: release_notes ?? null,
        formulation_id: formulation_id ?? null, sku_name: sku_name ?? null,
        esig_confirmed_at: esig_confirmed_at ?? null,
        label_verified: label_verified ?? false, label_batch_number: label_batch_number ?? null,
        label_mfd: label_mfd ?? null, label_bbd: label_bbd ?? null,
        pack_integrity_check: pack_integrity_check ?? null, fill_weight_g: fill_weight_g ?? null },
      // Without labelling-verification columns (pre-migration)
      { flask_id, released_by: emp.id, release_date: new Date().toISOString(),
        yield_volume_ml: yield_volume_ml ?? null, bottles_produced: bottles_produced ?? null,
        bottle_volume_ml: bottle_volume_ml ?? null, release_notes: release_notes ?? null,
        formulation_id: formulation_id ?? null, sku_name: sku_name ?? null,
        esig_confirmed_at: esig_confirmed_at ?? null },
      // No yield/bottle columns
      { flask_id, released_by: emp.id, release_date: new Date().toISOString(),
        release_notes: release_notes ?? null },
      // No release_date either
      { flask_id, released_by: emp.id, release_notes: release_notes ?? null },
      // Absolute minimum
      { flask_id },
    ];

    let relErr = null;
    for (const payload of payloads) {
      const { error } = await db
        .from('batch_flask_release_record')
        .upsert(payload, { onConflict: 'flask_id' });
      if (!isSchemaErr(error)) {
        relErr = error ?? null;
        if (Object.keys(payload).length < Object.keys(payloads[0]).length) {
          console.warn('[release] used reduced payload (missing schema columns):', Object.keys(payload));
        }
        break;
      }
      console.warn('[release] schema gap, trying smaller payload:', error.message);
    }

    if (relErr) {
      console.error('[release] upsert error:', relErr);
      return NextResponse.json({ error: relErr.message }, { status: 500 });
    }

    // 4. The flask's status/current_stage were already set to 'released' by
    // advance_flask_stage() when QCHoldPanel triggered the transition — this
    // route only records the release details, it does not re-perform the
    // transition. Read the batch's current state (also already rolled up by
    // the same RPC once every flask is released) to drive the auto-tick side effect.
    const { data: freshBatch } = await db.from('batches').select('status, current_stage').eq('id', batchId).single();
    const allReleased = freshBatch?.current_stage === 'released';

    if (allReleased) {
      // Auto-tick all remaining batch checklist items on full release
      const RELEASE_KEYWORDS = ['inoculation', 'fermentation', 'straining', 'extract', 'qc hold', 'release'];
      db.from('tasks').select('id, checklist').eq('batch_id', batchId).maybeSingle()
        .then(({ data: task }) => {
          if (!task?.checklist?.length) return;
          const updated = task.checklist.map(item =>
            RELEASE_KEYWORDS.some(kw => item.text?.toLowerCase().includes(kw))
              ? { ...item, done: true }
              : item
          );
          return db.from('tasks').update({ checklist: updated }).eq('id', task.id);
        })
        .catch(() => {});
    }

    // Fetch flask label for auto-creation
    const { data: flaskData } = await db.from('batch_flasks').select('flask_label').eq('id', flask_id).single();
    const flaskLabel = flaskData?.flask_label || '';

    // Fetch batch number for better naming
    const { data: batchData } = await db.from('batches').select('batch_id').eq('id', batchId).single();
    const displayBatchId = batchData?.batch_id || batchId;

    // 5. Kick off shelf-life study and sensory session (non-blocking)
    const start  = new Date().toISOString().slice(0, 10);
    const expiry = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

    db.from('shelf_life_studies').insert({
      batch_id: batchId,
      flask_id: flaskLabel,
      storage_condition: '2-8°C',
      test_parameters: ['pH', 'CFU count', 'Sensory', 'Appearance'],
      start_date: start,
      status: 'In Progress',
      created_by: emp.id,
    }).then(() => {}).catch(err => console.error('Auto shelf-life failed', err));

    db.from('taste_panels').insert({
      batch_id: batchId,
      flask_id: flaskLabel,
      session_title: `Sensory Evaluation - ${displayBatchId}${flaskLabel ? ' ' + flaskLabel : ''}`,
      panelist_count: 5,
      test_criteria: ['Taste', 'Aroma', 'Appearance', 'Overall Acceptability'],
      avg_score: 0,
      scores: []
    }).then(() => {}).catch(err => console.error('Auto sensory failed', err));

    return NextResponse.json({ success: true, all_released: allReleased });

  } catch (err) {
    console.error('[release] unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Unexpected server error' }, { status: 500 });
  }
}
