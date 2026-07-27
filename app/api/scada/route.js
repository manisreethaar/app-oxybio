/**
 * POST /api/scada — Ingest sensor data into scada_streams
 * Supports: pH controller, temperature logger, DO probe, CO₂ analyser
 * Payload: { equipment_id, batch_id, sensor_type, sensor_value, unit, timestamp }
 *
 * GET /api/scada — Fetch recent sensor streams (last 200)
 */
import { createClient } from '@/utils/supabase/server';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Accept sensor data from external devices (SCADA/data loggers)
// Auth: either session cookie OR a valid CRON_SECRET header (for IoT devices)
export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    const isDevice = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isDevice) {
      // Normal session auth for manual ingestion
      const supabase = createClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const rows = Array.isArray(body) ? body : [body];

    // Validate each row
    const valid = rows.filter(r =>
      r.sensor_type && r.sensor_value != null && r.equipment_id
    ).map(r => ({
      equipment_id: r.equipment_id,
      batch_id:     r.batch_id || null,
      sensor_type:  r.sensor_type,
      sensor_value: parseFloat(r.sensor_value),
      unit:         r.unit || null,
      timestamp:    r.timestamp || new Date().toISOString(),
    }));

    if (!valid.length) return NextResponse.json({ error: 'No valid sensor rows' }, { status: 400 });

    // Use service role for device ingestion to bypass RLS
    let db;
    if (isDevice) {
      const { createClient: createAdmin } = await import('@supabase/supabase-js');
      db = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    } else {
      db = createClient();
    }

    const { data, error: insertErr } = await db.from('scada_streams').insert(valid).select('id, sensor_type, sensor_value, timestamp');
    if (insertErr) throw insertErr;

    return NextResponse.json({ success: true, inserted: data.length, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const supabase = createClient();
    const user = await getApiUserOrFallback(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const batchId    = searchParams.get('batch_id');
    const equipId    = searchParams.get('equipment_id');
    const sensorType = searchParams.get('sensor_type');

    let q = supabase
      .from('scada_streams')
      .select('*, equipment(name, model)')
      .order('timestamp', { ascending: false })
      .limit(500);

    if (batchId)    q = q.eq('batch_id', batchId);
    if (equipId)    q = q.eq('equipment_id', equipId);
    if (sensorType) q = q.eq('sensor_type', sensorType);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
