import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────
// Stage Transition API — v3
// Validates quality gates before allowing stage advance.
// Preserves SOP training check + audit trail from v2.
// ─────────────────────────────────────────────────────────────

const STAGE_FLOW = [
  'media_prep', 'sterilisation', 'inoculation', 'fermentation',
  'straining', 'extract_addition', 'qc_hold'
];

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

async function gateInoculationToFermentation(supabase, batchId) {
  const { data } = await supabase
    .from('batch_stage_inoculation')
    .select('t_zero_time, contamination_check')
    .eq('batch_id', batchId)
    .single();
  if (!data?.t_zero_time) return 'T=0 inoculation time has not been recorded. Set T=0 before starting fermentation.';
  return null;
}

async function gateFermentationToStraining(supabase, batchId) {
  // Need: endpoint declared + minimum 8hr elapsed
  const [epRes, inocuRes] = await Promise.all([
    supabase.from('batch_fermentation_endpoint').select('id, total_hours, sensory_overall').eq('batch_id', batchId).single(),
    supabase.from('batch_stage_inoculation').select('t_zero_time').eq('batch_id', batchId).single(),
  ]);
  if (!epRes.data) return 'Fermentation endpoint has not been declared. Declare endpoint (with sensory + flask dispositions) before straining.';
  const totalHours = epRes.data.total_hours || 0;
  if (totalHours < 8) return `Minimum fermentation time is 8 hours. Current duration: ${totalHours.toFixed(1)}hr.`;
  if (epRes.data.sensory_overall === 'FAIL') return 'Sensory evaluation FAILED at endpoint. This batch should be rejected, not strained.';
  return null;
}

async function gateStrainingToExtractAddition(supabase, batchId) {
  const { data } = await supabase
    .from('batch_stage_straining')
    .select('post_straining_vol_ml')
    .eq('batch_id', batchId)
    .single();
  if (!data?.post_straining_vol_ml) return 'Post-straining volume not recorded. Save straining data before advancing.';
  return null;
}

async function gateExtractAdditionToQCHold(supabase, batchId) {
  const { data } = await supabase
    .from('batch_stage_extract_addition')
    .select('final_product_ph')
    .eq('batch_id', batchId)
    .single();
  if (!data?.final_product_ph) return 'Final product pH (after extract addition) has not been recorded. This is a mandatory CCP field.';
  return null;
}

async function gateQCHoldToReleasedOrRejected(supabase, batchId, toStage, empRole) {
  // CEO-only gate
  if (!['ceo', 'admin'].includes(empRole)) return 'Only the CEO can release or reject a batch (GMP requirement).';

  const { data: sample } = await supabase
    .from('batch_qc_samples')
    .select('id')
    .eq('batch_id', batchId)
    .single();
  if (!sample) return 'QC sample record has not been created. Create the sample record and log all test results first.';

  const { data: tests } = await supabase
    .from('batch_qc_tests')
    .select('pass_fail')
    .eq('sample_id', sample.id);
  const pending = (tests || []).filter(t => t.pass_fail === 'Pending');
  if (pending.length > 0) return `${pending.length} QC test(s) still pending. All tests must be recorded before disposition.`;

  if (toStage === 'released') {
    const anyFail = (tests || []).some(t => t.pass_fail === 'Fail');
    if (anyFail) return 'One or more QC tests FAILED. Batch must be rejected or a deviation approved by CEO before release.';
  }
  return null;
}

