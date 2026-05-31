-- OxyOS Messaging Module Full Setup Schema
-- Run this entire script in your Supabase SQL Editor

-- 1. Create Tables

CREATE TABLE IF NOT EXISTS chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT, -- Optional, used for groups
    type TEXT CHECK (type IN ('individual', 'group', 'announcement')) DEFAULT 'individual',
    created_by UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('admin', 'member')) DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(chat_id, employee_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    content TEXT,
    image_url TEXT,
    pinned_item_type TEXT CHECK (pinned_item_type IN ('task', 'batch', 'activity', 'ph_reading', 'none')) DEFAULT 'none',
    pinned_item_id TEXT, -- Stored as text to accommodate different ID types
    mentions UUID[], -- Array of employee IDs mentioned
    read_by UUID[] DEFAULT '{}', -- Array of employee IDs who read the message
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Row Level Security (RLS)

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Chats Policies
-- Users can read chats they are a member of
DROP POLICY IF EXISTS emp_select_chats ON chats;
CREATE POLICY emp_select_chats ON chats FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members WHERE chat_id = chats.id AND employee_id = auth_employee_id())
);

-- Only admins can create group chats, anyone can create individual chats
DROP POLICY IF EXISTS emp_insert_chats ON chats;
CREATE POLICY emp_insert_chats ON chats FOR INSERT WITH CHECK (
    (type = 'individual' AND created_by = auth_employee_id()) OR
    (type IN ('group', 'announcement') AND is_admin() AND created_by = auth_employee_id())
);

-- Chat Members Policies
-- Users can read members of chats they belong to
DROP POLICY IF EXISTS emp_select_chat_members ON chat_members;
CREATE POLICY emp_select_chat_members ON chat_members FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = chat_members.chat_id AND cm.employee_id = auth_employee_id())
);

-- Users can add members to individual chats if they are part of it (for initial creation)
-- Only admins can add members to groups
DROP POLICY IF EXISTS emp_insert_chat_members ON chat_members;
CREATE POLICY emp_insert_chat_members ON chat_members FOR INSERT WITH CHECK (
    (EXISTS (SELECT 1 FROM chats WHERE id = chat_id AND type = 'individual')) OR
    (EXISTS (SELECT 1 FROM chats WHERE id = chat_id AND type IN ('group', 'announcement') AND is_admin()))
);

-- Messages Policies
-- Users can read messages in chats they belong to
DROP POLICY IF EXISTS emp_select_messages ON messages;
CREATE POLICY emp_select_messages ON messages FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members WHERE chat_id = messages.chat_id AND employee_id = auth_employee_id())
);

-- Users can insert messages into chats they belong to
DROP POLICY IF EXISTS emp_insert_messages ON messages;
CREATE POLICY emp_insert_messages ON messages FOR INSERT WITH CHECK (
    sender_id = auth_employee_id() AND
    EXISTS (SELECT 1 FROM chat_members WHERE chat_id = messages.chat_id AND employee_id = auth_employee_id())
);

-- 3. Enable Realtime for Messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chats;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_members;

-- 4. Create Read Receipt RPC Function
CREATE OR REPLACE FUNCTION mark_messages_read(p_chat_id UUID)
RETURNS void
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

    -- Ensure the user is a member of the chat
    IF NOT EXISTS (SELECT 1 FROM chat_members WHERE chat_id = p_chat_id AND employee_id = v_user_id) THEN
        RAISE EXCEPTION 'Not a member of this chat';
    END IF;

    -- Update unread messages sent by others
    UPDATE messages 
    SET read_by = array_append(read_by, v_user_id)
    WHERE chat_id = p_chat_id 
      AND sender_id != v_user_id 
      AND NOT (v_user_id = ANY(read_by));
END;
$$;
