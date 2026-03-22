import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

// Facility Geometry (Hosur TBI)
const TARGET_LAT = 12.7409; 
const TARGET_LNG = 77.8253; 
const MAX_RADIUS_METERS = 250; // SLIGHTLY wider for GPS drift

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

export async function POST(request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lat, lng, photo_url, override } = await request.json();

    // 1. Authorization check
    const { data: emp } = await supabase.from('employees').select('id, role').eq('id', user.id).single();
    if (!emp) return NextResponse.json({ error: 'Employee record not found' }, { status: 404 });

    // 2. Geofence Verification (Server-side with Fallback)
    const distance = getDistanceFromLatLonInM(lat, lng, TARGET_LAT, TARGET_LNG);
    const inGeofence = distance <= MAX_RADIUS_METERS;
    const isNearby = distance <= 350; // Buffer for indoor accuracy degradation

    // Protocol: If not in geofence but nearby, require a photo (Liveness Fallback)
    if (!inGeofence && !override) {
        if (isNearby && photo_url) {
            // Allow with a 'Degraded Accuracy' flag
            console.log(`Geofence Fallback triggered for distance: ${Math.round(distance)}m`);
        } else {
            return NextResponse.json({ 
                error: `Location Verification Failed: You are ${Math.round(distance)}m away. Move closer or ensure a verification photo is attached for manual audit.` 
            }, { status: 403 });
        }
    }

    // Admin override check
    if (override && emp.role !== 'admin') {
         return NextResponse.json({ error: 'Location override restricted to Administrators' }, { status: 403 });
    }

    // 3. Prevent Duplicate Log (Same Day)
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase.from('attendance_log')
        .select('id')
        .eq('employee_id', emp.id)
        .eq('date', todayStr)
        .maybeSingle();

    if (existing) {
        return NextResponse.json({ error: 'Attendance already logged for today' }, { status: 400 });
    }

    // 4. Atomic Insert
    const { data, error: dbError } = await supabase.from('attendance_log').insert({
        employee_id: emp.id,
        date: todayStr,
        check_in_time: new Date().toISOString(),
        location_lat: lat,
        location_lng: lng,
        in_geofence: inGeofence,
        photo_url: photo_url
    }).select().single();

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('Check-in API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
