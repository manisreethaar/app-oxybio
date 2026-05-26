import { createClient as createAnonClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Service-role client — bypasses RLS for batch/flask writes
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ─────────────────────────────────────────────────────────────
// Stage Transition API — v4 (Flask-Level Support)
// Only manages Media Prep -> Sterilisation parent-level gating.
// Post-sterilisation stages are decoupled and explicitly tracked per-flask.
// ─────────────────────────────────────────────────────────────

// ── Gate validation functions ─────────────────────────────────
// Each returns null (OK) or an error string (blocked).

async function gateMediaPrepToSterilisation(supabase, batchId) {
  const { data } = await supabase
    .from('batch_stage_media_prep')
    .select('is_complete, ragi_moisture_pass')
    .eq('batch_id', batchId)
    .single();
  if (!data?.is_complete) return 'Media Prep is not marked complete. Save and mark complete before advancing.';
  if (data.ragi_moisture_pass === false) return 'Ragi moisture check FAILED. Resolve deviation before sterilising.';
  return null;
}

async function gateSterilisationToInoculation(supabase, batchId) {
  const { data } = await supabase
    .from('batch_stage_sterilisation')
    .select('pass_fail')
    .eq('batch_id', batchId)
    .single();
  if (!data) return 'Sterilisation record not found. Complete sterilisation data before advancing.';
  if (data.pass_fail !== 'Pass') return `Sterilisation gate blocked — current result: "${data.pass_fail}". Must be "Pass" to proceed to Inoculation.`;
  return null;
}

// ── Gate router ───────────────────────────────────────────────
async function checkGate(supabase, batchId, fromStage, toStage, empRole) {
  const key = `${fromStage}→${toStage}`;
  switch (key) {
    case 'media_prep→sterilisation':    return gateMediaPrepToSterilisation(supabase, batchId);
    case 'sterilisation→inoculation':   return gateSterilisationToInoculation(supabase, batchId);
    default:                            return null; // No gate for this transition via this endpoint
  }
}

// ─────────────────────────────────────────────────────────────
export async function POST(request, { params }) {
  try {
    // Auth via anon client (reads session cookie), all DB writes via admin (bypasses RLS)
    const authClient = createAnonClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { batchId } = params;
    const { from_stage, to_stage, notes } = await request.json();

    if (!to_stage) return NextResponse.json({ success: false, error: 'Target stage is required.' }, { status: 400 });

    const db = adminClient();

    // Lookup employee
    const { data: emp } = await db.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ success: false, error: 'Employee profile not found.' }, { status: 404 });

    // ── Quality Gate ─────────────────────────────────────────
    const gateError = await checkGate(db, batchId, from_stage, to_stage, emp.role);
    if (gateError) {
      return NextResponse.json({ success: false, error: gateError, gate_blocked: true }, { status: 422 });
    }

    // ── Determine new batch status ───────────────────────────
    let newStatus;
    if (to_stage === 'released')          newStatus = 'released';
    else if (to_stage === 'rejected')     newStatus = 'rejected';
    else if (to_stage === 'fermentation') newStatus = 'fermenting';
    else if (to_stage === 'qc_hold')      newStatus = 'qc-hold';
    else                                  newStatus = 'in-progress';

    // ── Update batch (service role — RLS bypassed, guaranteed to write) ─
    const { error: updateErr } = await db
      .from('batches')
      .update({ current_stage: to_stage, status: newStatus })
      .eq('id', batchId);
    if (updateErr) throw updateErr;

    // ── Audit trail ──────────────────────────────────────────
    const cleanNotes = notes ? notes.substring(0, 500).replace(/[<>]/g, '') : '';
    await db.from('stage_transitions').insert({
      batch_id: batchId, from_stage, to_stage, changed_by: emp.id, notes: cleanNotes,
    });

    // ── Auto-Generate Flasks on Sterilisation -> Inoculation ──
    if (to_stage === 'inoculation' && from_stage === 'sterilisation') {
      try {
        const { data: b } = await db.from('batches').select('num_flasks, batch_id').eq('id', batchId).single();
        const numFlasks = b?.num_flasks || 1;
        const batchIdStr = b?.batch_id || '';
        const { data: existingFlasks } = await db.from('batch_flasks').select('id').eq('batch_id', batchId);

        if (!existingFlasks || existingFlasks.length === 0) {
          const newFlasks = Array.from({ length: numFlasks }, (_, i) => ({
            batch_id:      batchId,
            flask_label:   `F${i + 1}`,
            flask_full_id: batchIdStr ? `${batchIdStr}-F${i + 1}` : undefined,
            current_stage: 'inoculation',
            status:        'planned',
          }));
          await db.from('batch_flasks').insert(newFlasks);
        } else {
          await db
            .from('batch_flasks')
            .update({ current_stage: 'inoculation', status: 'planned' })
            .eq('batch_id', batchId)
            .is('current_stage', null);
        }
      } catch (err) {
        console.error('Failed to auto-generate flasks:', err);
      }
    }

    return NextResponse.json({ success: true, new_stage: to_stage, new_status: newStatus });

  } catch (error) {
    console.error('Stage Transition Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
