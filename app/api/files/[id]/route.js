import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { Readable } from 'stream';

export async function GET(req, { params }) {
  try {
    const { id } = params;
    if (!id) return NextResponse.json({ error: 'File ID missing' }, { status: 400 });

    // 1. Session Enforcement
    const supabaseServer = createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return new Response('Unauthorized Access', { status: 401 });

    // 2. Google Auth Handshake
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // 3. Fetch File Metadata (for MimeType)
    const fileMetadata = await drive.files.get({
      fileId: id,
      fields: 'name, mimeType, size',
    });

    // 4. Stream File Content
    const response = await drive.files.get(
      { fileId: id, alt: 'media' },
      { responseType: 'stream' }
    );

    // 5. Pipe Stream to NextResponse
    // Convert Node.js stream to Web Stream for Next.js 14+ compat
    const webStream = Readable.toWeb(response.data);

    return new Response(webStream, {
      headers: {
        'Content-Type': fileMetadata.data.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${fileMetadata.data.name}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });

  } catch (error) {
    console.error("Secure File Proxy Error:", error);
    return new Response('File not found or access denied', { status: 404 });
  }
}
