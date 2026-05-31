-- OxyOS Messaging Module Schema
-- Run this in your Supabase SQL Editor

-- 1. Create Tables

CREATE TABLE chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT, -- Optional, used for groups
    type TEXT CHECK (type IN ('individual', 'group', 'announcement')) DEFAULT 'individual',
    created_by UUID REFERENCES employees(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('admin', 'member')) DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(chat_id, employee_id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    content TEXT,
    image_url TEXT,
    pinned_item_type TEXT CHECK (pinned_item_type IN ('task', 'batch', 'activity', 'ph_reading', 'none')) DEFAULT 'none',
    pinned_item_id TEXT, -- Stored as text to accommodate different ID types
    mentions UUID[], -- Array of employee IDs mentioned
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Row Level Security (RLS)

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Chats Policies
-- Users can read chats they are a member of
CREATE POLICY emp_select_chats ON chats FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members WHERE chat_id = chats.id AND employee_id = auth_employee_id())
);

-- Only admins can create group chats, anyone can create individual chats
CREATE POLICY emp_insert_chats ON chats FOR INSERT WITH CHECK (
    (type = 'individual' AND created_by = auth_employee_id()) OR
    (type IN ('group', 'announcement') AND is_admin() AND created_by = auth_employee_id())
);

-- Chat Members Policies
-- Users can read members of chats they belong to
CREATE POLICY emp_select_chat_members ON chat_members FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = chat_members.chat_id AND cm.employee_id = auth_employee_id())
);

-- Users can add members to individual chats if they are part of it (for initial creation)
-- Only admins can add members to groups
CREATE POLICY emp_insert_chat_members ON chat_members FOR INSERT WITH CHECK (
    (EXISTS (SELECT 1 FROM chats WHERE id = chat_id AND type = 'individual')) OR
    (EXISTS (SELECT 1 FROM chats WHERE id = chat_id AND type IN ('group', 'announcement') AND is_admin()))
);

-- Messages Policies
-- Users can read messages in chats they belong to
CREATE POLICY emp_select_messages ON messages FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members WHERE chat_id = messages.chat_id AND employee_id = auth_employee_id())
);

-- Users can insert messages into chats they belong to
CREATE POLICY emp_insert_messages ON messages FOR INSERT WITH CHECK (
    sender_id = auth_employee_id() AND
    EXISTS (SELECT 1 FROM chat_members WHERE chat_id = messages.chat_id AND employee_id = auth_employee_id())
);

-- 3. Enable Realtime for Messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chats;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_members;

-- 4. Storage bucket for chat attachments (Manual creation recommended via UI)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true);
-- To secure the bucket properly, use the Supabase dashboard to create 'chat-attachments' as a public bucket or authenticated bucket.
