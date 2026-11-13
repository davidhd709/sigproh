/**
 * Fechas de negocio en hora de Colombia (America/Bogota, UTC-5 todo el año, sin horario de verano).
 * El cliente web usa las mismas reglas (apps/web/src/app/shared/bogota-time.ts); mantener ambas iguales.
 */
export const BOGOTA_TIMEZONE = 'America/Bogota';
const BOGOTA_OFFSET = '-05:00';
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha calendario (YYYY-MM-DD) que se ve en Colombia en ese instante. */
export function bogotaYmd(date: Date): string {
  return new Date(date.getTime() + BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** 00:00:00.000 de ese día en Colombia. */
export function bogotaDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000${BOGOTA_OFFSET}`);
}

/** 23:59:59.999 de ese día en Colombia. */
export function bogotaDayEnd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999${BOGOTA_OFFSET}`);
}

export function isPlainDate(value: string): boolean {
  return YMD.test(value);
}

/**
 * Días calendario que lleva abierta una novedad en Colombia: 0 si se reportó hoy,
 * 1 si fue ayer, aunque hayan pasado menos de 24 horas.
 */
export function bogotaDaysBetween(from: Date, to: Date): number {
  const days = (Date.parse(bogotaYmd(to)) - Date.parse(bogotaYmd(from))) / DAY_MS;
  return Math.max(0, Math.round(days));
}
