-- Supabase Migration: Notify Task Assigner on Completion
-- Please run this directly in the Supabase SQL Editor

CREATE OR REPLACE FUNCTION notify_task_completion() RETURNS TRIGGER AS $$
BEGIN
    -- Check if status changed to 'done'
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
        -- Insert a notification for the person who assigned the task
        INSERT INTO notifications (employee_id, title, message, type, link)
        VALUES (
            NEW.assigned_by,
            'Task Completed: ' || NEW.title,
            'The task has been marked as done by the assignee.',
            'success',
            '/tasks'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_task_completion ON tasks;
CREATE TRIGGER trg_notify_task_completion
AFTER UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION notify_task_completion();
