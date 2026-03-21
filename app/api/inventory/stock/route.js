import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('inventory_stock')
      .select('*, inventory_items(name, unit), vendors(name)')
      .order('expiry_date', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const body = await request.json();
    const { item_id, vendor_id, supplier_batch_number, received_quantity, expiry_date, location } = body;

    if (!item_id || !received_quantity) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('inventory_stock')
      .insert({
        item_id,
        vendor_id,
        supplier_batch_number,
        received_quantity: parseFloat(received_quantity),
        current_quantity: parseFloat(received_quantity),
        expiry_date,
        location,
        status: 'Available'
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
