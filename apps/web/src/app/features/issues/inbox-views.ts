import { Issue } from '../../core/models/issue.model';
import { Tone } from '../../shared/presentation';

/** Bandejas por rol (RF-027, sección 11.4 de los documentos). */
export type InboxView =
  | 'ALL'
  | 'UNASSIGNED'
  | 'CRITICAL'
  | 'TO_CLOSE'
  | 'OVERDUE'
  | 'MINE'
  | 'MY_ACTIVITIES'
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
  UNASSIGNED: {
    key: 'UNASSIGNED',
    label: 'Por asignar',
    hint: 'Nadie las tiene a cargo todavía',
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
    label: 'Listas para cerrar',
    hint: 'En atención y sin actividades pendientes',
    tone: 'success',
    match: (i) => i.status === 'EN_ATENCION' && (i.inbox?.openActivities ?? 0) === 0,
  },
  OVERDUE: {
    key: 'OVERDUE',
    label: 'Vencidas',
    hint: 'Con actividades vencidas',
    tone: 'danger',
    match: (i) => isOpen(i) && (i.inbox?.overdueActivities ?? 0) > 0,
  },
  MINE: {
    key: 'MINE',
    label: 'A mi cargo',
    hint: 'Novedades que debes atender',
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
      return ['ALL', 'UNASSIGNED', 'CRITICAL', 'TO_CLOSE', 'OVERDUE'];
    case 'COORDINADOR_OPERATIVO':
      return ['ALL', 'MINE', 'TO_CLOSE', 'MY_ACTIVITIES', 'OVERDUE'];
    case 'GERENTE':
    case 'AUXILIAR_GERENCIA':
      return ['ALL', 'UNASSIGNED', 'CRITICAL', 'STALE'];
    default:
      return ['ALL', 'CRITICAL', 'STALE'];
  }
}

export function isInboxView(value: unknown): value is InboxView {
  return typeof value === 'string' && value in INBOX_VIEWS;
}
