import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { createClient as createServerClient } from '@/utils/supabase/server';

export async function POST(req) {
  try {
    // 1. Core Authentication Check
    const supabaseServer = createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized Upload Attempt' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file blob provided in request.' }, { status: 400 });
    }

    // 2. Upgraded File Size Constraints (50MB for robust limits)
    const MAX_BYTES = 50 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File size exceeds 50MB Google Drive allocation max.' }, { status: 413 });
    }

    // 3. Allowed MIME Types (Added Office/Docs)
    const ALLOWED_TYPES = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 
      'application/pdf', 'video/mp4', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv'
    ];
    if (file.type && !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `File type ${file.type} is not allowed by corporate proxy.` }, { status: 415 });
    }

    // 4. Transform File to Stream Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    // 5. Environmental Key Guard Check
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_DRIVE_FOLDER_ID) {
      return NextResponse.json({ error: 'Google Server Integration missing setup. Supply GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_DRIVE_FOLDER_ID in .env.local.' }, { status: 500 });
    }

    // 6. Direct Google Drive API Integration Handshake
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        // Automatically repair escaped newlines typical in .env strings
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });
    
    // File Identity Sanitation
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    const driveResponse = await drive.files.create({
      requestBody: {
        name: safeName,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      },
      media: {
        mimeType: file.type,
        body: stream,
      },
      fields: 'id, webViewLink, webContentLink',
    });

    // 7. Grant Public Reader Access so React `<img src={} />` works natively
    await drive.permissions.create({
      fileId: driveResponse.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    return NextResponse.json({ 
      url: driveResponse.data.webViewLink,          // For viewing in browser
      download_url: driveResponse.data.webContentLink, // For direct access
      name: file.name
    });

  } catch (error) {
    console.error("Critical Google Drive Upload Fault:", error);
    return NextResponse.json({ error: error.message || 'Catastrophic Engine Failure' }, { status: 500 });
  }
}
