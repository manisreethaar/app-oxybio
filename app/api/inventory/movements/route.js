import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const stock_id = searchParams.get('stock_id');

    if (!stock_id) {
      return NextResponse.json({ success: false, error: 'Stock ID is required' }, { status: 400 });
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*, issued_by(email)') // Assuming auth.users email for now, or profiles
      .eq('stock_id', stock_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, data });

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
