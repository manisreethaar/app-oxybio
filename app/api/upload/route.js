import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { requireInventoryPermission } from '@/lib/inventory/access';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf', 
  'image/png', 
  'image/jpeg',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // .xlsx
]);

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const data = await request.formData();
    const file = data.get('file');

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, error: 'Invalid file type. Only PDF, Image, Word, and Excel files are allowed' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ success: false, error: 'File size must be 10 MB or less' }, { status: 400 });
    }
    
    // Convert to buffer for Upload
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Generate secure unique filename
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const safeName = `${timestamp}-${cleanFileName}`;
    
    // Upload straight to Supabase 'inventory-docs' bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('inventory-docs')
      .upload(`uploads/${safeName}`, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true
      });

    if (uploadError) {
      console.error("Supabase Storage Upload Error:", uploadError);
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    // Capture the Public CDN URL 
    const { data: publicUrlData } = supabase.storage
      .from('inventory-docs')
      .getPublicUrl(`uploads/${safeName}`);

    return NextResponse.json({ 
      success: true, 
      url: publicUrlData.publicUrl 
    });

  } catch (error) {
    console.error("General Upload Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
