import { z } from 'zod';

export const createTaskSchema = z.object({
  title:                z.string().min(1, 'Title is required'),
  description:          z.string().optional(),
  assigned_to:          z.string().uuid(),
  due_date:             z.string(),
  priority:             z.enum(['low', 'medium', 'high', 'urgent']),
  checklist:            z.array(z.object({ text: z.string(), done: z.boolean() })).optional(),
  status:               z.string().default('open'),
  approval_status:      z.string().default('not_required'),
  is_personal_reminder: z.boolean().default(false),
});

export const ACTION_PAYLOAD_SCHEMAS = {
  start_timer:      z.object({}),
  acknowledge_task: z.object({}),
  approve:          z.object({}),
  pause_timer:      z.object({ logged_minutes: z.number().min(0) }),
  update_checklist: z.object({ checklist: z.array(z.object({ text: z.string(), done: z.boolean() })) }),
  update_progress:  z.object({ percentage: z.number().min(0).max(100), note: z.string().optional() }),
  submit_review:    z.object({
    completion_note:      z.string().optional(),
    proof_url:            z.string().optional(),
    logged_minutes:       z.number().min(0),
    is_personal_reminder: z.boolean().optional(),
  }),
  reject: z.object({ reject_note: z.string().min(5, 'Rejection note must be at least 5 characters') }),
};

export const patchSchema = z.object({
  action:  z.enum(['start_timer', 'pause_timer', 'update_checklist', 'submit_review', 'approve', 'reject', 'acknowledge_task', 'update_progress']),
  task_id: z.string().uuid(),
  payload: z.record(z.unknown()).optional().default({}),
});
