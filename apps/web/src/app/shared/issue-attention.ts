import { Issue, IssueActivity, UserSummary } from '../core/models/issue.model';
import { BOGOTA_TZ } from './bogota-time';
import { Tone } from './presentation';

/**
 * Situación de atención de una novedad, en el lenguaje de quien la reporta.
 * La tarjeta de la bandeja, la cabecera del detalle y el diálogo de asignación usan esta misma
 * función para que nunca digan cosas distintas sobre el mismo caso.
 */
export type AttentionStage = 'UNASSIGNED' | 'SUGGESTED' | 'CONFIRMED' | 'IN_PROGRESS' | 'FINISHED' | 'DISCARDED';

export interface AttentionState {
  stage: AttentionStage;
  tone: Tone;
  /** Texto corto para la tarjeta. */
  label: string;
  /** Frase completa para la cabecera del detalle. */
  message: string;
  responsible: UserSummary | null;
  suggested: UserSummary | null;
}

export const fullName = (u?: Pick<UserSummary, 'firstName' | 'lastName'> | null): string =>
  u ? `${u.firstName} ${u.lastName}`.trim() : '';

const longDate = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', timeZone: BOGOTA_TZ });
const longDateWithYear = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: BOGOTA_TZ,
});

/** «22 de octubre», con año solo si no es el actual. */
export function humanDate(date: string | Date, now: Date = new Date()): string {
  const d = new Date(date);
  const sameYear = longDateWithYear.format(d).slice(-4) === longDateWithYear.format(now).slice(-4);
  return sameYear ? longDate.format(d) : longDateWithYear.format(d);
}

export function attentionState(
  issue: Pick<Issue, 'status' | 'assignedUserId' | 'assignedUser' | 'suggestedUserId' | 'suggestedUser' | 'closedAt' | 'updatedAt'>,
  currentUserId?: string | null,
  now: Date = new Date(),
): AttentionState {
  const responsible = issue.assignedUserId ? (issue.assignedUser ?? null) : null;
  const suggested = !issue.assignedUserId && issue.suggestedUserId ? (issue.suggestedUser ?? null) : null;
  const isMine = Boolean(currentUserId && issue.assignedUserId === currentUserId);
  const who = isMine ? 'Tú' : fullName(responsible) || 'El responsable';
  const base = { responsible, suggested };

  switch (issue.status) {
    case 'CERRADA':
      return {
        ...base,
        stage: 'FINISHED',
        tone: 'success',
        label: 'Resuelta',
        message: `Resuelta el ${humanDate(issue.closedAt ?? issue.updatedAt, now)}.`,
      };
    case 'DESCARTADA':
      return {
        ...base,
        stage: 'DISCARDED',
        tone: 'muted',
        label: 'Descartada',
        message: 'Se descartó y no requiere atención.',
      };
    case 'EN_ATENCION':
    case 'PENDIENTE_CIERRE':
      return {
        ...base,
        stage: 'IN_PROGRESS',
        tone: 'progress',
        label: 'En proceso',
        message: isMine ? 'Tú estás atendiendo la novedad.' : `${who} está atendiendo la novedad.`,
      };
  }

  if (responsible || issue.assignedUserId) {
    return {
      ...base,
      stage: 'CONFIRMED',
      tone: 'warning',
      label: 'Falta iniciar',
      message: isMine ? 'Tú debes iniciar el trabajo.' : `${who} debe iniciar el trabajo.`,
    };
  }
  if (suggested) {
    return {
      ...base,
      stage: 'SUGGESTED',
      tone: 'info',
      label: 'Falta confirmar',
      message: `${fullName(suggested)} fue sugerido. Falta confirmar.`,
    };
  }
  return {
    ...base,
    stage: 'UNASSIGNED',
    tone: 'danger',
    label: 'Sin asignar',
    message: 'Falta asignar un responsable.',
  };
}

const OPEN_ACTIVITY: IssueActivity['status'][] = ['PENDIENTE', 'EN_CURSO', 'BLOQUEADA'];

/**
 * Actividades abiertas en el orden en que deben atenderse: primero la de fecha prevista más
 * próxima (las vencidas quedan arriba), luego las que no tienen fecha, por antigüedad.
 */
export function openActivities(activities: IssueActivity[] | undefined): IssueActivity[] {
  const due = (a: IssueActivity) => (a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY);
  return (activities ?? [])
    .filter((a) => OPEN_ACTIVITY.includes(a.status))
    .sort((a, b) => due(a) - due(b) || Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
