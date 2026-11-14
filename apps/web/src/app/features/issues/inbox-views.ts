import { Issue } from '../../core/models/issue.model';
import { Tone } from '../../shared/presentation';
import { bogotaDaysBetween } from '../../shared/bogota-time';

/** Bandejas por rol (RF-027, sección 11.4 de los documentos). */
export type InboxView = 'ALL' | 'PENDING' | 'IN_PROGRESS' | 'UNASSIGNED' | 'CRITICAL' | 'MINE' | 'STALE';

export interface InboxViewDef {
  key: InboxView;
  label: string;
  /** Texto para el panel "Tus pendientes" de Inicio. */
  hint: string;
  tone: Tone;
  /** true si la vista se filtra por la persona (sus pendientes), no por el equipo. */
  perUser?: boolean;
  match: (issue: Issue, userId: string, now: Date) => boolean;
}

export const STALE_DAYS = 7;
const isOpen = (i: Issue) => i.status !== 'CERRADA' && i.status !== 'DESCARTADA';
const isPending = (i: Issue) => i.status === 'ASIGNADA' || i.status === 'EN_REVISION' || i.status === 'REGISTRADA';
const isInProgress = (i: Issue) => i.status === 'EN_ATENCION' || i.status === 'PENDIENTE_CIERRE';

export const INBOX_VIEWS: Record<InboxView, InboxViewDef> = {
  ALL: { key: 'ALL', label: 'Todas', hint: 'Todas las novedades', tone: 'neutral', match: () => true },
  PENDING: {
    key: 'PENDING',
    label: 'Pendientes',
    hint: 'Esperan que se inicie el trabajo',
    tone: 'warning',
    match: (i) => isPending(i),
  },
  IN_PROGRESS: {
    key: 'IN_PROGRESS',
    label: 'En proceso',
    hint: 'En trabajo; se finalizan con la foto final',
    tone: 'progress',
    match: (i) => isInProgress(i),
  },
  UNASSIGNED: {
    key: 'UNASSIGNED',
    label: 'Sin responsable',
    hint: 'Falta asignar un responsable',
    tone: 'danger',
    match: (i) => isOpen(i) && !i.assignedUserId,
  },
  CRITICAL: {
    key: 'CRITICAL',
    label: 'Críticas',
    hint: 'Críticas sin finalizar',
    tone: 'danger',
    match: (i) => isOpen(i) && i.priority === 'CRITICA',
  },
  MINE: {
    key: 'MINE',
    label: 'A mi cargo',
    hint: 'Novedades que debes atender',
    tone: 'info',
    perUser: true,
    match: (i, userId) => isOpen(i) && i.assignedUserId === userId,
  },
  STALE: {
    key: 'STALE',
    label: `Abiertas hace más de ${STALE_DAYS} días`,
    hint: 'Revisa por qué no han avanzado',
    tone: 'warning',
    // Días calendario de Colombia: la misma cuenta que muestran Inicio y cada tarjeta
    match: (i, _u, now) => isOpen(i) && bogotaDaysBetween(i.createdAt, now) > STALE_DAYS,
  },
};

/**
 * Vistas que ve cada rol. "Todas" va primero porque es la vista por defecto
 * y así siempre se ve cuál está activa; luego las propias del rol por importancia.
 */
export function viewsForRole(role?: string | null): InboxView[] {
  switch (role) {
    case 'DIRECTOR_OPERATIVO':
      return ['ALL', 'PENDING', 'IN_PROGRESS', 'CRITICAL', 'UNASSIGNED'];
    case 'COORDINADOR_OPERATIVO':
      return ['ALL', 'MINE', 'PENDING', 'IN_PROGRESS'];
    case 'GERENTE':
    case 'AUXILIAR_GERENCIA':
      return ['ALL', 'PENDING', 'IN_PROGRESS', 'CRITICAL', 'UNASSIGNED', 'STALE'];
    default:
      return ['ALL', 'CRITICAL', 'STALE'];
  }
}

export function isInboxView(value: unknown): value is InboxView {
  return typeof value === 'string' && value in INBOX_VIEWS;
}
