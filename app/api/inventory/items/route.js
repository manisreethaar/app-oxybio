import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { requireInventoryPermission } from '@/lib/inventory/access';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const permission = await requireInventoryPermission(supabase, 'view');
    if (permission.error) return permission.error;

    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .is('archived_at', null)
      .order('name');

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const permission = await requireInventoryPermission(supabase, 'edit');
    if (permission.error) return permission.error;

    const { data: { user } } = await supabase.auth.getUser();
    const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).maybeSingle();

    const { name, category, sub_category, unit, min_stock_level, storage_condition, preferred_supplier, hazardous, cold_chain_required, coa_required, allergen, organic_certified, item_code } = await request.json();

    if (!name || !category || !unit) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('inventory_items')
      .insert({
        name,
        category,
        sub_category,
        unit,
        min_stock_level: parseFloat(min_stock_level) || 0,
        storage_condition,
        preferred_supplier: preferred_supplier || null,
        hazardous: !!hazardous,
        cold_chain_required: !!cold_chain_required,
        coa_required: !!coa_required,
        allergen: !!allergen,
        organic_certified,
        item_code,
        created_by: emp?.id || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const supabase = createClient();
    const permission = await requireInventoryPermission(supabase, 'edit');
    if (permission.error) return permission.error;

    const body = await request.json();
    const { id, name, category, sub_category, unit, min_stock_level, storage_condition, preferred_supplier, hazardous, cold_chain_required, coa_required, allergen, organic_certified, item_code } = body;

    if (!id || !name || !category || !unit) {
      return NextResponse.json({ success: false, error: 'Missing required validation fields' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('inventory_items')
      .update({ 
        name, 
        category, 
        sub_category,
        unit, 
        min_stock_level: parseFloat(min_stock_level) || 0,
        storage_condition,
        preferred_supplier: preferred_supplier || null,
        hazardous: !!hazardous,
        cold_chain_required: !!cold_chain_required,
        coa_required: !!coa_required,
        allergen: !!allergen,
        organic_certified,
        item_code
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids'); // comma-separated for bulk delete

    if (!id && !ids) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const permission = await requireInventoryPermission(supabase, 'delete');
    if (permission.error) return permission.error;

    const permanent = searchParams.get('permanent') === 'true';
    const now = new Date().toISOString();

    // Get employee id for archived_by
    const { data: { user } } = await supabase.auth.getUser();
    const { data: emp } = user ? await supabase.from('employees').select('id').eq('email', user.email).single() : { data: null };

    if (ids) {
      const idList = ids.split(',').map(s => s.trim()).filter(Boolean);
      if (!idList.length) return NextResponse.json({ error: 'No valid IDs provided' }, { status: 400 });
      if (permanent) {
        const { error } = await supabase.from('inventory_items').delete().in('id', idList);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('inventory_items').update({ archived_at: now, archived_by: emp?.id || null }).in('id', idList);
        if (error) throw error;
      }
      return NextResponse.json({ success: true, deleted: idList.length });
    }

    if (permanent) {
      const { error } = await supabase.from('inventory_items').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Item permanently deleted.' });
    }

    const { error } = await supabase.from('inventory_items').update({ archived_at: now, archived_by: emp?.id || null }).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true, message: 'Item archived.' });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
