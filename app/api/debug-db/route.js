import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: triggers, error: trErr } = await sb.rpc('get_triggers'); // won't work if no rpc
    const { data: notesVal, error: nsErr } = await sb.from('formulations').select('notes').limit(1);
    return NextResponse.json({ notesVal, nsErr, triggers, trErr });
  } catch (err) {
    return NextResponse.json({ error: err.message });
  }
}
