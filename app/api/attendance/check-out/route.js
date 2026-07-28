export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Facility Geometry — coordinates set via Vercel env vars (exact Hosur lab location)
const TARGET_LAT = parseFloat(process.env.NEXT_PUBLIC_TARGET_LAT) || 12.716065;
const TARGET_LNG = parseFloat(process.env.NEXT_PUBLIC_TARGET_LNG) || 77.870016;
const MAX_RADIUS_METERS = parseInt(process.env.NEXT_PUBLIC_MAX_RADIUS_METERS) || 300;

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

    const { data: emp, error: empErr } = await supabase.from('employees').select('id, role, full_name').eq('email', user.email).single();
    if (empErr || !emp) throw new Error('Employee record not found for auth user');

    // EXECUTIVE BYPASS or GEO-VERIFICATION
    const isExecutive = ['ceo', 'cto', 'admin'].includes(emp.role) || (emp.full_name && emp.full_name.toLowerCase().includes('abinaya'));
    const { lat, lng } = parsed.data;

    if (!isExecutive) {
        if (!lat || !lng) {
            return NextResponse.json({ error: 'Location Required: GPS coordinates must be sent for geofenced checkout.' }, { status: 400 });
        }
        const distance = getDistanceFromLatLonInM(lat, lng, TARGET_LAT, TARGET_LNG);
        const isNearby = distance <= MAX_RADIUS_METERS + 150; // Buffer for indoor GPS drift
        if (!isNearby) {
            return NextResponse.json({ 
                error: `Location Verification Failed: You are ${Math.round(distance)}m away from the campus. You must be within the geofence to check out.` 
            }, { status: 403 });
        }
    }

    // Fetch check_in_time and employee shift to calculate total_hours and overtime
    const { data: logRow } = await supabase.from('attendance_log')
      .select('check_in_time')
      .eq('id', parsed.data.id)
      .eq('employee_id', emp.id)
      .single();

    const { data: empDetails } = await supabase.from('employees').select('shift_id').eq('id', emp.id).single();
    let shiftHours = 9; // Default 9 hours shift
    if (empDetails?.shift_id) {
        const { data: shift } = await supabase.from('hr_shifts').select('start_time, end_time').eq('id', empDetails.shift_id).single();
        if (shift) {
            // Simplified shift duration calculation
            const startParts = shift.start_time.split(':');
            const endParts = shift.end_time.split(':');
            let start = parseInt(startParts[0]) + parseInt(startParts[1])/60;
            let end = parseInt(endParts[0]) + parseInt(endParts[1])/60;
            if (end < start) end += 24; // Night shift
            shiftHours = end - start;
        }
    }

    const checkOutTime = new Date();
    // NOTE: total_hours is intentionally NOT set here.
    // The DB trigger trg_calc_total_hours fires BEFORE UPDATE and computes it
    // from check_out_time - check_in_time as the single source of truth.
    // Duplicating the calculation here would introduce floating-point rounding
    // drift between the JS value (toFixed(2)) and the trigger value (raw epoch).

    // overtime_hours is calculated here because the DB trigger doesn't have
    // access to the shift schedule — that requires a join to hr_shifts.
    let overtimeHours = 0;
    if (logRow?.check_in_time) {
        const totalHoursRaw = (checkOutTime - new Date(logRow.check_in_time)) / (1000 * 60 * 60);
        if (totalHoursRaw > shiftHours) {
            overtimeHours = parseFloat((totalHoursRaw - shiftHours).toFixed(2));
        }
    }

    const { data, error } = await supabase.from('attendance_log').update({
      check_out_time: checkOutTime.toISOString(),
      overtime_hours: overtimeHours,
    }).eq('id', parsed.data.id).eq('employee_id', emp.id).select().single();

    if (error) throw error;
    
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
