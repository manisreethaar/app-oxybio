import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { Readable } from 'stream';

export async function POST(request) {
  try {
    const data = await request.formData();
    const file = data.get('file');

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const stream = Readable.from(buffer);

    // Normalise Google private key — Vercel can store with literal \n or real newlines
    const rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
    const privateKey = rawKey.includes('\\n') 
      ? rawKey.replace(/\\n/g, '\n')   // stored as literal \n → convert to real newlines
      : rawKey;                          // already has real newlines → use as-is

    // 1. Google Auth with Write/Upload Scopes
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'], 
    });

    const drive = google.drive({ version: 'v3', auth });

    // 2. Create file on Google Drive
    const driveResponse = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: ['1yFID5vJ56zTWsBN8OCRWLIVfP6hpLjAB'], // Target folder ID provided by user
      },
      media: {
        mimeType: file.type || 'application/octet-stream',
        body: stream,
      },
      fields: 'id',
    });

    const fileId = driveResponse.data.id;

    // Return proxy URL to load it via the central secure files reader endpoint
    return NextResponse.json({ 
      success: true, 
      url: `/api/files/${fileId}` 
    });

  } catch (error) {
    console.error("Google Drive Upload Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
