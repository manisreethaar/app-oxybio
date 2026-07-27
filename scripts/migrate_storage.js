const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Fill these in via env vars before running — do not hardcode secrets here.
const CLOUD_URL = process.env.MIGRATE_CLOUD_SUPABASE_URL;
const CLOUD_SERVICE_KEY = process.env.MIGRATE_CLOUD_SERVICE_ROLE_KEY; // Get from .env.local SUPABASE_SERVICE_ROLE_KEY

const LOCAL_URL = process.env.MIGRATE_LOCAL_SUPABASE_URL; // Or whatever Cloudflare tunnel URL you made
const LOCAL_SERVICE_KEY = process.env.MIGRATE_LOCAL_SERVICE_ROLE_KEY; // The script will output this on the Ubuntu server

if (!CLOUD_URL || !CLOUD_SERVICE_KEY || !LOCAL_URL || !LOCAL_SERVICE_KEY) {
  console.error('Missing one of MIGRATE_CLOUD_SUPABASE_URL, MIGRATE_CLOUD_SERVICE_ROLE_KEY, MIGRATE_LOCAL_SUPABASE_URL, MIGRATE_LOCAL_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

async function migrateStorage() {
  console.log('Connecting to Supabase...');
  const cloud = createClient(CLOUD_URL, CLOUD_SERVICE_KEY);
  const local = createClient(LOCAL_URL, LOCAL_SERVICE_KEY);

  console.log('Fetching buckets from Cloud...');
  const { data: buckets, error: bucketsErr } = await cloud.storage.listBuckets();
  if (bucketsErr) throw bucketsErr;

  for (const bucket of buckets) {
    console.log(`\nProcessing Bucket: ${bucket.name}`);
    
    // Create bucket locally if it doesn't exist
    const { data: localBuckets } = await local.storage.listBuckets();
    if (!localBuckets.find(b => b.name === bucket.name)) {
      console.log(`Creating bucket ${bucket.name} locally...`);
      await local.storage.createBucket(bucket.name, { public: bucket.public });
    }

    // Recursively list files
    const files = await listAllFiles(cloud, bucket.name, '');
    console.log(`Found ${files.length} files in ${bucket.name}.`);

    let i = 0;
    for (const file of files) {
      i++;
      if (!file.name || file.name === '.emptyFolderPlaceholder') continue;
      
      console.log(`[${i}/${files.length}] Transferring ${file.path}...`);
      
      // Download
      const { data: fileData, error: dlErr } = await cloud.storage.from(bucket.name).download(file.path);
      if (dlErr) {
        console.error(`Failed to download ${file.path}:`, dlErr.message);
        continue;
      }

      // Upload
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const { error: upErr } = await local.storage.from(bucket.name).upload(file.path, buffer, { upsert: true });
      if (upErr) {
        console.error(`Failed to upload ${file.path}:`, upErr.message);
      }
    }
  }
  console.log('\n✅ Storage Migration Complete!');
}

async function listAllFiles(supabase, bucket, folderPath) {
  let allFiles = [];
  const { data, error } = await supabase.storage.from(bucket).list(folderPath, { limit: 1000 });
  if (error) return [];
  
  for (const item of data) {
    const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name;
    if (!item.id) {
      // It's a folder
      const subFiles = await listAllFiles(supabase, bucket, fullPath);
      allFiles = allFiles.concat(subFiles);
    } else {
      item.path = fullPath;
      allFiles.push(item);
    }
  }
  return allFiles;
}

migrateStorage().catch(console.error);
