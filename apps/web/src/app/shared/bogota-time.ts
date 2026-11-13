/**
 * Fechas de negocio en hora de Colombia (America/Bogota, UTC-5 todo el año).
 * Espejo de apps/api/src/shared/domain/bogota-time.ts: mantener ambas iguales para que
 * Inicio y Novedades muestren la misma antigüedad para el mismo caso.
 */
export const BOGOTA_TZ = 'America/Bogota';
/** Para el pipe `date` de Angular: muestra la hora de Colombia aunque el equipo tenga otra zona. */
export const BOGOTA_OFFSET = '-0500';

const OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha calendario (YYYY-MM-DD) que se ve en Colombia en ese instante. */
export function bogotaYmd(date: Date | string): string {
  return new Date(new Date(date).getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Días calendario de Colombia entre dos instantes: 0 si es hoy, 1 si fue ayer. */
export function bogotaDaysBetween(from: Date | string, to: Date = new Date()): number {
  const days = (Date.parse(bogotaYmd(to)) - Date.parse(bogotaYmd(from))) / DAY_MS;
  return Math.max(0, Math.round(days));
}

/** Suma días a una fecha YYYY-MM-DD sin depender de la zona del equipo. */
export function addDaysYmd(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Último día del mes de una fecha YYYY-MM-DD. */
export function monthEndYmd(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export type PeriodPreset = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30_DAYS' | 'THIS_YEAR';

/**
 * Rango visible de cada período, en días de Colombia. Los períodos en curso terminan hoy:
 * así la fecha de corte coincide con lo que se ve y la antigüedad no se infla.
 */
export function presetRange(preset: PeriodPreset, now: Date = new Date()): { start: string; end: string } {
  const today = bogotaYmd(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case 'THIS_MONTH':
      return { start: monthStart, end: today };
    case 'LAST_MONTH': {
      const lastMonthEnd = addDaysYmd(monthStart, -1);
      return { start: `${lastMonthEnd.slice(0, 7)}-01`, end: lastMonthEnd };
    }
    case 'LAST_30_DAYS':
      return { start: addDaysYmd(today, -29), end: today };
    case 'THIS_YEAR':
      return { start: `${today.slice(0, 4)}-01-01`, end: today };
  }
}

/** «Hoy», «1 día», «23 días». */
export function daysOpenLabel(days: number): string {
  if (days === 0) return 'Hoy';
  return days === 1 ? '1 día' : `${days} días`;
}
