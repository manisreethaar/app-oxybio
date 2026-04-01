import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Batch Creation Schema — v3
// experiment_type + sku_target + planned_volume_ml + num_flasks
// Equipment selection moved to Sterilisation stage
// ─────────────────────────────────────────────────────────────
const postSchema = z.object({
  formulation_id:     z.string().uuid('Select an approved formulation'),
  experiment_type:    z.enum(['F1', 'F2', 'PROTO', 'SHELF']),
  sku_target:         z.enum(['CLARITY', 'MOMENTUM', 'VITALITY', 'Unassigned']).default('Unassigned'),
  planned_volume_ml:  z.number().positive().default(250),
  num_flasks:         z.number().int().min(1).max(10).default(3),
  planned_start_date: z.string().optional(),
  assigned_team:      z.array(z.string().uuid()).default([]),
  linked_sops:        z.array(z.string()).default([]),
  notes:              z.string().optional(),
});

// ─────────────────────────────────────────────────────────────
// Generate sequential batch ID: OB-YYYY-MM-SEQ
// ─────────────────────────────────────────────────────────────
async function generateBatchId(supabase) {
  const now = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `OB-${year}-${month}-`;

  const { data: lastBatch } = await supabase
    .from('batches')
    .select('batch_id')
    .like('batch_id', `${prefix}%`)
    .order('batch_id', { ascending: false })
    .limit(1)
    .single();

  let seq = 1;
  if (lastBatch?.batch_id) {
    const parts = lastBatch.batch_id.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// Phase 0 standard QC test template — auto-created at QC Hold stage
// (not at batch creation, but defined here for reference)
// ─────────────────────────────────────────────────────────────
export const STANDARD_QC_TESTS = [
  { test_name: 'pH — Final product',           target_spec: '4.2–4.6',                 result_unit: 'pH units' },
  { test_name: 'CFU count (Viable count)',      target_spec: '≥10⁶ CFU/ml',             result_unit: 'CFU/ml' },
  { test_name: 'Gram stain',                   target_spec: 'Gram-positive rods dominant', result_unit: '' },
  { test_name: 'Sensory — Aroma',              target_spec: 'Tangy, clean, no off-odour', result_unit: '' },
  { test_name: 'Sensory — Colour',             target_spec: 'Consistent (Kavuni: reddish-purple)', result_unit: '' },
  { test_name: 'Sensory — Taste',              target_spec: 'Acceptable to panel',     result_unit: '' },
  { test_name: 'Sensory — Overall',            target_spec: 'PASS ≥7/10',             result_unit: 'score' },
  { test_name: 'Microbial (Yeast + Mould)',    target_spec: 'Defer to Phase 1',        result_unit: 'CFU/ml', pass_fail: 'N/A' },
];

// ─────────────────────────────────────────────────────────────
// POST /api/batches — Create a new batch
// ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const {
      formulation_id, experiment_type, sku_target,
      planned_volume_ml, num_flasks, planned_start_date,
      assigned_team, linked_sops, notes
    } = parsed.data;

    // ── Gate 1: Approved recipe check ──────────────────────────────────
    const { data: formulation, error: formErr } = await supabase
      .from('formulations')
      .select('id, name, code, version, status, ingredients, steps')
      .eq('id', formulation_id)
      .single();

    if (formErr || !formulation) {
      return NextResponse.json({ error: 'Formulation not found' }, { status: 404 });
    }
    if (formulation.status !== 'Approved') {
      return NextResponse.json({
        error: `Recipe "${formulation.name}" (v${formulation.version}) is not approved. Current status: ${formulation.status}.`,
      }, { status: 403 });
    }

    // ── Gate 2: Creator role check ──────────────────────────────────────
    const { data: creator, error: creatorErr } = await supabase
      .from('employees')
      .select('id, full_name, role')
      .eq('email', user.email)
      .single();

    if (creatorErr || !creator) {
      return NextResponse.json({ error: 'Employee profile not found' }, { status: 403 });
    }

    // Only research_fellow+ can create batches (CEO/CTO/admin/research_fellow/scientist... but spec says research_fellow+)
    const BATCH_CREATE_ROLES = ['ceo', 'cto', 'admin', 'research_fellow'];
    if (!BATCH_CREATE_ROLES.includes(creator.role)) {
      return NextResponse.json({ error: 'Insufficient permissions to create a batch.' }, { status: 403 });
    }

    // ── Pre-flight inventory check (warning only — does NOT block) ──────
    let ingredients = [];
    try {
      ingredients = typeof formulation.ingredients === 'string'
        ? JSON.parse(formulation.ingredients)
        : (formulation.ingredients || []);
    } catch { ingredients = []; }

    const inventoryWarnings = [];
    for (const ing of ingredients) {
      if (!ing.item_id || !ing.quantity) continue;
      const { data: stocks } = await supabase
        .from('inventory_stock')
        .select('current_quantity')
        .eq('item_id', ing.item_id)
        .gt('current_quantity', 0);
      const totalAvailable = (stocks || []).reduce((sum, s) => sum + parseFloat(s.current_quantity || 0), 0);
      if (totalAvailable < parseFloat(ing.quantity)) {
        inventoryWarnings.push({
          item:      ing.name || ing.item_id,
          required:  ing.quantity,
          available: totalAvailable.toFixed(2),
          unit:      ing.unit || '',
        });
      }
    }
    // Note: warnings returned with response but do NOT block creation
    // Actual inventory deduction happens at Media Prep stage when lot is selected

    // ── Generate batch ID ───────────────────────────────────────────────
    const batchIdStr = await generateBatchId(supabase);

    // ── Create batch record ─────────────────────────────────────────────
    const { data: newBatch, error: batchInsertErr } = await supabase
      .from('batches')
      .insert({
        batch_id:           batchIdStr,
        experiment_type,
        sku_target,
        formulation_id,
        planned_volume_ml,
        num_flasks,
        planned_start_date: planned_start_date || null,
        assigned_team:      assigned_team.length > 0 ? assigned_team : [creator.id],
        linked_sops:        linked_sops.length > 0 ? linked_sops : null,
        current_stage:      'media_prep',
        status:             'scheduled',
        start_time:         new Date().toISOString(),
        created_by:         creator.id,
        notes:              notes || null,
      })
      .select()
      .single();

    if (batchInsertErr) throw batchInsertErr;

    // ── Auto-create flask records ──────────────────────────────────────
    const flaskRows = Array.from({ length: num_flasks }, (_, i) => ({
      batch_id:     newBatch.id,
      flask_label:  `F${i + 1}`,
      flask_full_id: `${batchIdStr}-F${i + 1}`,
      status:       'active',
    }));
    await supabase.from('batch_flasks').insert(flaskRows).then(() => {}).catch(err => {
      console.warn('Flask auto-creation warning:', err.message);
    });

    // ── Auto-create batch monitoring task ─────────────────────────────
    const taskAssignee = assigned_team.length > 0 ? assigned_team[0] : creator.id;
    await supabase.from('tasks').insert({
      title:       `Execute Batch: ${batchIdStr}`,
      description: `Production run for ${formulation.name} v${formulation.version}. Type: ${experiment_type}. SKU: ${sku_target}. Volume: ${planned_volume_ml}ml × ${num_flasks} flask(s). Log all CCP data and advance through all stages.`,
      assigned_to: taskAssignee,
      assigned_by: creator.id,
      batch_id:    newBatch.id,
      due_date:    planned_start_date || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      priority:    'high',
      status:      'open',
      checklist: [
        { text: 'Complete Media Preparation',       done: false },
        { text: 'Complete Sterilisation (Pass/Fail)', done: false },
        { text: 'Complete Inoculation — record T=0', done: false },
        { text: 'Log fermentation readings (every 2hr)', done: false },
        { text: 'Declare fermentation endpoint',    done: false },
        { text: 'Complete Straining — record volumes', done: false },
        ...(experiment_type !== 'F1' && experiment_type !== 'F2' ? [] : [
          { text: 'Mushroom extract addition',      done: false },
        ]),
        { text: 'Complete QC Hold — all tests logged', done: false },
        { text: 'CEO: Release or Reject batch',     done: false },
      ],
      logged_minutes:       0,
      is_personal_reminder: false,
    }).then(() => {}).catch(err => { console.warn('Task creation warning:', err.message); });

    // ── Auto-create LNB draft entry ───────────────────────────────────
    await supabase.from('lab_notebook_entries').insert({
      title:      `Batch Run: ${batchIdStr} — ${formulation.name} (${experiment_type})`,
      batch_id:   newBatch.id,
      created_by: creator.id,
      status:     'Draft',
    }).then(() => {}).catch(err => { console.warn('LNB auto-creation warning:', err.message); });

    // ── Push notification to assigned team ────────────────────────────
    const teamIds = assigned_team.length > 0 ? assigned_team : [creator.id];
    const startDisplay = planned_start_date
      ? new Date(planned_start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : 'ASAP';

    const notifRows = teamIds.map(empId => ({
      employee_id: empId,
      title:       `Batch Assigned: ${batchIdStr}`,
      message:     `You've been assigned to batch ${batchIdStr} (${experiment_type} — ${sku_target}). Planned start: ${startDisplay}.`,
      type:        'info',
      link:        `/batches/${newBatch.id}`,
    }));
    await supabase.from('notifications').insert(notifRows).then(() => {}).catch(() => {});

    return NextResponse.json({
      success:  true,
      data:     newBatch,
      message:  `Batch ${batchIdStr} scheduled. ${num_flasks} flask(s) created.`,
      warnings: inventoryWarnings.length > 0 ? inventoryWarnings : undefined,
    });

  } catch (err) {
    console.error('Batch creation error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/batches — List all batches (role-filtered at RLS level)
// ─────────────────────────────────────────────────────────────
export async function GET(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status'); // optional ?status=scheduled

    let query = supabase
      .from('batches')
      .select(`
        id, batch_id, experiment_type, sku_target, status, current_stage,
        planned_volume_ml, num_flasks, planned_start_date,
        start_time, created_at, assigned_team, created_by,
        formulations(name, code, version),
        batch_flasks(id, flask_label, flask_full_id, status),
        batch_fermentation_readings(ph, is_ph_alarm, is_temp_alarm, logged_at)
      `)
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/batches?id=<batch_uuid> — Cancel a batch
// Reverses inventory movements and deletes tasks
// Only for non-released, non-rejected batches
// ─────────────────────────────────────────────────────────────
export async function DELETE(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing batch ID' }, { status: 400 });

    const { data: batch, error: fetchErr } = await supabase
      .from('batches')
      .select('*, inventory_movements(*)')
      .eq('id', id)
      .single();

    if (fetchErr || !batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    if (['released', 'rejected'].includes(batch.status)) {
      return NextResponse.json({ error: 'Cannot delete a finalised batch.' }, { status: 403 });
    }

    // Reverse any inventory movements already recorded
    const movements = batch.inventory_movements || [];
    for (const mov of movements) {
      if (mov.stock_id && mov.quantity) {
        const { data: stock } = await supabase
          .from('inventory_stock').select('current_quantity').eq('id', mov.stock_id).single();
        if (stock) {
          await supabase.from('inventory_stock')
            .update({ current_quantity: parseFloat(stock.current_quantity) + parseFloat(mov.quantity) })
            .eq('id', mov.stock_id);
        }
        await supabase.from('inventory_movements').delete().eq('id', mov.id);
      }
    }

    await supabase.from('tasks').delete().eq('batch_id', id);
    const { error: deleteErr } = await supabase.from('batches').delete().eq('id', id);
    if (deleteErr) throw deleteErr;

    return NextResponse.json({ success: true, message: 'Batch cancelled. Materials restored.' });

  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