// ── Gate router ───────────────────────────────────────────────
async function checkGate(supabase, batchId, fromStage, toStage, empRole) {
  const key = `${fromStage}→${toStage}`;
  switch (key) {
    case 'media_prep→sterilisation':    return gateMediaPrepToSterilisation(supabase, batchId);
    case 'sterilisation→inoculation':   return gateSterilisationToInoculation(supabase, batchId);
    case 'inoculation→fermentation':    return gateInoculationToFermentation(supabase, batchId);
    case 'fermentation→straining':      return gateFermentationToStraining(supabase, batchId);
    case 'straining→extract_addition':  return gateStrainingToExtractAddition(supabase, batchId);
    case 'extract_addition→qc_hold':    return gateExtractAdditionToQCHold(supabase, batchId);
    case 'qc_hold→released':
    case 'qc_hold→rejected':            return gateQCHoldToReleasedOrRejected(supabase, batchId, toStage, empRole);
    default:                            return null; // No gate for this transition
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

    // ── SOP Training Check (preserved from v2) ───────────────
    // Maps stage → SOP category. Non-admins must have signed the latest active SOP.
    const SOP_GATE = { media_prep: 'Fermentation', fermentation: 'Fermentation', qc_hold: 'QC' };
    const sopCategory = SOP_GATE[to_stage];

    if (sopCategory && !['admin', 'ceo', 'cto'].includes(emp.role)) {
      const { data: latestSop } = await supabase
        .from('sop_library').select('id, version').eq('category', sopCategory).eq('is_active', true)
        .order('version', { ascending: false }).limit(1).maybeSingle();

      if (latestSop) {
        const { data: ack } = await supabase
          .from('sop_acknowledgements').select('id').eq('employee_id', emp.id).eq('sop_id', latestSop.id).limit(1);
        if (!ack?.length) {
          return NextResponse.json({
            success: false,
            error: `Training required: Sign the latest ${sopCategory} SOP (v${latestSop.version}) in the SOP Library before this transition.`
          }, { status: 403 });
        }
      }
    }

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
    else if (to_stage === 'qc_hold')      newStatus = 'qc-hold';   // DB uses hyphen, not underscore
    else                                   newStatus = 'planned';   // intermediate stages: sterilisation, inoculation, straining, extract_addition

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

    // ── Inventory deduction on media_prep save ───────────────
    // NOTE: In v3, deduction happens when the media prep form is SAVED (lot selected),
    // not on stage transition. This is handled in MediaPrepPanel directly via supabase upsert.
    // The old stage-transition deduction is removed to avoid double-counting.

    // ── Auto-actions on RELEASED ─────────────────────────────
    if (to_stage === 'released') {
      try {
        const { data: relBatch } = await supabase.from('batches').select('batch_id, sku_target, planned_volume_ml').eq('id', batchId).single();
        const manufactureDate = new Date().toISOString().split('T')[0];
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 12);
        // Try both table names (schema variations in project)
        await supabase.from('shelf_life_records').insert({
          batch_id: batchId, batch_code: relBatch?.batch_id,
          product_name: relBatch?.sku_target || 'Fermented Beverage',
          manufacture_date: manufactureDate,
          expiry_date: expiryDate.toISOString().split('T')[0],
          status: 'Active', notes: 'Auto-created on batch release',
        }).then(()=>{}).catch(()=>{});
        // Notify CEO + Research Fellow
        const { data: leaders } = await supabase.from('employees').select('id').in('role', ['ceo','admin','research_fellow']);
        if (leaders?.length) {
          await supabase.from('notifications').insert(
            leaders.map(l => ({
              employee_id: l.id,
              title: `Batch Released: ${relBatch?.batch_id}`,
              message: `Batch ${relBatch?.batch_id} (${relBatch?.sku_target}) has been released. Shelf-life study created.`,
              type: 'success', link: `/batches/${batchId}`,
            }))
          ).then(()=>{}).catch(()=>{});
        }
      } catch (e) { console.warn('Release auto-actions (non-fatal):', e.message); }
    }

    // ── Auto-actions on REJECTED ─────────────────────────────
    if (to_stage === 'rejected') {
      try {
        const { data: rejBatch } = await supabase.from('batches').select('batch_id').eq('id', batchId).single();
        const { data: leaders } = await supabase.from('employees').select('id').in('role', ['ceo','admin','research_fellow']);
        if (leaders?.length) {
          await supabase.from('notifications').insert(
            leaders.map(l => ({
              employee_id: l.id,
              title: `Batch Rejected: ${rejBatch?.batch_id}`,
              message: `Batch ${rejBatch?.batch_id} has been rejected. Review rejection record and raise CAPA if required.`,
              type: 'alert', link: `/batches/${batchId}`,
            }))
          ).then(()=>{}).catch(()=>{});
        }
      } catch (e) { console.warn('Rejection auto-actions (non-fatal):', e.message); }
    }

    // ── Remind team on fermentation start ────────────────────
    if (to_stage === 'fermentation') {
      try {
        const { data: b } = await supabase.from('batches').select('batch_id, assigned_team').eq('id', batchId).single();
        if (b?.assigned_team?.length) {
          await supabase.from('notifications').insert(
            b.assigned_team.map(empId => ({
              employee_id: empId,
              title: `Fermentation started: ${b.batch_id}`,
              message: `T=0 set. Log pH + temp readings every 2hr per SOP-004.`,
              type: 'info', link: `/batches/${batchId}`,
            }))
          ).then(()=>{}).catch(()=>{});
        }
      } catch (e) { console.warn('Fermentation start notify (non-fatal):', e.message); }
    }

    return NextResponse.json({ success: true, new_stage: to_stage, new_status: newStatus });

  } catch (error) {
    console.error('Stage Transition Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
