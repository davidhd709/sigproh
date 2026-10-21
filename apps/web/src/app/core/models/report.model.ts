export type ReportScope = 'PROPIEDAD' | 'INTERNA' | 'CONSOLIDADO';
export type ReportStatus = 'BORRADOR' | 'EN_REVISION' | 'DEVUELTO' | 'APROBADO';

export interface ReportKpis {
  totalRegisteredInPeriod: number;
  totalClosedInPeriod: number;
  totalOpenAtCutoff: number;
  totalDiscardedInPeriod: number;
  totalCriticalInPeriod: number;
  averageResolutionHours: number;
  averageResolutionDays: number;
}

export interface ReportActivitiesSummary {
  totalActivities: number;
  completed: number;
  inProgress: number;
  pending: number;
  blocked: number;
  canceled: number;
  completionRatePercent: number;
}

export interface ReportStatusCount {
  status: string;
  count: number;
  percentage: number;
}

export interface ReportPriorityCount {
  priority: string;
  count: number;
  percentage: number;
}

export interface ReportCategoryCount {
  categoryId: string;
  categoryName: string;
  scope: string;
  count: number;
  percentage: number;
}

export interface ReportIssueItem {
  id: string;
  code: string;
  title: string;
  description: string;
  scope: string;
  priority: string;
  status: string;
  categoryName: string;
  locationName: string;
  createdByName: string;
  assignedUserName: string | null;
  createdAt: string;
  closedAt: string | null;
  activitiesCount: number;
  evidencesCount: number;
}

export interface ReportActivityItem {
  id: string;
  issueId: string;
  issueCode: string;
  issueTitle: string;
  title: string;
  description: string;
  status: string;
  statusReason?: string | null;
  assignedUserName: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ReportEvidenceItem {
  id: string;
  issueId: string;
  issueCode: string;
  stage: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  createdAt: string;
  uploadedByName: string;
}

export interface ReportOperationalData {
  period: {
    startDate: string;
    endDate: string;
    cutoffDate: string;
    timezone: string;
  };
  kpis: ReportKpis;
  activities: ReportActivitiesSummary;
  byStatus: ReportStatusCount[];
  byPriority: ReportPriorityCount[];
  byCategory: ReportCategoryCount[];
  issuesList: ReportIssueItem[];
  activitiesList: ReportActivityItem[];
  availableEvidences: ReportEvidenceItem[];
}

export interface ReportDetail {
  id: string;
  code: string;
  scope: ReportScope;
  title: string;
  propertyId: string | null;
  propertyName?: string | null;
  propertyCode?: string | null;
  internalAreaId: string | null;
  internalAreaName?: string | null;
  internalAreaCode?: string | null;
  periodStart: string;
  periodEnd: string;
  cutoffDate: string;
  status: ReportStatus;
  version: number;

  introduction: string | null;
  observations: string | null;
  recommendations: string | null;
  finalComments: string | null;

  selectedAttachmentIds: string[];

  showIntroduction: boolean;
  showKpis: boolean;
  showIssuesList: boolean;
  showActivities: boolean;
  showEvidences: boolean;
  showPendingIssues: boolean;
  showObservations: boolean;
  showRecommendations: boolean;
  showFinalComments: boolean;

  operationalData: ReportOperationalData | null;

  createdById: string;
  createdByName: string;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  approvalNotes: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface ReportListItem {
  id: string;
  code: string;
  scope: ReportScope;
  title: string;
  propertyName?: string | null;
  internalAreaName?: string | null;
  periodStart: string;
  periodEnd: string;
  cutoffDate: string;
  status: ReportStatus;
  version: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportDraftDto {
  scope: ReportScope;
  title: string;
  propertyId?: string;
  internalAreaId?: string;
  periodStart: string;
  periodEnd: string;
  cutoffDate?: string;
  introduction?: string;
  observations?: string;
  recommendations?: string;
  finalComments?: string;
  selectedAttachmentIds?: string[];
  showIntroduction?: boolean;
  showKpis?: boolean;
  showIssuesList?: boolean;
  showActivities?: boolean;
  showEvidences?: boolean;
  showPendingIssues?: boolean;
  showObservations?: boolean;
  showRecommendations?: boolean;
  showFinalComments?: boolean;
}

export interface UpdateReportDraftDto {
  title?: string;
  introduction?: string;
  observations?: string;
  recommendations?: string;
  finalComments?: string;
  selectedAttachmentIds?: string[];
  showIntroduction?: boolean;
  showKpis?: boolean;
  showIssuesList?: boolean;
  showActivities?: boolean;
  showEvidences?: boolean;
  showPendingIssues?: boolean;
  showObservations?: boolean;
  showRecommendations?: boolean;
  showFinalComments?: boolean;
}

export interface ReportFilter {
  scope?: ReportScope;
  status?: ReportStatus;
  propertyId?: string;
  internalAreaId?: string;
  search?: string;
}
