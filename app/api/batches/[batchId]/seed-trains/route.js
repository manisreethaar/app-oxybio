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
      const { id, updates } = body;
      const { error } = await db.from('batch_seed_trains').update(updates).eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    
    if (action === 'inoculate') {
      const { id, updates, flaskPayloads } = body;
      const { error: err1 } = await db.from('batch_seed_trains').update(updates).eq('id', id);
      if (err1) throw err1;
      const { error: err2 } = await db.from('batch_flasks').insert(flaskPayloads);
      if (err2) throw err2;
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Seed Train API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}