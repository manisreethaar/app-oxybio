-- ============================================================
-- OxyOS Messaging Module - Complete Setup & Fix Script
-- Run this ENTIRE script in Supabase SQL Editor
-- It is safe to run multiple times (all operations are idempotent)
-- ============================================================

-- STEP 1: Add missing columns to messages table
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS attachment_url TEXT,
ADD COLUMN IF NOT EXISTS attachment_name TEXT,
ADD COLUMN IF NOT EXISTS attachment_type TEXT;

-- STEP 2: Fix RLS Policies - drop and recreate all messaging policies cleanly
DROP POLICY IF EXISTS emp_select_chats ON chats;
DROP POLICY IF EXISTS emp_insert_chats ON chats;
DROP POLICY IF EXISTS emp_update_chats ON chats;
DROP POLICY IF EXISTS emp_select_chat_members ON chat_members;
DROP POLICY IF EXISTS emp_insert_chat_members ON chat_members;
DROP POLICY IF EXISTS emp_select_messages ON messages;
DROP POLICY IF EXISTS emp_insert_messages ON messages;
DROP POLICY IF EXISTS emp_update_messages ON messages;
DROP POLICY IF EXISTS emp_delete_messages ON messages;

-- Chats: read if member
CREATE POLICY emp_select_chats ON chats FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = id AND cm.employee_id = auth_employee_id())
);
-- Chats: anyone authenticated can create (app logic gates admin-only groups)
CREATE POLICY emp_insert_chats ON chats FOR INSERT WITH CHECK (
    created_by = auth_employee_id()
);

-- Chat Members: read if in same chat
CREATE POLICY emp_select_chat_members ON chat_members FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = chat_id AND cm.employee_id = auth_employee_id())
);
-- Chat Members: insert if authenticated (creation step — creator adds members)
CREATE POLICY emp_insert_chat_members ON chat_members FOR INSERT WITH CHECK (
    auth_employee_id() IS NOT NULL
);

-- Messages: read if member of chat
CREATE POLICY emp_select_messages ON messages FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = chat_id AND cm.employee_id = auth_employee_id())
);
-- Messages: insert as self
CREATE POLICY emp_insert_messages ON messages FOR INSERT WITH CHECK (
    sender_id = auth_employee_id()
);
-- Messages: update own messages only
CREATE POLICY emp_update_messages ON messages FOR UPDATE USING (
    sender_id = auth_employee_id()
);
-- Messages: delete own messages only
CREATE POLICY emp_delete_messages ON messages FOR DELETE USING (
    sender_id = auth_employee_id()
);

-- STEP 3: Ensure RLS is enabled on all tables
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- STEP 4: Realtime (safe to re-run)
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chats; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- STEP 5: Mark messages read RPC
CREATE OR REPLACE FUNCTION mark_messages_read(p_chat_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth_employee_id();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    UPDATE messages
    SET read_by = array_append(read_by, v_user_id)
    WHERE chat_id = p_chat_id
      AND sender_id != v_user_id
      AND NOT (v_user_id = ANY(read_by));
END;
$$;

-- STEP 6: Unread counts RPC
CREATE OR REPLACE FUNCTION get_unread_message_counts()
RETURNS TABLE (chat_id UUID, unread_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_user_id UUID;
BEGIN
    v_user_id := auth_employee_id();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
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

-- STEP 7: Global unread count RPC
CREATE OR REPLACE FUNCTION get_global_unread_count()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_count BIGINT;
BEGIN
    v_user_id := auth_employee_id();
    IF v_user_id IS NULL THEN RETURN 0; END IF;
    SELECT COUNT(*) INTO v_count
    FROM messages m
    JOIN chat_members cm ON cm.chat_id = m.chat_id
    WHERE cm.employee_id = v_user_id
      AND m.sender_id != v_user_id
      AND NOT (v_user_id = ANY(m.read_by));
    RETURN COALESCE(v_count, 0);
END;
$$;
