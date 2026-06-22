import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function DELETE(request, { params }) {
  try {
    const supabase = createClient();
    const { id } = params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: emp, error: empError } = await supabase.from('employees').select('id, role').eq('email', user.email).single();
    if (empError || !emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

    const isAdmin = ['admin', 'ceo', 'cto'].includes(emp.role);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden. You do not have permission to delete this SOP.' }, { status: 403 });
    }

    const { data: sop, error: sopError } = await supabase.from('sop_library').select('document_url').eq('id', id).single();
    
    if (sopError) {
       console.error("SOP lookup failed", sopError);
       return NextResponse.json({ error: 'SOP not found' }, { status: 404 });
    }

    // 1. Delete associated acknowledgements first to prevent foreign key errors
    await supabase.from('sop_acknowledgements').delete().eq('sop_id', id);

    // 2. Delete the actual SOP
    const { error: deleteError } = await supabase.from('sop_library').delete().eq('id', id);
    if (deleteError) throw deleteError;

    // 3. Attempt to remove the file from storage
    if (sop?.document_url) {
      try {
        const urlObj = new URL(sop.document_url);
        const pathSegments = urlObj.pathname.split('/');
        const uploadsIndex = pathSegments.indexOf('uploads');
        if (uploadsIndex !== -1) {
          const filePath = pathSegments.slice(uploadsIndex).join('/');
          await supabase.storage.from('inventory-docs').remove([filePath]);
        }
      } catch (e) {
        console.error('Failed to delete file from storage:', e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('SOP Delete API Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
