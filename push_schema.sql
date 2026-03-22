-- Run this in your Supabase SQL Editor to allow Push Notifications
-- 1. Add the push subscription column to store device tokens
ALTER TABLE employees ADD COLUMN IF NOT EXISTS push_subscription JSONB;

