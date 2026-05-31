-- OxyOS Messaging Enhancements Schema
-- Adds support for editing, replying, deleting, and file attachments
-- Run this in your Supabase SQL Editor

-- 1. Add new columns to messages table
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS attachment_url TEXT,
ADD COLUMN IF NOT EXISTS attachment_name TEXT,
ADD COLUMN IF NOT EXISTS attachment_type TEXT;

-- 2. Create RPC for unread counts
CREATE OR REPLACE FUNCTION get_unread_message_counts()
RETURNS TABLE (
    chat_id UUID,
    unread_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    RETURN QUERY
    SELECT m.chat_id, COUNT(*) AS unread_count
    FROM messages m
    JOIN chat_members cm ON cm.chat_id = m.chat_id
    WHERE cm.employee_id = v_user_id
      AND m.sender_id != v_user_id
      AND NOT (v_user_id = ANY(m.read_by))
    GROUP BY m.chat_id;
END;
$$;

-- 3. Create RPC for global unread count
CREATE OR REPLACE FUNCTION get_global_unread_count()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_count BIGINT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM messages m
    JOIN chat_members cm ON cm.chat_id = m.chat_id
    WHERE cm.employee_id = v_user_id
      AND m.sender_id != v_user_id
      AND NOT (v_user_id = ANY(m.read_by));

    RETURN COALESCE(v_count, 0);
END;
$$;
