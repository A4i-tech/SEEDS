import { z } from 'zod';

export const analyticsRequestSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
});

export type AnalyticsRequest = z.infer<typeof analyticsRequestSchema>;

export const callLogSchema = z
  .object({
    phone_number: z.string().nullable().optional(),
    duration: z.union([z.string(), z.number()]).nullable().optional(),
    created_at: z.string().nullable().optional(),
    user_actions: z.array(z.unknown()).nullable().optional(),
  })
  .catchall(z.unknown());

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

export type DashboardStatistics = z.infer<typeof dashboardStatisticsSchema>;

export const schoolDashboardRowSchema = z.object({
  id: z.string().nullable().optional(),
  tenant_id: z.string().nullable().optional(),
  name: z.string(),
  email: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  teacher_count: z.number(),
  student_count: z.number(),
  class_count: z.number(),
});

export type SchoolDashboardRow = z.infer<typeof schoolDashboardRowSchema>;

export const tenantDashboardSchema = z.object({
  statistics: dashboardStatisticsSchema,
  schools: z.array(schoolDashboardRowSchema),
});

export type TenantDashboard = z.infer<typeof tenantDashboardSchema>;

export const schoolProfileSchema = z.object({
  id: z.string().nullable().optional(),
  tenant_id: z.string().nullable().optional(),
  name: z.string(),
  email: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

export type SchoolProfile = z.infer<typeof schoolProfileSchema>;

export const schoolDashboardSchema = z.object({
  school: schoolProfileSchema,
  teachers: z.number(),
  students: z.number(),
  classes: z.number(),
});

export type SchoolDashboard = z.infer<typeof schoolDashboardSchema>;

export const analyticsRoleSchema = z.enum(['tenant', 'school_admin']);

export type AnalyticsRole = z.infer<typeof analyticsRoleSchema>;

export function analyticsEndpointFor(role: AnalyticsRole): string {
  return role === 'school_admin' ? '/school/analytics' : '/tenant/analytics';
}

export function dashboardEndpointFor(role: AnalyticsRole): string {
  return role === 'school_admin' ? '/school/dashboard' : '/tenant/dashboard';
}
