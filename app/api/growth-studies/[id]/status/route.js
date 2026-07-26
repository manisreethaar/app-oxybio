import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { NextResponse } from 'next/server';

export async function PATCH(req, { params }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).single();
    if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const { id } = await params;
    const { status, lot_selections, inoculation_time: customInocTime } = await req.json();

    const allowed = ['setup', 'active', 'completed', 'analysed'];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const updates = { status, updated_at: new Date().toISOString() };
    if (status === 'active') {
      // Use caller-supplied time if provided (retroactive entry), otherwise default to now
      updates.inoculation_time = customInocTime || new Date().toISOString();
    }
    if (status === 'completed') updates.completed_at = new Date().toISOString();

    const supabaseAdmin = createAdminClient();

    // Fetch current study for vial_id and study_code
    const { data: study } = await supabaseAdmin
      .from('growth_studies')
      .select('id, study_code, vial_id')
      .eq('id', id)
      .single();

    // When activating: compute time point schedule, mark vial, deduct inventory
    if (status === 'active') {
      const inocTime = new Date(updates.inoculation_time);

      // 1. Schedule time points
      const { data: tps } = await supabaseAdmin
        .from('growth_study_time_points')
        .select('id, planned_hour')
        .eq('study_id', id);

      if (tps?.length) {
        for (const tp of tps) {
          await supabaseAdmin
            .from('growth_study_time_points')
            .update({ scheduled_at: new Date(inocTime.getTime() + tp.planned_hour * 3600000).toISOString() })
            .eq('id', tp.id);
        }
      }

      // 2. Mark vial as used + log consumption in inventory_usage
      if (study?.vial_id) {
        await supabaseAdmin
          .from('cell_bank_vials')
          .update({
            status: 'Used',
            used_in_study_id: id,
            used_at: inocTime.toISOString(),
          })
          .eq('id', study.vial_id);

        // Enriched vial log now includes study_id
        await supabaseAdmin.from('cell_bank_vial_logs').insert({
          vial_id:   study.vial_id,
          action:    'used_in_study',
          study_id:  id,
          operator_id: emp.id,
          notes: `Inoculated into Growth Study ${study.study_code || id}`,
        });

        // Track vial consumption in inventory_usage for cross-module traceability
        await supabaseAdmin.from('inventory_usage').insert({
          vial_id:         study.vial_id,
          growth_study_id: id,
          quantity_used:   1,   // 1 vial consumed; volume tracked separately in cell_bank_vials.volume_ml
          logged_by:       emp.id,
          stage:           'inoculation',
          notes:           `Vial used for Growth Study ${study.study_code || id}`,
        });
      }

      // 3. Deduct media/ingredient inventory lots
      if (lot_selections?.length) {
        for (const sel of lot_selections) {
          if (!sel.stock_id || !sel.quantity_used || sel.quantity_used <= 0) continue;

          // Fetch current stock
          const { data: stockRow } = await supabaseAdmin
            .from('inventory_stock')
            .select('current_quantity, inventory_items(min_stock_level)')
            .eq('id', sel.stock_id)
            .single();

          if (!stockRow) continue;

          const newQty = Math.max(0, stockRow.current_quantity - sel.quantity_used);

          // Update stock level
          await supabaseAdmin
            .from('inventory_stock')
            .update({
              current_quantity: newQty,
              ...(newQty <= 0 ? { status: 'Out of Stock' } : {}),
            })
            .eq('id', sel.stock_id);

          // Log inventory movement — correct column is 'type', not 'movement_type'
          await supabaseAdmin.from('inventory_movements').insert({
            stock_id:  sel.stock_id,
            type:      'Issue',
            quantity:  sel.quantity_used,
            purpose:   'R&D',
            issued_by: user.id,
            notes:     `Growth Study ${study.study_code || id} — ${sel.item_name || ''}`,
          });

          // Log usage with correct columns (stage + notes now exist after migration)
          await supabaseAdmin.from('inventory_usage').insert({
            stock_id:        sel.stock_id,
            growth_study_id: id,
            quantity_used:   sel.quantity_used,
            logged_by:       emp.id,
            stage:           'media_prep',
            notes:           `${sel.item_name || ''} for ${study.study_code || id}`,
          });
        }
      }
    }

    // When completing: mark all pending time points as missed
    if (status === 'completed') {
      await supabaseAdmin
        .from('growth_study_time_points')
        .update({ status: 'missed' })
        .eq('study_id', id)
        .eq('status', 'pending');
    }

    const { data, error } = await supabaseAdmin
      .from('growth_studies')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
