import { ReportScope, ReportStatus } from '../../../generated/prisma/client';
import {
  CategoryMetricItem,
  DashboardActivitiesSummary,
  DashboardKpiSummary,
  PriorityCountItem,
  StatusCountItem,
} from '../../../dashboard/presentation/dto/dashboard-metrics.dto';

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
  kpis: DashboardKpiSummary;
  activities: DashboardActivitiesSummary;
  byStatus: StatusCountItem[];
  byPriority: PriorityCountItem[];
  byCategory: CategoryMetricItem[];
  issuesList: ReportIssueItem[];
  activitiesList: ReportActivityItem[];
  availableEvidences: ReportEvidenceItem[];
}

export interface ReportResponseDto {
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

  // Textos editables
  introduction: string | null;
  observations: string | null;
  recommendations: string | null;
  finalComments: string | null;

  // Evidencias seleccionadas
  selectedAttachmentIds: string[];

  // Toggles de visualización
  showIntroduction: boolean;
  showKpis: boolean;
  showIssuesList: boolean;
  showActivities: boolean;
  showEvidences: boolean;
  showPendingIssues: boolean;
  showObservations: boolean;
  showRecommendations: boolean;
  showFinalComments: boolean;

  // Datos operacionales
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

export interface ReportListItemDto {
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
