import { z } from 'zod';

export const createBatchSchema = z.object({
  formulation_id:     z.string().uuid('Select an approved formulation'),
  experiment_type:    z.string().trim().min(1, 'Select experiment type').max(80),
  sku_target:         z.string().trim().min(1).max(80).default('Unassigned'),
  planned_volume_ml:  z.coerce.number().positive().default(250),
  num_flasks:         z.coerce.number().int().min(1).max(10).default(3),
  planned_start_date: z.string().optional(),
  assigned_team:      z.array(z.string().uuid()).default([]),
  linked_sops:        z.array(z.string()).default([]),
  notes:              z.string().optional(),
});
