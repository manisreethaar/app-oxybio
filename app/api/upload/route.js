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
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const name = file.name;
    const type = file.type;
    const size = file.size;

    // 1. Magic Byte Validation (Zero-dependency security)
    const buffer = await file.slice(0, 4).arrayBuffer();
    const header = new Uint8Array(buffer);
    let hex = "";
    for (let i = 0; i < header.length; i++) {
        hex += header[i].toString(16).toUpperCase();
    }
    
    const signatures = {
        "89504E47": "image/png",
        "FFD8FFE0": "image/jpeg",
        "FFD8FFE1": "image/jpeg",
        "FFD8FFE2": "image/jpeg",
        "25504446": "application/pdf"
    };

    const detected = signatures[hex] || signatures[hex.substring(0,6)];
    if (!detected && !type.startsWith('video/')) {
        // Allow videos but block mismatched/suspicious documents/images
        if (!type.includes('csv') && !type.includes('sheet')) {
             return NextResponse.json({ error: 'Security Violation: File signature mismatch' }, { status: 403 });
        }
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

    // 4. Transform File to Stream (Memory Efficient)
    const stream = Readable.fromWeb(file.stream());

    // 5. Environmental Key Guard Check
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_DRIVE_FOLDER_ID) {
      return NextResponse.json({ error: 'Config missing: GOOGLE_CLIENT_EMAIL, PRIVATE_KEY, or FOLDER_ID.' }, { status: 500 });
    }

    // 6. Direct Google Drive API Integration Handshake
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });
    
    // File Identity Sanitation
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    console.log(`Starting streaming upload for: ${safeName} (${file.size} bytes)`);

    const driveResponse = await drive.files.create({
      requestBody: {
        name: safeName,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      },
      media: {
        mimeType: file.type,
        body: stream, // Streaming body
      },
      fields: 'id, webViewLink, webContentLink',
    });

    // ARCHITECTURAL FIX: REMOVED drive.permissions.create({ role: 'reader', type: 'anyone' })
    // Files are now PRIVATE by default. Use /api/files/[id] proxy to view.


    const proxiedUrl = `/api/files/${driveResponse.data.id}`;

    return NextResponse.json({ 
      url: proxiedUrl, // For secure internal app usage
      drive_view_link: driveResponse.data.webViewLink,    // Admin metadata
      drive_download_link: driveResponse.data.webContentLink,
      name: file.name
    });

  } catch (error) {
    console.error("Critical Google Drive Upload Fault:", error);
    return NextResponse.json({ error: error.message || 'Catastrophic Engine Failure' }, { status: 500 });
  }
}
