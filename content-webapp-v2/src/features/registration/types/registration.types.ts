import { z } from 'zod';

export const schoolCreateSchema = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string(),
});

export type SchoolCreate = z.infer<typeof schoolCreateSchema>;

export const schoolUpdateSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
});

export type SchoolUpdate = z.infer<typeof schoolUpdateSchema>;

export const schoolSchema = z.object({
  id: z.string().nullish(),
  tenant_id: z.string().nullish(),
  name: z.string(),
  email: z.string().nullish(),
  is_active: z.boolean().optional(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

export type School = z.infer<typeof schoolSchema>;

export const schoolTeacherSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone_number: z.string().nullish(),
  role: z.string(),
});

export type SchoolTeacher = z.infer<typeof schoolTeacherSchema>;

export const teacherRegisterSchema = z.object({
  phone_number: z.string(),
  password: z.string(),
  name: z.string(),
  role: z.string().default('teacher'),
});

export type TeacherRegister = z.infer<typeof teacherRegisterSchema>;

export const teacherUpdateSchema = z.object({
  name: z.string().optional(),
  phone_number: z.string().optional(),
  password: z.string().optional(),
});

export type TeacherUpdate = z.infer<typeof teacherUpdateSchema>;

export const teacherTransferSchema = z.object({
  teacher_id: z.string(),
  target_school_id: z.string(),
});

export type TeacherTransfer = z.infer<typeof teacherTransferSchema>;

export const teacherSchema = z.object({
  id: z.string().nullish(),
  role: z.string().nullish(),
  name: z.string(),
  email: z.string().nullish(),
  phone_number: z.string().nullish(),
  tenant_id: z.string().nullish(),
  school_id: z.string().nullish(),
  tenant_name: z.string().nullish(),
  is_active: z.boolean().optional(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

export type Teacher = z.infer<typeof teacherSchema>;

export const studentCreateSchema = z.object({
  name: z.string(),
  phone_number: z.string(),
});

export type StudentCreate = z.infer<typeof studentCreateSchema>;

export const studentUpdateSchema = z.object({
  name: z.string().optional(),
  phone_number: z.string().optional(),
});

export type StudentUpdate = z.infer<typeof studentUpdateSchema>;

export const studentSchema = z.object({
  id: z.string().nullish(),
  name: z.string(),
  phone_number: z.string().nullish(),
  school_id: z.string().nullish(),
});

export type Student = z.infer<typeof studentSchema>;
