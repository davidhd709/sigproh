import { Issue } from '../../core/models/issue.model';
import { Tone } from '../../shared/presentation';

/** Bandejas por rol (RF-027, sección 11.4 de los documentos). */
export type InboxView =
  | 'ALL'
  | 'TO_REVIEW'
  | 'UNASSIGNED'
  | 'CRITICAL'
  | 'TO_CLOSE'
  | 'OVERDUE'
  | 'BLOCKED'
  | 'MINE'
  | 'MY_ACTIVITIES'
  | 'RETURNED'
  | 'STALE';

export interface InboxViewDef {
  key: InboxView;
  label: string;
  /** Texto para el panel "Tus pendientes" de Inicio. */
  hint: string;
  tone: Tone;
  match: (issue: Issue, userId: string, now: Date) => boolean;
}

const STALE_DAYS = 7;
const isOpen = (i: Issue) => i.status !== 'CERRADA' && i.status !== 'DESCARTADA';

export const INBOX_VIEWS: Record<InboxView, InboxViewDef> = {
  ALL: { key: 'ALL', label: 'Todas', hint: 'Todas las novedades', tone: 'neutral', match: () => true },
  TO_REVIEW: {
    key: 'TO_REVIEW',
    label: 'Por revisar',
    hint: 'Recién reportadas, esperan tu revisión',
    tone: 'warning',
    match: (i) => i.status === 'REGISTRADA' || i.status === 'EN_REVISION',
  },
  UNASSIGNED: {
    key: 'UNASSIGNED',
    label: 'Sin responsable',
    hint: 'Sin responsable confirmado',
    tone: 'warning',
    match: (i) => isOpen(i) && !i.assignedUserId,
  },
  CRITICAL: {
    key: 'CRITICAL',
    label: 'Críticas',
    hint: 'Críticas sin cerrar',
    tone: 'danger',
    match: (i) => isOpen(i) && i.priority === 'CRITICA',
  },
  TO_CLOSE: {
    key: 'TO_CLOSE',
    label: 'Por cerrar',
    hint: 'Solicitaron cierre y esperan aprobación',
    tone: 'success',
    match: (i) => i.status === 'PENDIENTE_CIERRE',
  },
  OVERDUE: {
    key: 'OVERDUE',
    label: 'Vencidas',
    hint: 'Con actividades vencidas',
    tone: 'danger',
    match: (i) => isOpen(i) && (i.inbox?.overdueActivities ?? 0) > 0,
  },
  BLOCKED: {
    key: 'BLOCKED',
    label: 'Con bloqueos',
    hint: 'Con actividades bloqueadas',
    tone: 'danger',
    match: (i) => isOpen(i) && (i.inbox?.blockedActivities ?? 0) > 0,
  },
  MINE: {
    key: 'MINE',
    label: 'Asignadas a mí',
    hint: 'Eres el responsable principal',
    tone: 'info',
    match: (i, userId) => isOpen(i) && i.assignedUserId === userId,
  },
  MY_ACTIVITIES: {
    key: 'MY_ACTIVITIES',
    label: 'Mis actividades',
    hint: 'Tienes actividades por hacer',
    tone: 'info',
    match: (i) => isOpen(i) && (i.inbox?.myOpenActivities ?? 0) > 0,
  },
  RETURNED: {
    key: 'RETURNED',
    label: 'Devueltas',
    hint: 'La Dirección pidió correcciones',
    tone: 'warning',
    match: (i) => isOpen(i) && !!i.inbox?.returned,
  },
  STALE: {
    key: 'STALE',
    label: `Abiertas +${STALE_DAYS} días`,
    hint: `Llevan más de ${STALE_DAYS} días abiertas`,
    tone: 'warning',
    match: (i, _u, now) => isOpen(i) && now.getTime() - new Date(i.createdAt).getTime() > STALE_DAYS * 86400000,
  },
};

/**
 * Vistas que ve cada rol. "Todas" va primero porque es la vista por defecto
 * y así siempre se ve cuál está activa; luego las propias del rol por importancia.
 */
export function viewsForRole(role?: string | null): InboxView[] {
  switch (role) {
    case 'DIRECTOR_OPERATIVO':
      return ['ALL', 'TO_REVIEW', 'UNASSIGNED', 'CRITICAL', 'TO_CLOSE', 'OVERDUE', 'BLOCKED'];
    case 'COORDINADOR_OPERATIVO':
      return ['ALL', 'MINE', 'MY_ACTIVITIES', 'OVERDUE', 'RETURNED', 'BLOCKED'];
    default:
      return ['ALL', 'CRITICAL', 'STALE', 'TO_CLOSE'];
  }
}

export function isInboxView(value: unknown): value is InboxView {
  return typeof value === 'string' && value in INBOX_VIEWS;
}
