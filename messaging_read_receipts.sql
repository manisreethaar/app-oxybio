-- 1. Add read_by array to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_by UUID[] DEFAULT '{}';

-- 2. Create RPC function to mark messages as read
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
