-- Task Management Upgrades - SQL Migration
-- Run this in Supabase SQL Editor

-- 1. Add new columns to the tasks table
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS checklist        JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS approval_status  TEXT  DEFAULT 'not_required',
ADD COLUMN IF NOT EXISTS proof_url        TEXT,
ADD COLUMN IF NOT EXISTS time_started_at  TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS logged_minutes   INTEGER DEFAULT 0;

-- Values for approval_status: 'not_required' | 'pending_review' | 'approved' | 'rejected'
-- Values for status (existing): 'open' | 'in-progress' | 'done' | 'cancelled'

-- 2. Add checklist to existing tasks (safe default)
UPDATE tasks SET checklist = '[]'::jsonb WHERE checklist IS NULL;
UPDATE tasks SET approval_status = 'not_required' WHERE approval_status IS NULL;
UPDATE tasks SET logged_minutes = 0 WHERE logged_minutes IS NULL;
