import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const postSchema = z.object({
  variant: z.string().min(1, 'Variant required'),
  formulation_id: z.string().uuid('Invalid formulation ID'),
  equipment_id: z.string().uuid('Invalid equipment ID')
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { variant, formulation_id, equipment_id } = parsed.data;

    // --- GATE 1: Equipment Compliance Check ---
    const { data: equip, error: equipErr } = await supabase
      .from('equipment')
      .select('status, calibration_due_date, name')
      .eq('id', equipment_id)
      .single();

    if (equipErr || !equip) return NextResponse.json({ error: 'Selected equipment not found' }, { status: 404 });

    const isOutOfService = equip.status !== 'Operational';
    const isExpired = equip.calibration_due_date && (new Date(equip.calibration_due_date) < new Date());

    if (isOutOfService || isExpired) {
      return NextResponse.json({
        error: `AUTO-INHIBITOR: Equipment "${equip.name}" is non-compliant. ${isExpired ? 'Calibration expired.' : `Status: ${equip.status}.`}`,
        details: { status: equip.status, calibration_due: equip.calibration_due_date }
      }, { status: 403 });
    }

    // --- GATE 2: Approved Recipe Check ---
    const { data: formulation, error: formErr } = await supabase
      .from('formulations')
      .select('id, name, code, version, status, ingredients, steps')
      .eq('id', formulation_id)
      .single();

    if (formErr || !formulation) return NextResponse.json({ error: 'Formulation not found' }, { status: 404 });

    if (formulation.status !== 'Approved') {
      return NextResponse.json({
        error: `Recipe "${formulation.name}" (v${formulation.version}) is not approved. Only approved recipes can be used to start a batch. Current status: ${formulation.status}.`
      }, { status: 403 });
    }

    // --- GATE 3: Pre-flight Inventory Validation ---
    let ingredients = [];
    try {
      ingredients = typeof formulation.ingredients === 'string'
        ? JSON.parse(formulation.ingredients)
        : (formulation.ingredients || []);
    } catch (e) { ingredients = []; }

    const inventoryShortfalls = [];

    for (const ing of ingredients) {
      if (!ing.item_id || !ing.quantity) continue;

      // Fetch all available stock lots sorted by expiry (FIFO)
      const { data: stocks, error: stockErr } = await supabase
        .from('inventory_stock')
        .select('id, current_quantity, supplier_batch_number, expiry_date')
        .eq('item_id', ing.item_id)
        .gt('current_quantity', 0)
        .order('expiry_date', { ascending: true });

      if (stockErr) continue;

      const totalAvailable = (stocks || []).reduce((sum, s) => sum + parseFloat(s.current_quantity || 0), 0);

      if (totalAvailable < parseFloat(ing.quantity)) {
        inventoryShortfalls.push({
          item: ing.name || ing.item_id,
          required: ing.quantity,
          available: totalAvailable.toFixed(2),
          unit: ing.unit || ''
        });
      }
    }

    if (inventoryShortfalls.length > 0) {
      return NextResponse.json({
        error: `Inventory validation failed. Insufficient stock for ${inventoryShortfalls.length} ingredient(s).`,
        shortfalls: inventoryShortfalls
      }, { status: 400 });
    }

    // --- Get creator's employee profile ---
    const { data: creator, error: creatorErr } = await supabase
      .from('employees')
      .select('id, full_name')
      .eq('email', user.email)
      .single();

    if (creatorErr || !creator) return NextResponse.json({ error: 'Employee profile not found' }, { status: 403 });

    // --- CREATE BATCH (status = planned) ---
    const salt = crypto.randomUUID().split('-')[0].slice(-4).toUpperCase();
    const batchIdStr = `BTCH-${formulation.code?.toUpperCase() || 'RCP'}-${salt}`;

    const { data: newBatch, error: batchInsertErr } = await supabase.from('batches').insert({
      batch_id: batchIdStr,
      variant: variant,
      formulation_id: formulation_id,
      equipment_id: equipment_id,
      current_stage: 'media_prep',
      status: 'planned',
      start_time: new Date().toISOString(),
      created_by: creator.id
    }).select().single();

    if (batchInsertErr) throw batchInsertErr;

    // --- RESERVE / DEDUCT INVENTORY (FIFO, with movement log) ---
    for (const ing of ingredients) {
      if (!ing.item_id || !ing.quantity) continue;

      const { data: stocks } = await supabase
        .from('inventory_stock')
        .select('id, current_quantity')
        .eq('item_id', ing.item_id)
        .gt('current_quantity', 0)
        .order('expiry_date', { ascending: true });

      if (!stocks) continue;

      let remaining = parseFloat(ing.quantity);
      for (const stock of stocks) {
        if (remaining <= 0) break;
        const deduct = Math.min(parseFloat(stock.current_quantity), remaining);
        const newQty = parseFloat(stock.current_quantity) - deduct;

        await supabase
          .from('inventory_stock')
          .update({ current_quantity: newQty })
          .eq('id', stock.id);

        // Log movement for audit trail
        await supabase.from('inventory_movements').insert({
          stock_id: stock.id,
          movement_type: 'Batch Deduction',
          quantity: deduct,
          batch_reference: batchIdStr,
          issued_by: creator.id,
          notes: `Auto-deducted for batch ${batchIdStr}`
        }).then(() => {}).catch(() => {}); // non-blocking

        remaining -= deduct;
      }
    }

    // --- AUTO-CREATE TASKS FROM RECIPE STEPS ---
    let steps = [];
    try {
      steps = typeof formulation.steps === 'string'
        ? JSON.parse(formulation.steps)
        : (formulation.steps || []);
    } catch (e) { steps = []; }

    if (steps.length > 0) {
      const taskPayload = steps.map((step, idx) => ({
        title: step.title || step.name || `Step ${idx + 1}: ${step.action || 'Process Step'}`,
        description: [
          step.description || step.notes || '',
          step.temperature ? `Temp: ${step.temperature}` : '',
          step.ph_target ? `Target pH: ${step.ph_target}` : '',
          step.duration_minutes ? `Duration: ${Math.floor(step.duration_minutes / 60)}h ${step.duration_minutes % 60}m` : ''
        ].filter(Boolean).join(' | '),
        assigned_to: creator.id,
        assigned_by: creator.id,
        batch_id: newBatch.id,
        due_date: new Date(Date.now() + (step.duration_minutes || 60) * 60 * 1000 * (idx + 1)).toISOString().split('T')[0],
        priority: idx === 0 ? 'high' : 'medium',
        status: idx === 0 ? 'open' : 'open',
        is_personal_reminder: false,
        checklist: step.checklist || [],
        logged_minutes: 0
      }));

      await supabase.from('tasks').insert(taskPayload).then(() => {}).catch(err => {
        console.warn('Auto-task creation warning:', err.message);
      });
    } else {
      // Even if no steps, create a generic batch monitoring task
      await supabase.from('tasks').insert({
        title: `Monitor Batch: ${batchIdStr}`,
        description: `Active production run for ${formulation.name} (v${formulation.version}). Log all CCP data and stage transitions.`,
        assigned_to: creator.id,
        assigned_by: creator.id,
        batch_id: newBatch.id,
        due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        priority: 'high',
        status: 'open',
        is_personal_reminder: false,
        checklist: [
          { text: 'Complete media preparation', done: false },
          { text: 'Log inoculation parameters', done: false },
          { text: 'Record fermentation readings', done: false },
          { text: 'Document harvest results', done: false }
        ],
        logged_minutes: 0
      }).then(() => {}).catch(err => {
        console.warn('Default task creation warning:', err.message);
      });
    }

    // --- AUTO-CREATE LNB DRAFT ENTRY ---
    await supabase.from('lab_notebook_entries').insert({
      title: `Batch Run: ${batchIdStr} — ${formulation.name}`,
      batch_id: newBatch.id,
      created_by: creator.id,
      status: 'Draft'
    }).then(() => {}).catch(err => {
      console.warn('LNB auto-creation warning:', err.message);
    });

    return NextResponse.json({
      success: true,
      data: newBatch,
      message: `Batch ${batchIdStr} created. Inventory reserved, tasks assigned, LNB initialized.`
    });

  } catch (err) {
    console.error('Batch creation error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('batches')
      .select('*, formulations(name, code, version, status), equipment(name, status)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing batch ID' }, { status: 400 });

    // 1. Fetch batch details + associated movements
    const { data: batch, error: fetchErr } = await supabase
      .from('batches')
      .select('*, inventory_movements(*)')
      .eq('id', id)
      .single();

    if (fetchErr || !batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

    // 2. Security: Don't allow deleting finalized batches
    if (['released', 'rejected'].includes(batch.status)) {
      return NextResponse.json({ error: 'Cannot delete a batch that has already been released or rejected.' }, { status: 403 });
    }

    // 3. Reverse Inventory Deductions
    const movements = batch.inventory_movements || [];
    for (const mov of movements) {
      if (mov.stock_id && mov.quantity) {
        // Fetch current stock
        const { data: stock } = await supabase.from('inventory_stock').select('current_quantity').eq('id', mov.stock_id).single();
        if (stock) {
           await supabase.from('inventory_stock')
             .update({ current_quantity: parseFloat(stock.current_quantity) + parseFloat(mov.quantity) })
             .eq('id', mov.stock_id);
        }
        // Delete the movement log
        await supabase.from('inventory_movements').delete().eq('id', mov.id);
      }
    }

    // 4. Delete associated tasks
    await supabase.from('tasks').delete().eq('batch_id', id);

    // 5. Delete the batch itself
    const { error: deleteErr } = await supabase.from('batches').delete().eq('id', id);
    if (deleteErr) throw deleteErr;

    return NextResponse.json({ success: true, message: 'Batch cancelled. Materials returned to inventory.' });

  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
