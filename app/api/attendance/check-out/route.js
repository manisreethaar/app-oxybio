import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Facility Geometry
const TARGET_LAT = parseFloat(process.env.NEXT_PUBLIC_TARGET_LAT) || 12.7409; 
const TARGET_LNG = parseFloat(process.env.NEXT_PUBLIC_TARGET_LNG) || 77.8253; 
const MAX_RADIUS_METERS = parseInt(process.env.NEXT_PUBLIC_MAX_RADIUS_METERS) || 350; // Use the 350m strict buffer

// Haversine formula (Server-side Source of Truth)
const getDistanceFromLatLonInM = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * (Math.PI / 180);  
  const dLon = (lon2 - lon1) * (Math.PI / 180); 
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c;
};

const checkoutSchema = z.object({
  id: z.string().uuid('Invalid attendance log ID'),
  lat: z.number().optional(),
  lng: z.number().optional()
});

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });

    const { data: emp, error: empErr } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (empErr || !emp) throw new Error('Employee record not found for auth user');

    // EXECUTIVE BYPASS or GEO-VERIFICATION
    const isExecutive = ['ceo', 'cto', 'admin'].includes(emp.role);
    const { lat, lng } = parsed.data;

    if (!isExecutive) {
        if (!lat || !lng) {
            return NextResponse.json({ error: 'Location Required: GPS coordinates must be sent for geofenced checkout.' }, { status: 400 });
        }
        const distance = getDistanceFromLatLonInM(lat, lng, TARGET_LAT, TARGET_LNG);
        if (distance > MAX_RADIUS_METERS) {
            return NextResponse.json({ 
                error: `Location Verification Failed: You are ${Math.round(distance)}m away from the campus. You must be within the geofence to check out.` 
            }, { status: 403 });
        }
    }

    // Fetch check_in_time to calculate total_hours
    const { data: logRow } = await supabase.from('attendance_log')
      .select('check_in_time')
      .eq('id', parsed.data.id)
      .eq('employee_id', emp.id)
      .single();

    const checkOutTime = new Date();
    const totalHours = logRow?.check_in_time
      ? parseFloat(((checkOutTime - new Date(logRow.check_in_time)) / (1000 * 60 * 60)).toFixed(2))
      : null;

    const { data, error } = await supabase.from('attendance_log').update({
      check_out_time: checkOutTime.toISOString(),
      ...(totalHours !== null ? { total_hours: totalHours } : {}),
    }).eq('id', parsed.data.id).eq('employee_id', emp.id).select().single();

    if (error) throw error;
    
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
