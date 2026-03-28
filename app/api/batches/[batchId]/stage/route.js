import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { batchId } = params;
    const { from_stage, to_stage, notes } = await request.json();

    if (!to_stage) {
      return NextResponse.json({ success: false, error: 'Target stage is required.' }, { status: 400 });
    }

    // Lookup employee by UUID
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('id')
      .eq('email', user.email)
      .single();

    if (empErr || !emp) {
      return NextResponse.json({ success: false, error: 'Employee profile not found.' }, { status: 404 });
    }

    // ─── 🛡️ STAGE 3 REMEDIATION: Mandatory Training Verification ─────────────
    const stageToCategory = {
      media_prep: 'Fermentation',
      formulation: 'Fermentation',
      fermentation: 'Fermentation',
      thermal: 'QC',
      qc: 'QC'
    };
    
    const categoryNeeded = stageToCategory[to_stage];
    // 🛡️ ADMIN BYPASS: Ensure administrative accounts can always perform overrides
    const { data: userData } = await supabase.from('employees').select('role').eq('email', user.email).single();

    if (categoryNeeded && !['admin','ceo','cto'].includes(userData?.role)) {
      // 🛡️ PRINCIPAL HARDENING: Require acknowledgment of the LATEST version for non-admins
      const { data: latestSop, error: sopErr } = await supabase
        .from('sop_library')
        .select('id, version')
        .eq('category', categoryNeeded)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestSop) {
        const { data: training, error: trainingErr } = await supabase
          .from('sop_acknowledgements')
          .select('*')
          .eq('employee_id', emp.id)
          .eq('sop_id', latestSop.id)
          .limit(1);

        if (trainingErr || !training || training.length === 0) {
           return NextResponse.json({ 
             success: false, 
             error: `Training Required: You must sign the latest ${categoryNeeded} SOP (v${latestSop.version}) in the SOP Library before performing this transition.` 
           }, { status: 403 });
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // SANITIZE: Prevent XSS in audit trail notes
    const cleanNotes = notes ? notes.substring(0, 500).replace(/[<>]/g, '') : '';

    // 1. Update batch stage
    const { error: updateError } = await supabase
      .from('batches')
      .update({ current_stage: to_stage })
      .eq('id', batchId);

    if (updateError) throw updateError;

    // 2. Record transition in audit trail
    const { error: transError } = await supabase
      .from('stage_transitions')
      .insert({
        batch_id: batchId,
        from_stage,
        to_stage,
        changed_by: emp.id,
        notes: cleanNotes
      });

    if (transError) throw transError;

    // Innovation 2: Inventory Auto-Deduction
    if (to_stage === 'media_prep') {
      try {
        // 1. Get Batch and linked formulation
        const { data: batch } = await supabase
          .from('batches')
          .select('variant, product_name')
          .eq('id', batchId)
          .single();

        if (batch) {
          // 2. Find formulation (by name or variant code)
          const { data: formulation } = await supabase
            .from('formulations')
            .select('ingredients')
            .or(`name.eq."${batch.product_name}",code.eq."${batch.variant}"`)
            .order('version', { ascending: false })
            .limit(1)
            .single();

          if (formulation && formulation.ingredients) {
             const ingredients = formulation.ingredients.split(/[\n,]+/).map(i => i.trim()).filter(Boolean);
             for (const ing of ingredients) {
                // Parse "5kg Sugar" or "Manganese 2g"
                const match = ing.match(/([\d.]+)\s*(\w+)?\s*(.+)/) || ing.match(/(.+)\s*([\d.]+)\s*(\w+)?/);
                if (match) {
                   const qty = parseFloat(match[1] || match[2]);
                   const name = (match[3] || match[1]).trim();
                   
                   // Find inventory item
                   const { data: invItem } = await supabase
                     .from('inventory_items')
                     .select('id')
                     .ilike('name', `%${name}%`)
                     .limit(1)
                     .single();

                   if (invItem) {
                      // Subtract from oldest stock first
                      const { data: stock } = await supabase
                        .from('inventory_stock')
                        .select('id, current_quantity')
                        .eq('item_id', invItem.id)
                        .gt('current_quantity', 0)
                        .order('created_at', { ascending: true })
                        .limit(1)
                        .single();

                      if (stock) {
                         const newQty = Math.max(0, stock.current_quantity - qty);
                         await supabase.from('inventory_stock').update({ current_quantity: newQty }).eq('id', stock.id);
                         // Record usage
                         await supabase.from('inventory_usage').insert({
                            stock_id: stock.id,
                            batch_id: batchId,
                            quantity_used: qty,
                            logged_by: emp.id
                         });
                      }
                   }
                }
             }
          }
        }
      } catch (invErr) {
        console.error('Inventory auto-deduct error (non-fatal):', invErr);
      }
    }

    // Innovation 2: Task Auto-Completion
    try {
      await supabase
        .from('tasks')
        .update({ status: 'done', approval_status: 'approved' })
        .eq('assigned_to', emp.id)
        .in('status', ['open', 'in-progress'])
        .contains('metadata', { type: 'batch_stage', batch_id: batchId, stage: to_stage });
    } catch (taskErr) {
      console.error('Task auto-complete error (non-fatal):', taskErr);
    }

    // ── Auto-create shelf life record when batch is released ──────────────
    if (to_stage === 'released') {
      try {
        const { data: releasedBatch } = await supabase
          .from('batches')
          .select('batch_id, variant, volume_litres')
          .eq('id', batchId)
          .single();

        if (releasedBatch) {
          const manufactureDate = new Date().toISOString().split('T')[0];
          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 12); // Default 12-month shelf life

          await supabase.from('shelf_life_products').insert({
            product_name: `${releasedBatch.variant || releasedBatch.batch_id}`,
            batch_id: batchId,
            batch_code: releasedBatch.batch_id,
            manufacture_date: manufactureDate,
            expiry_date: expiryDate.toISOString().split('T')[0],
            status: 'Active',
            quantity: releasedBatch.volume_litres || null,
            notes: `Auto-created on batch release`
          });
        }
      } catch (slErr) {
        console.error('Shelf life auto-create error (non-fatal):', slErr);
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Stage Transition API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

