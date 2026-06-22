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

    // Fetch the document to verify ownership or admin rights
    const { data: doc, error: docError } = await supabase.from('documents').select('uploaded_by, file_name, file_url').eq('id', id).single();
    if (docError || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    const isAdmin = ['admin', 'ceo', 'cto'].includes(emp.role);
    const isUploader = doc.uploaded_by === emp.id;

    if (!isAdmin && !isUploader) {
      return NextResponse.json({ error: 'Forbidden. You do not have permission to delete this document.' }, { status: 403 });
    }

    // Attempt to delete from storage if file_url exists
    if (doc.file_url) {
      try {
        const urlObj = new URL(doc.file_url);
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

    const { error: deleteError } = await supabase.from('documents').delete().eq('id', id);
    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Document Delete API Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
