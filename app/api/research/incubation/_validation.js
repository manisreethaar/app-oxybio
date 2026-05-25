import { z } from 'zod';

export const incubationSchema = z.object({
  id: z.string().uuid().optional(),
  sample_name: z.string().trim().min(1, 'Sample name is required').max(120),
  batch_id: z.string().uuid().nullable().optional(),
  flask_id: z.string().uuid().nullable().optional(),
  qc_sample_id: z.string().uuid().nullable().optional(),
  source_stage: z.string().trim().max(80).nullable().optional(),
  source_type: z.string().trim().max(120).nullable().optional(),
  sampled_at: z.string().datetime().nullable().optional(),
  sample_category: z.enum(['Fermentation IPC', 'Cell Bank', 'Passage', 'Subculture', 'Other']),
  sample_type: z.enum(['Agar Plate', 'Broth']),
  incubation_date: z.string().min(1, 'Incubation date is required'),
  incubation_temp_c: z.coerce.number().min(0).max(100),
  start_time: z.string().datetime(),
  end_time: z.string().datetime().nullable().optional(),
  od_value: z.coerce.number().min(0).max(10).nullable().optional(),
  ph_value: z.coerce.number().min(0).max(14).nullable().optional(),
  staining_method: z.string().trim().max(120).nullable().optional(),
  microscopic_morphology: z.string().trim().max(500).nullable().optional(),
  colony_morphology: z.string().trim().max(1000).nullable().optional(),
  sterility_status: z.enum(['Pending', 'Sterile', 'Contaminated']).default('Pending'),
  observation: z.string().trim().max(2000).nullable().optional()
}).refine((data) => {
  if (!data.end_time) return true;
  return new Date(data.end_time).getTime() >= new Date(data.start_time).getTime();
}, {
  message: 'End time cannot be before start time',
  path: ['end_time']
});
