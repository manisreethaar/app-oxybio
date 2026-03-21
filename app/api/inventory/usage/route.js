import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { stock_id, batch_id, quantity_used } = await request.json();

    if (!stock_id || !batch_id || !quantity_used) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Check current stock
    const { data: stock, error: stockFetchErr } = await supabase
      .from('inventory_stock')
      .select('current_quantity')
      .eq('id', stock_id)
      .single();

    if (stockFetchErr || !stock) throw new Error('Stock lot not found');
    if (stock.current_quantity < quantity_used) {
      return NextResponse.json({ error: 'Insufficient stock quantity' }, { status: 400 });
    }

    // 2. Perform transaction: Insert usage and update stock
    // In a production app, we'd use a Supabase RPC or transaction here
    const { error: usageErr } = await supabase
      .from('inventory_usage')
      .insert({
        stock_id,
        batch_id,
        quantity_used: parseFloat(quantity_used),
        logged_by: user.id
      });

    if (usageErr) throw usageErr;

    const { error: updateErr } = await supabase
      .from('inventory_stock')
      .update({ current_quantity: stock.current_quantity - parseFloat(quantity_used) })
      .eq('id', stock_id);

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Inventory Usage API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
