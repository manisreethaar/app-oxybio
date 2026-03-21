import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { createClient as createServerClient } from '@/utils/supabase/server';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req) {
  try {
    // Basic auth check
    const supabaseServer = createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file');
    const folder = formData.get('folder') || 'oxyos_uploads';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Security: enforce 10MB size cap to prevent billing abuse
    const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 413 });
    }

    // Security: whitelist MIME types — block executables, scripts, archives
    const ALLOWED_TYPES = ['image/jpeg','image/png','image/webp','image/gif','application/pdf','video/mp4'];
    if (file.type && !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'File type not permitted.' }, { status: 415 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'auto', folder },
        (error, result) => {
          if (error) {
            console.error("Cloudinary Error:", error);
            resolve(NextResponse.json({ error: error.message }, { status: 500 }));
          } else {
            resolve(NextResponse.json({ url: result.secure_url, name: file.name || 'upload' }));
          }
        }
      );
      
      uploadStream.end(buffer);
    });
  } catch (error) {
    console.error("Upload API Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
