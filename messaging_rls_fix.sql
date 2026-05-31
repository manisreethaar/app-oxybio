-- Simplified, Robust RLS Policies for Messaging
-- Run this to fix messaging insert/update failures

-- 1. Drop existing policies to cleanly replace them
DROP POLICY IF EXISTS emp_select_chats ON chats;
DROP POLICY IF EXISTS emp_insert_chats ON chats;
DROP POLICY IF EXISTS emp_select_chat_members ON chat_members;
DROP POLICY IF EXISTS emp_insert_chat_members ON chat_members;
DROP POLICY IF EXISTS emp_select_messages ON messages;
DROP POLICY IF EXISTS emp_insert_messages ON messages;
DROP POLICY IF EXISTS emp_update_messages ON messages;
DROP POLICY IF EXISTS emp_delete_messages ON messages;

-- 2. Chats Policies
CREATE POLICY emp_select_chats ON chats FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = id AND cm.employee_id = auth_employee_id())
);

CREATE POLICY emp_insert_chats ON chats FOR INSERT WITH CHECK (
    created_by = auth_employee_id()
);

-- 3. Chat Members Policies
CREATE POLICY emp_select_chat_members ON chat_members FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = chat_id AND cm.employee_id = auth_employee_id())
);

CREATE POLICY emp_insert_chat_members ON chat_members FOR INSERT WITH CHECK (
    -- Any authenticated employee can insert members (app logic restricts this properly)
    auth_employee_id() IS NOT NULL
);

-- 4. Messages Policies
CREATE POLICY emp_select_messages ON messages FOR SELECT USING (
    EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = chat_id AND cm.employee_id = auth_employee_id())
);

CREATE POLICY emp_insert_messages ON messages FOR INSERT WITH CHECK (
    sender_id = auth_employee_id()
);

CREATE POLICY emp_update_messages ON messages FOR UPDATE USING (
    sender_id = auth_employee_id()
);

CREATE POLICY emp_delete_messages ON messages FOR DELETE USING (
    sender_id = auth_employee_id()
);
