-- Task Management V2: Acknowledgment & Progress Tracking
-- Run this in your Supabase SQL Editor

-- 1. Add progress and acknowledgment columns to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_logs JSONB DEFAULT '[]'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_acknowledged BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progressed_at TIMESTAMP WITH TIME ZONE;

-- 2. Add helpful constraints
ALTER TABLE tasks ADD CONSTRAINT progress_range CHECK (progress_percentage >= 0 AND progress_percentage <= 100);

-- 3. (Optional) Index for faster retrieval if your task list grows large
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(id) WHERE is_acknowledged = FALSE;
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Note: Existing RLS policies already allow updates by assignee and select by creator.
