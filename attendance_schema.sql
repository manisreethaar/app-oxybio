-- 1. Add new columns to attendance_log table
ALTER TABLE attendance_log
ADD COLUMN IF NOT EXISTS location_lat NUMERIC,
ADD COLUMN IF NOT EXISTS location_lng NUMERIC,
ADD COLUMN IF NOT EXISTS photo_url TEXT,
ADD COLUMN IF NOT EXISTS in_geofence BOOLEAN,
ADD COLUMN IF NOT EXISTS shift_name TEXT;

-- 2. Create the storage bucket for ephemeral attendance photos (Run this in the Supabase SQL Editor as well if making buckets manually is slow)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('attendance-proofs', 'attendance-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Set up Storage RLS Policies for the bucket
-- Allow public viewing of attendance photos
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'attendance-proofs' );

-- Allow authenticated users to upload to the bucket
CREATE POLICY "Auth Upload" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'attendance-proofs' AND auth.role() = 'authenticated' );

-- 4. Enable auto-purge of old photos (Run via pg_cron, or ignore if manually purging)
-- Supabase free tier doesn't support pg_cron by default in the UI unless enabled, so we will manage this via an API/admin action later.
