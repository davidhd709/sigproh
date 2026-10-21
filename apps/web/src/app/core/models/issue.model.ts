export type IssueScope = 'PROPIEDAD' | 'INTERNA';
export type IssuePriority = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type IssueStatus =
  | 'REGISTRADA'
  | 'EN_REVISION'
  | 'ASIGNADA'
  | 'EN_PROCESO'
  | 'ATENDIDA'
  | 'DEVUELTA'
  | 'VERIFICADA'
  | 'CERRADA'
  | 'REABIERTA'
  | 'DESCARTADA';

export type IssueEventType =
  | 'CREACION'
  | 'SUGERENCIA_RESPONSABLE'
  | 'CONFIRMACION_ASIGNACION'
  | 'REASIGNACION'
  | 'CAMBIO_PRIORIDAD'
  | 'MEDIDA_URGENTE'
  | 'CAMBIO_ESTADO'
  | 'COMENTARIO'
  | 'CIERRE'
  | 'REAPERTURA'
  | 'DESCARTE';

export interface Category {
  id: string;
  name: string;
  scope: IssueScope;
  description?: string;
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
  assignments?: IssueAssignment[];
  events?: IssueEvent[];
  activities?: IssueActivity[];
  comments?: IssueComment[];
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
