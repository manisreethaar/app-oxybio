import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const data = await request.formData();
    const file = data.get('file');

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const supabase = createClient();
    
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
