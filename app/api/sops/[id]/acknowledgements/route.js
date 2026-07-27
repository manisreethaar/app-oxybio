export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { getApiUserOrFallback } from '@/utils/supabase/get-api-user';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const supabase = createClient();
    const { id } = params;

    const user = await getApiUserOrFallback(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp, error: empError } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (empError || !emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const isAdmin = ['admin', 'ceo', 'cto'].includes(emp.role);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden. You do not have permission to view acknowledgements.' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('sop_acknowledgements')
      .select(`
        id,
        acknowledged_at,
        employees (
          id,
          full_name,
          initials,
          role
        )
      `)
      .eq('sop_id', id)
      .order('acknowledged_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Fetch Acknowledgements API Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
