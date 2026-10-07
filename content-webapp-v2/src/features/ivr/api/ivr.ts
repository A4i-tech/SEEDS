import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';

const menuOptionSchema = z.object({
  key: z.union([z.string(), z.number()]),
  value: z.string().optional(),
});

const menuSchema = z.object({
  description: z.string().optional(),
  level: z.number().optional(),
  options: z.array(menuOptionSchema).optional(),
});

const fsmStateSchema = z.object({
  id: z.string(),
  menu: menuSchema.nullable().optional(),
});

const fsmTransitionSchema = z.object({
  source_state_id: z.string(),
  dest_state_id: z.string(),
  input: z.union([z.string(), z.number()]).optional(),
});

export const fsmSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  init_state_id: z.union([z.string(), z.number()]).nullable().optional(),
  states: z.array(fsmStateSchema),
  transitions: z.array(fsmTransitionSchema).optional(),
  created_at: z.string().nullable().optional(),
});

export type Fsm = z.infer<typeof fsmSchema>;

export async function getIvrStructure() {
  const { data } = await apiClient.get('/ivr-structure');
  return fsmSchema.parse(data);
}
