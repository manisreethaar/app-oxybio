import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { createClient as createServerClient } from '@/utils/supabase/server';

export async function POST(req) {
  try {
    // 1. Core Authentication Check with Timeout
    const supabaseServer = createServerClient();
    const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms));

    const { data: { user } } = await Promise.race([
        supabaseServer.auth.getUser(),
        timeout(5000)
    ]).catch(err => ({ data: { user: null }, error: err }));

    if (!user) return NextResponse.json({ error: 'Unauthorized Upload Attempt or Auth Timeout' }, { status: 401 });

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
        "25504446": "application/pdf",
        "52494646": "image/webp" // Added support for WEBP (RIFF)
    };

    const detected = signatures[hex] || signatures[hex.substring(0,6)];
    if (!detected && !type.startsWith('video/') && file.name !== 'selfie.webp' && file.name !== 'selfie.jpeg') {
        // Allow videos and dynamic web-capture selfies but block mismatched/suspicious documents/images
        if (!type.includes('csv') && !type.includes('sheet')) {
             return NextResponse.json({ error: `Security Violation: File signature mismatch (${hex})` }, { status: 403 });
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

    // 4. Transform File to Buffer (Reliable for Google APIs)
    const arrayBuffer = await file.arrayBuffer();
    const bufferStream = new Readable();
    bufferStream.push(Buffer.from(arrayBuffer));
    bufferStream.push(null);

    // 5. Environmental Key Guard Check (Diagnostic)
    const missing = [];
    if (!process.env.GOOGLE_CLIENT_EMAIL) missing.push('GOOGLE_CLIENT_EMAIL');
    if (!process.env.GOOGLE_PRIVATE_KEY) missing.push('GOOGLE_PRIVATE_KEY');
    if (!process.env.GOOGLE_DRIVE_FOLDER_ID) missing.push('GOOGLE_DRIVE_FOLDER_ID');

    if (missing.length > 0) {
      console.error(`UPLOAD CONFIG FAILURE: Missing ${missing.join(', ')}`);
      return NextResponse.json({ 
        error: `Deployment Configuration Error: The following Environment Variables are missing: ${missing.join(', ')}. Please add them to your Vercel/Host settings.` 
      }, { status: 500 });
    }

    // 6. Direct Google Drive API Integration Handshake
    // 🛡️ SECURITY HARDENING: Handle common formatting issues in pasted Private Keys
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.substring(1, privateKey.length - 1);
    }
    // Ensure literal \n are transformed to real newlines
    privateKey = privateKey.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });
    
    // File Identity Sanitation
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    console.log(`Starting buffed upload for: ${safeName} (${file.size} bytes)`);

    const driveResponse = await Promise.race([
      drive.files.create({
        requestBody: { name: safeName, parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] },
        media: { mimeType: file.type, body: bufferStream },
        fields: 'id, webViewLink, webContentLink',
      }),
      timeout(15000) // 15s absolute limit for GDrive handshake
    ]);

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
