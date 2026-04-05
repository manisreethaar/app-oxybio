import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

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
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { batchId } = params;
    const { from_stage, to_stage, notes } = await request.json();

    if (!to_stage) return NextResponse.json({ success: false, error: 'Target stage is required.' }, { status: 400 });

    // Lookup employee
    const { data: emp } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ success: false, error: 'Employee profile not found.' }, { status: 404 });

    // ── Quality Gate ─────────────────────────────────────────
    const gateError = await checkGate(supabase, batchId, from_stage, to_stage, emp.role);
    if (gateError) {
      return NextResponse.json({ success: false, error: gateError, gate_blocked: true }, { status: 422 });
    }

    // ── Determine new batch status ───────────────────────────
    let newStatus;
    if (to_stage === 'released')          newStatus = 'released';
    else if (to_stage === 'rejected')     newStatus = 'rejected';
    else if (to_stage === 'fermentation') newStatus = 'fermenting';
    else if (to_stage === 'qc_hold')      newStatus = 'qc-hold';
    else                                  newStatus = 'planned';

    // ── Update batch ─────────────────────────────────────────
    const { error: updateErr } = await supabase
      .from('batches')
      .update({ current_stage: to_stage, status: newStatus })
      .eq('id', batchId);
    if (updateErr) throw updateErr;

    // ── Audit trail ──────────────────────────────────────────
    const cleanNotes = notes ? notes.substring(0, 500).replace(/[<>]/g, '') : '';
    await supabase.from('stage_transitions').insert({
      batch_id: batchId, from_stage, to_stage, changed_by: emp.id, notes: cleanNotes,
    });

    return NextResponse.json({ success: true, new_stage: to_stage, new_status: newStatus });

  } catch (error) {
    console.error('Stage Transition Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
