export type IssueScope = 'PROPIEDAD' | 'INTERNA';
export type IssuePriority = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type IssueStatus =
  | 'REGISTRADA'
  | 'EN_REVISION'
  | 'ASIGNADA'
  | 'EN_ATENCION'
  | 'PENDIENTE_CIERRE'
  | 'CERRADA'
  | 'DESCARTADA'
  | 'EN_PROCESO'
  | 'ATENDIDA'
  | 'DEVUELTA'
  | 'VERIFICADA'
  | 'REABIERTA';

export type EvidenceStage = 'INICIAL' | 'EJECUCION' | 'FINAL' | 'SOPORTE';

export type IssueEventType =
  | 'CREACION'
  | 'SUGERENCIA_RESPONSABLE'
  | 'CONFIRMACION_ASIGNACION'
  | 'INICIO_TRABAJO'
  | 'REASIGNACION'
  | 'CAMBIO_PRIORIDAD'
  | 'MEDIDA_URGENTE'
  | 'ACTIVIDAD_CREADA'
  | 'ACTIVIDAD_ASIGNADA'
  | 'ACTIVIDAD_REASIGNADA'
  | 'ACTIVIDAD_ESTADO'
  | 'COMENTARIO_AGREGADO'
  | 'EVIDENCIA_ADJUNTADA'
  | 'DEVOLUCION'
  | 'SOLICITUD_CIERRE'
  | 'CIERRE_DEFINITIVO'
  | 'REAPERTURA'
  | 'DESCARTE'
  | 'CAMBIO_ESTADO'
  | 'COMENTARIO'
  | 'CIERRE';

export interface Category {
  id: string;
  name: string;
  scope: IssueScope;
  description?: string;
  requiresEvidence?: boolean;
}

export interface PropertyZone {
  id: string;
  name: string;
  description?: string;
}

export interface Property {
  id: string;
  name: string;
  code: string;
  zones?: PropertyZone[];
}

export interface InternalArea {
  id: string;
  name: string;
  code: string;
}

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role?: string;
}

export interface IssueAssignment {
  id: string;
  userId: string;
  user: UserSummary;
  assignedById: string;
  assignedBy: UserSummary;
  reason?: string;
  isCurrent: boolean;
  assignedAt: string;
}

export interface IssueEvent {
  id: string;
  eventType: IssueEventType;
  summary: string;
  details?: any;
  createdAt: string;
  user?: UserSummary;
}

/** Resumen calculado por el backend para las bandejas por rol (RF-027). */
export interface IssueInboxSummary {
  openActivities: number;
  overdueActivities: number;
  blockedActivities: number;
  myOpenActivities: number;
  returned: boolean;
  returnedAt: string | null;
}

export interface Issue {
  id: string;
  code: string;
  scope: IssueScope;
  title: string;
  description: string;
  priority: IssuePriority;
  initialPriority: IssuePriority;
  status: IssueStatus;
  propertyId?: string;
  property?: Property;
  propertyZoneId?: string;
  propertyZone?: PropertyZone;
  internalAreaId?: string;
  internalArea?: InternalArea;
  categoryId: string;
  category?: Category;
  createdById: string;
  createdBy?: UserSummary;
  suggestedUserId?: string;
  suggestedUser?: UserSummary;
  assignedUserId?: string;
  assignedUser?: UserSummary;
  urgentMeasures?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  assignments?: IssueAssignment[];
  events?: IssueEvent[];
  activities?: IssueActivity[];
  comments?: IssueComment[];
  attachments?: IssueAttachment[];
  /** Solo viene en la lista (GET /issues). */
  inbox?: IssueInboxSummary;
}

export type ActivityStatus =
  | 'PENDIENTE'
  | 'EN_CURSO'
  | 'BLOQUEADA'
  | 'COMPLETADA'
  | 'CANCELADA';

export interface IssueActivity {
  id: string;
  issueId: string;
  title: string;
  description: string;
  status: ActivityStatus;
  statusReason?: string;
  assignedUserId?: string;
  assignedUser?: UserSummary;
  createdById: string;
  createdBy?: UserSummary;
  dueDate?: string;
  completedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  _count?: {
    comments: number;
    attachments: number;
  };
}

export interface IssueComment {
  id: string;
  issueId: string;
  activityId?: string;
  activity?: { id: string; title: string };
  userId: string;
  user?: UserSummary;
  content: string;
  mentions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateActivityPayload {
  title: string;
  description: string;
  assignedUserId?: string;
  dueDate?: string;
}

export interface UpdateActivityPayload {
  title?: string;
  description?: string;
  status?: ActivityStatus;
  statusReason?: string;
  dueDate?: string;
  version: number;
}

export interface AssignActivityPayload {
  assignedUserId: string;
  version: number;
}

export interface CreateCommentPayload {
  content: string;
  activityId?: string;
  mentions?: string[];
}

export interface CreateIssuePayload {
  scope: IssueScope;
  title: string;
  description: string;
  priority: IssuePriority;
  categoryId: string;
  propertyId?: string;
  propertyZoneId?: string;
  internalAreaId?: string;
  urgentMeasures?: string;
}

export interface IssueAttachment {
  id: string;
  issueId: string;
  activityId?: string;
  activity?: { id: string; title: string };
  uploadedById: string;
  uploadedBy?: UserSummary;
  stage: EvidenceStage;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sha256: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  organizationId: string;
  recipientId: string;
  issueId?: string;
  issue?: {
    id: string;
    code: string;
    title: string;
    priority: IssuePriority;
    status: IssueStatus;
    scope: IssueScope;
  };
  title: string;
  message: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface CloseIssuePayload {
  closureObservations?: string;
}

export interface ReopenIssuePayload {
  reason: string;
}

export interface DiscardIssuePayload {
  reason: string;
}
