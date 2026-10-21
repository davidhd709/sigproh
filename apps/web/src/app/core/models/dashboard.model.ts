export interface DashboardPeriodInfo {
  startDate: string;
  endDate: string;
  cutoffDate: string;
  timezone: string;
}

export interface DashboardKpiSummary {
  totalRegisteredInPeriod: number;
  totalClosedInPeriod: number;
  totalOpenAtCutoff: number;
  totalDiscardedInPeriod: number;
  totalCriticalInPeriod: number;
  averageResolutionHours: number;
  averageResolutionDays: number;
}

export interface DashboardActivitiesSummary {
  totalActivities: number;
  completed: number;
  inProgress: number;
  pending: number;
  blocked: number;
  canceled: number;
  completionRatePercent: number;
}

export interface StatusCountItem {
  status: string;
  count: number;
  percentage: number;
}

export interface PriorityCountItem {
  priority: string;
  count: number;
  percentage: number;
}

export interface CategoryMetricItem {
  categoryId: string;
  categoryName: string;
  scope: string;
  count: number;
  percentage: number;
}

export interface LocationMetricItem {
  id: string;
  name: string;
  scope: 'PROPIEDAD' | 'INTERNA';
  code?: string | null;
  totalRegistered: number;
  openAtCutoff: number;
  closedInPeriod: number;
  criticalCount: number;
}

export interface UrgentAttentionCaseItem {
  id: string;
  code: string;
  title: string;
  scope: string;
  locationName: string;
  priority: string;
  status: string;
  createdAt: string;
  daysOpen: number;
  hasBlockedActivities: boolean;
  assignedUserName: string | null;
}

export interface DashboardMetricsResponse {
  period: DashboardPeriodInfo;
  kpis: DashboardKpiSummary;
  activities: DashboardActivitiesSummary;
  byStatus: StatusCountItem[];
  byPriority: PriorityCountItem[];
  byCategory: CategoryMetricItem[];
  byLocation: LocationMetricItem[];
  attentionRequiredCases: UrgentAttentionCaseItem[];
}

export interface DashboardFilterParams {
  startDate?: string;
  endDate?: string;
  scope?: 'PROPIEDAD' | 'INTERNA';
  propertyId?: string;
  internalAreaId?: string;
  assignedUserId?: string;
  categoryId?: string;
  priority?: string;
  status?: string;
}
