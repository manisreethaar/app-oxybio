import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('role').eq('email', user.email).single();
    if (!['admin', 'ceo', 'cto'].includes(emp?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .eq('key', 'thresholds')
      .maybeSingle();

    if (error) throw error;

    const defaults = { minPh: 3.5, maxPh: 7.5, tempMax: 40 };
    
    return NextResponse.json({ 
      success: true, 
      data: data ? { ...defaults, ...JSON.parse(data.value) } : defaults 
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp } = await supabase.from('employees').select('role').eq('email', user.email).single();
    if (!['admin', 'ceo', 'cto'].includes(emp?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { minPh, maxPh, tempMax } = body;

    const thresholds = {
      minPh: parseFloat(minPh) || 3.5,
      maxPh: parseFloat(maxPh) || 7.5,
      tempMax: parseInt(tempMax) || 40
    };

    const { error: upsertError } = await supabase
      .from('app_settings')
      .upsert({ 
        key: 'thresholds', 
        value: JSON.stringify(thresholds),
        updated_by: emp?.id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    if (upsertError) throw upsertError;

    return NextResponse.json({ success: true, data: thresholds });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
