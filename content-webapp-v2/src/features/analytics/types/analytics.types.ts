import { z } from 'zod';
import { list, text } from '@shared/utils/schema';

export const analyticsRequestSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
});

export type AnalyticsRequest = z.infer<typeof analyticsRequestSchema>;

function toSeconds(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value === '') return 0;
  const seconds = parseInt(value, 10);
  if (Number.isNaN(seconds)) return 0;
  return seconds;
}

const looseText = z.string().catch('');

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

export const schoolDashboardRowSchema = z
  .object({
    id: text,
    name: z.string(),
    teacher_count: z.number(),
    student_count: z.number(),
    class_count: z.number(),
  })
  .transform((row) => ({ ...row, id: row.id || row.name }));

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

export const analyticsRoleSchema = z.enum(['tenant', 'school_admin', '']).catch('');

export type AnalyticsRole = Exclude<z.infer<typeof analyticsRoleSchema>, ''>;

const ANALYTICS_ENDPOINT: Record<AnalyticsRole, string> = {
  tenant: '/tenant/analytics',
  school_admin: '/school/analytics',
};

export function analyticsEndpointFor(role: AnalyticsRole): string {
  return ANALYTICS_ENDPOINT[role];
}
