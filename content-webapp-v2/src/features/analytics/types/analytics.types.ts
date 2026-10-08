import { z } from 'zod';
import { list, text } from '@shared/utils/schema';

export const analyticsRequestSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
});

export type AnalyticsRequest = z.infer<typeof analyticsRequestSchema>;

function toSeconds(value: string | number | null | undefined): number {
  const seconds = Number(value ?? 0);
  if (Number.isNaN(seconds)) throw new Error(`Invalid call duration: ${value}`);
  return seconds;
}

const looseText = z.string().nullish().transform((value) => value ?? '');

export const callLogSchema = z.object({
  phone_number: text,
  duration: z.union([z.string(), z.number()]).nullish().transform(toSeconds),
  created_at: z.coerce.date(),
  user_actions: list(z.unknown()),
  content_id: looseText,
  audio_id: looseText,
  content_name: looseText,
  audio_name: looseText,
});

export type CallLog = z.infer<typeof callLogSchema>;

export const analyticsResponseSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
  count: z.number(),
  data: z.array(callLogSchema),
});

export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;

export const dashboardStatisticsSchema = z.object({
  total_schools: z.number(),
  total_teachers: z.number(),
  total_students: z.number(),
  total_classes: z.number(),
});

export const schoolDashboardRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  teacher_count: z.number(),
  student_count: z.number(),
  class_count: z.number(),
});

export const tenantDashboardSchema = z.object({
  statistics: dashboardStatisticsSchema,
  schools: z.array(schoolDashboardRowSchema),
});

export type TenantDashboard = z.infer<typeof tenantDashboardSchema>;

export const schoolProfileSchema = z.object({
  name: z.string(),
});

export const schoolDashboardSchema = z.object({
  school: schoolProfileSchema,
  teachers: z.number(),
  students: z.number(),
  classes: z.number(),
});

export type SchoolDashboard = z.infer<typeof schoolDashboardSchema>;

export const analyticsRoleSchema = z.enum(['tenant', 'school_admin']);

export type AnalyticsRole = z.infer<typeof analyticsRoleSchema>;

const ANALYTICS_ENDPOINT: Record<AnalyticsRole, string> = {
  tenant: '/tenant/analytics',
  school_admin: '/school/analytics',
};

export function analyticsEndpointFor(role: AnalyticsRole): string {
  return ANALYTICS_ENDPOINT[role];
}

export const analyticsKeys = {
  all: ['analytics'] as const,
  range: (role: AnalyticsRole, startISO: string, endISO: string) => ['analytics', role, startISO, endISO] as const,
  tenantDashboard: ['analytics', 'tenant-dashboard'] as const,
  schoolDashboard: ['analytics', 'school-dashboard'] as const,
};
