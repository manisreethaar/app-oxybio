import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
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
        item_code
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
