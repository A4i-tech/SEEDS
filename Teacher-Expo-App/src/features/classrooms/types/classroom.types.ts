import { z } from 'zod';

export const classMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone_number: z.string(),
});

export type ClassMember = z.infer<typeof classMemberSchema>;

export const classroomSchema = z.object({
  id: z.string(),
  school_id: z.string(),
  name: z.string(),
  teacher: z.string(),
  students: z.array(z.string()),
  leaders: z.array(z.string()),
  content_ids: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Classroom = z.infer<typeof classroomSchema>;

export const classroomDetailSchema = classroomSchema.extend({
  students: z.array(classMemberSchema),
  leaders: z.array(classMemberSchema),
});

export type ClassroomDetail = z.infer<typeof classroomDetailSchema>;

export interface ClassroomUpsert {
  id?: string;
  name: string;
  students: string[];
  leaders: string[];
  content_ids: string[];
}
