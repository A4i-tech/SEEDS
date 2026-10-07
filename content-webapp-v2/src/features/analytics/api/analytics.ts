import { apiClient } from '@shared/services/apiClient';
import {
  analyticsEndpointFor,
  analyticsResponseSchema,
  schoolDashboardSchema,
  tenantDashboardSchema,
} from '../types/analytics.types';
import type {
  AnalyticsRequest,
  AnalyticsResponse,
  AnalyticsRole,
  SchoolDashboard,
  TenantDashboard,
} from '../types/analytics.types';

export async function postAnalytics(
  role: AnalyticsRole,
  range: AnalyticsRequest,
): Promise<AnalyticsResponse> {
  const { data } = await apiClient.post(analyticsEndpointFor(role), range);
  return analyticsResponseSchema.parse(data);
}

export async function getTenantDashboard(): Promise<TenantDashboard> {
  const { data } = await apiClient.get('/tenant/dashboard');
  return tenantDashboardSchema.parse(data);
}

export async function getSchoolDashboard(): Promise<SchoolDashboard> {
  const { data } = await apiClient.get('/school/dashboard');
  return schoolDashboardSchema.parse(data);
}
