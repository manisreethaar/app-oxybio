-- ============================================================
-- OxyOS Bug Fix Migration
-- Run this in Supabase SQL Editor, then reload schema cache.
-- Supabase → Settings → API → Reload Schema Cache
-- ============================================================

-- Fix 2: Add missing email column to vendors table
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS email text;

-- Fix 3: Create missing regulatory_milestones table
create table if not exists public.regulatory_milestones (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  category text,
  deadline date,
  status text default 'Pending',
  priority text default 'High',
  description text,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone default now()
);
