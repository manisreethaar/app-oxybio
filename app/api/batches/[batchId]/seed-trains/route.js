export const dynamic = 'force-dynamic';
import { createClient as createAnonClient } from '@/utils/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function POST(request, { params }) {
  try {
    const { batchId } = params;
    const body = await request.json();
    const { action, payload, updates, flaskPayloads } = body;
    
    const authClient = createAnonClient();
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    const db = adminClient();
    
    if (action === 'save_setup') {
      let result;
      if (payload.id) {
        result = await db.from('batch_seed_trains').update(payload).eq('id', payload.id);
      } else {
        result = await db.from('batch_seed_trains').insert(payload).select().single();
      }
      if (result.error) throw result.error;
      return NextResponse.json({ success: true, data: result.data });
    }
    
    if (action === 'sterilise') {
      const { id, updates, employeeId } = body;
      const { error } = await db.from('batch_seed_trains').update(updates).eq('id', id);
      if (error) throw error;
      
      // Call inventory auto-debit RPC with admin client to bypass RLS
      const { data: rpcData, error: rpcErr } = await db.rpc('rpc_auto_debit_media_inventory', {
        p_seed_train_id: id,
        p_employee_id: employeeId
      });
      
      if (rpcErr) throw rpcErr;
      
      return NextResponse.json({ success: true, rpcData });
    }
    
    if (action === 'inoculate') {
      const { id, updates, flaskPayloads, batchId } = body;
      const { error: err1 } = await db.from('batch_seed_trains').update(updates).eq('id', id);
      if (err1) throw err1;
      
      // Ensure flask_full_id is present
      const enhancedFlaskPayloads = flaskPayloads.map(f => ({
        ...f,
        flask_full_id: f.flask_full_id || `${batchId}-${f.flask_label}`
      }));
      
      const { error: err2 } = await db.from('batch_flasks').insert(enhancedFlaskPayloads);
      if (err2) throw err2;
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Seed Train API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}