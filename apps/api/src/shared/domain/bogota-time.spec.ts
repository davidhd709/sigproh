import { describe, expect, it } from 'vitest';
import { bogotaDayEnd, bogotaDayStart, bogotaDaysBetween, bogotaYmd } from './bogota-time';
import { DashboardService } from '../../dashboard/application/dashboard.service';

describe('Fechas de negocio en hora de Colombia', () => {
  it('a las 8 p. m. del 31 de octubre en Bogotá ya es 1 de noviembre en UTC, pero el día visible sigue siendo el 31', () => {
    const instant = new Date('2026-11-01T01:00:00Z'); // 31 oct, 8:00 p. m. en Bogotá
    expect(bogotaYmd(instant)).toBe('2026-10-31');
  });

  it('el día empieza y termina a medianoche de Bogotá', () => {
    expect(bogotaDayStart('2026-11-01').toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(bogotaDayEnd('2026-11-30').toISOString()).toBe('2026-12-01T04:59:59.999Z');
  });

  it('cuenta días calendario de Colombia: un caso de anoche lleva 1 día aunque no hayan pasado 24 horas', () => {
    const reported = new Date('2026-11-13T03:00:00Z'); // 12 nov, 10 p. m. en Bogotá
    const now = new Date('2026-11-13T14:00:00Z'); // 13 nov, 9 a. m. en Bogotá
    expect(bogotaDaysBetween(reported, now)).toBe(1);
    expect(bogotaDaysBetween(now, now)).toBe(0);
  });
});

describe('Período del tablero', () => {
  const now = new Date('2026-11-13T17:00:00Z'); // 13 nov, 12 m. en Bogotá

  it('«Este mes» (1 al 30 de noviembre) corta hoy, no el 30', () => {
    const range = DashboardService.resolveDateRange('2026-11-01', '2026-11-30', now);
    expect(range.startDate.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(range.endDate.toISOString()).toBe('2026-12-01T04:59:59.999Z');
    expect(range.cutoffDate).toEqual(now);
  });

  it('un mes ya terminado usa su último instante en Bogotá como corte', () => {
    const range = DashboardService.resolveDateRange('2026-10-01', '2026-10-31', now);
    expect(range.cutoffDate.toISOString()).toBe('2026-11-01T04:59:59.999Z');
  });

  it('sin fechas usa del 1 del mes de Bogotá hasta ahora', () => {
    // 1 nov, 2 a. m. UTC = 31 oct en Bogotá: el mes por defecto es octubre
    const lateOctober = new Date('2026-11-01T02:00:00Z');
    const range = DashboardService.resolveDateRange(undefined, undefined, lateOctober);
    expect(range.startDate.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(range.cutoffDate).toEqual(lateOctober);
  });

  it('la antigüedad de «Requieren atención» se mide a hoy, como en Novedades', () => {
    const issue = {
      id: 'i1',
      code: 'NOV-2026-0001',
      title: 'Fuga',
      scope: 'PROPIEDAD',
      priority: 'CRITICA',
      status: 'EN_ATENCION',
      createdAt: new Date('2026-10-21T15:00:00Z'),
      activities: [],
      property: { name: 'Torres del Parque' },
    };
    const [item] = DashboardService.extractAttentionRequiredCases([issue], now);
    expect(item.daysOpen).toBe(23);
  });
});
