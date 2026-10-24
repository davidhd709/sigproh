/**
 * Textos y tonos de presentación compartidos por las pantallas.
 * Traducen los códigos del backend (EN_ATENCION, CRITICA…) a lenguaje del usuario.
 */

export type Tone = 'neutral' | 'info' | 'progress' | 'warning' | 'success' | 'danger' | 'muted';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  REGISTRADA: { label: 'Registrada', tone: 'neutral' },
  EN_REVISION: { label: 'En revisión', tone: 'warning' },
  ASIGNADA: { label: 'Asignada', tone: 'info' },
  EN_ATENCION: { label: 'En atención', tone: 'progress' },
  EN_PROCESO: { label: 'En proceso', tone: 'progress' },
  PENDIENTE_CIERRE: { label: 'Pendiente de cierre', tone: 'warning' },
  ATENDIDA: { label: 'Atendida', tone: 'success' },
  VERIFICADA: { label: 'Verificada', tone: 'success' },
  CERRADA: { label: 'Cerrada', tone: 'success' },
  DEVUELTA: { label: 'Devuelta', tone: 'danger' },
  REABIERTA: { label: 'Reabierta', tone: 'warning' },
  DESCARTADA: { label: 'Descartada', tone: 'muted' },
  // Actividades
  PENDIENTE: { label: 'Pendiente', tone: 'neutral' },
  EN_CURSO: { label: 'En curso', tone: 'progress' },
  BLOQUEADA: { label: 'Bloqueada', tone: 'danger' },
  COMPLETADA: { label: 'Completada', tone: 'success' },
  CANCELADA: { label: 'Cancelada', tone: 'muted' },
  // Informes
  BORRADOR: { label: 'Borrador', tone: 'neutral' },
  DEVUELTO: { label: 'Devuelto', tone: 'danger' },
  APROBADO: { label: 'Aprobado', tone: 'success' },
};

const PRIORITY: Record<string, { label: string; tone: Tone }> = {
  CRITICA: { label: 'Crítica', tone: 'danger' },
  ALTA: { label: 'Alta', tone: 'warning' },
  MEDIA: { label: 'Media', tone: 'info' },
  BAJA: { label: 'Baja', tone: 'neutral' },
};

const humanize = (code: string) => code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ');

export const statusLabel = (status: string): string => STATUS[status]?.label ?? humanize(status);
export const statusTone = (status: string): Tone => STATUS[status]?.tone ?? 'neutral';
export const priorityLabel = (priority: string): string => PRIORITY[priority]?.label ?? humanize(priority);
export const priorityTone = (priority: string): Tone => PRIORITY[priority]?.tone ?? 'neutral';

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

/** "hace 2 días", "ayer", "hace 3 horas". */
export function timeAgo(date: string | Date | null | undefined, now: Date = new Date()): string {
  if (!date) return '';
  const diffSec = (new Date(date).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diffSec);
  if (abs < 60) return 'justo ahora';
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), 'month');
  return rtf.format(Math.round(diffSec / (86400 * 365)), 'year');
}

export function initialsOf(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

const ROLES: Record<string, string> = {
  DIRECTOR_OPERATIVO: 'Director operativo',
  COORDINADOR_OPERATIVO: 'Coordinador operativo',
  GERENTE: 'Gerencia',
  AUXILIAR_GERENCIA: 'Auxiliar de gerencia',
  ADMINISTRADOR: 'Administrador',
};

export const roleLabel = (role?: string | null): string => (role ? (ROLES[role] ?? humanize(role)) : '');

const EVENTS: Record<string, string> = {
  CREACION: 'Registro',
  SUGERENCIA_RESPONSABLE: 'Responsable sugerido',
  CONFIRMACION_ASIGNACION: 'Responsable confirmado',
  REASIGNACION: 'Reasignación',
  CAMBIO_PRIORIDAD: 'Cambio de prioridad',
  MEDIDA_URGENTE: 'Medida urgente',
  ACTIVIDAD_CREADA: 'Actividad creada',
  ACTIVIDAD_ASIGNADA: 'Actividad asignada',
  ACTIVIDAD_REASIGNADA: 'Actividad reasignada',
  ACTIVIDAD_ESTADO: 'Estado de actividad',
  COMENTARIO_AGREGADO: 'Comentario',
  COMENTARIO: 'Comentario',
  EVIDENCIA_ADJUNTADA: 'Evidencia adjunta',
  DEVOLUCION: 'Devolución',
  SOLICITUD_CIERRE: 'Solicitud de cierre',
  CIERRE_DEFINITIVO: 'Cierre definitivo',
  CIERRE: 'Cierre',
  REAPERTURA: 'Reapertura',
  DESCARTE: 'Descarte',
  CAMBIO_ESTADO: 'Cambio de estado',
};

export const eventLabel = (type: string): string => EVENTS[type] ?? humanize(type);

const STAGES: Record<string, { label: string; tone: Tone }> = {
  INICIAL: { label: 'Inicial', tone: 'neutral' },
  EJECUCION: { label: 'Ejecución', tone: 'progress' },
  FINAL: { label: 'Final', tone: 'success' },
  SOPORTE: { label: 'Soporte', tone: 'info' },
};

export const stageLabel = (stage: string): string => STAGES[stage]?.label ?? humanize(stage);
export const stageTone = (stage: string): Tone => STAGES[stage]?.tone ?? 'neutral';
