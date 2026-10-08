import { z } from 'zod';
import { text } from '@shared/utils/schema';

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
  id: z.string(),
  tenant_id: text,
  name: z.string(),
  email: text,
  is_active: z.boolean().optional(),
  created_at: text,
  updated_at: text,
});

export type School = z.infer<typeof schoolSchema>;

export const schoolTeacherSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone_number: text,
  role: z.enum(['teacher', 'content_creator']),
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
  id: z.string(),
  role: text,
  name: z.string(),
  email: text,
  phone_number: text,
  tenant_id: text,
  school_id: text,
  tenant_name: text,
  is_active: z.boolean().optional(),
  created_at: text,
  updated_at: text,
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
  id: z.string(),
  name: z.string(),
  phone_number: text,
  school_id: text,
});

export type Student = z.infer<typeof studentSchema>;

export const registrationKeys = {
  all: ['registration'] as const,
  students: ['registration', 'students'] as const,
  teachers: ['registration', 'teachers'] as const,
  schools: ['registration', 'schools'] as const,
};
