import { z } from 'zod';
import { apiClient } from '@shared/services/apiClient';
import { list, text } from '@shared/utils/schema';

const menuOptionSchema = z.object({
  key: z.union([z.string(), z.number()]),
  value: text,
});

const menuSchema = z
  .object({
    description: text,
    options: list(menuOptionSchema),
  })
  .nullish()
  .transform((menu) => menu ?? { description: '', options: [] });

const fsmStateSchema = z.object({
  id: z.string(),
  menu: menuSchema,
});

const fsmTransitionSchema = z.object({
  source_state_id: z.string(),
  dest_state_id: z.string(),
  input: z.union([z.string(), z.number()]).nullish().transform((value) => value ?? ''),
});

export const fsmSchema = z.object({
  states: z.array(fsmStateSchema),
  transitions: list(fsmTransitionSchema),
});

export type Fsm = z.infer<typeof fsmSchema>;

export async function getIvrStructure() {
  const { data } = await apiClient.get('/ivr-structure');
  return fsmSchema.parse(data);
}
