export const dynamic = 'force-dynamic';
import { createClient as createAnonClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { can, isMasterAdmin } from '@/lib/permissions';

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
            formulation_id, sku_name, esig_confirmed_at } = body;

    if (!flask_id) return NextResponse.json({ error: 'flask_id is required' }, { status: 400 });
    if (!batchId)  return NextResponse.json({ error: 'batchId is required' },  { status: 400 });

    // 2. Check role (admin client so RLS doesn't block the employees lookup)
    const db = adminClient();
    const { data: emp, error: empErr } = await db
      .from('employees')
      .select('id, role, custom_permissions')
      .eq('email', user.email)
      .single();

    if (empErr || !emp) {
      return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 });
    }
    if (!can(emp.role, 'batches', 'release', emp.custom_permissions) && !isMasterAdmin(user.email)) {
      return NextResponse.json({ error: 'Release requires CEO / Admin role' }, { status: 403 });
    }

    // 3. Upsert release record (admin client → RLS bypassed)
    // Try progressively smaller payloads until one succeeds, in case the live table
    // was created before all columns were added to the schema.
    const isSchemaErr = (e) => e && (e.code === 'PGRST204' || e.message?.includes('schema cache'));

    const payloads = [
      // Full — all fields including Phase 2 additions
      { flask_id, released_by: emp.id, release_date: new Date().toISOString(),
        yield_volume_ml: yield_volume_ml ?? null, bottles_produced: bottles_produced ?? null,
        bottle_volume_ml: bottle_volume_ml ?? null, release_notes: release_notes ?? null,
        formulation_id: formulation_id ?? null, sku_name: sku_name ?? null,
        esig_confirmed_at: esig_confirmed_at ?? null },
      // Without Phase 2 columns (pre-migration)
      { flask_id, released_by: emp.id, release_date: new Date().toISOString(),
        yield_volume_ml: yield_volume_ml ?? null, bottles_produced: bottles_produced ?? null,
        bottle_volume_ml: bottle_volume_ml ?? null, release_notes: release_notes ?? null },
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

    // 6. Kick off shelf-life study and sensory session (non-blocking)
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
      session_title: `Sensory Evaluation - ${batchId}${flaskLabel ? ' ' + flaskLabel : ''}`,
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
