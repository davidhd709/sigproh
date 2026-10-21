import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/database/prisma.service';

describe('Paneles e Indicadores Operativos F6 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let coordinator1Token: string;
  let coordinator2Token: string;
  let directorToken: string;
  let adminToken: string;

  const directorId = '00000000-0000-0000-0000-000000000011';
  const coordinator1Id = '00000000-0000-0000-0000-000000000014';
  const coordinator2Id = '00000000-0000-0000-0000-000000000015';

  const torresDelParqueId = '00000000-0000-0000-0000-000000000020';
  const reservaPlazaId = '00000000-0000-0000-0000-000000000021';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    // Asegurar usuarios activos
    await prisma.user.updateMany({
      where: {
        id: { in: [directorId, coordinator1Id, coordinator2Id] },
      },
      data: { isActive: true },
    });

    // Login Coordinador 1 (asignado a Torres del Parque)
    const c1Res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'coordinador1@sigproh.local', password: 'Cambiar123!' });
    coordinator1Token = c1Res.body.accessToken;

    // Login Coordinador 2 (asignado a Reserva de la Plaza)
    const c2Res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'coordinador2@sigproh.local', password: 'Cambiar123!' });
    coordinator2Token = c2Res.body.accessToken;

    // Login Director Operativo
    const dirRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'director@sigproh.local', password: 'Cambiar123!' });
    directorToken = dirRes.body.accessToken;

    // Login Administrador
    const adminRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@sigproh.local', password: 'Cambiar123!' });
    adminToken = adminRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('debe rechazar con 401 si no hay token de autenticación', async () => {
    const res = await request(app.getHttpServer()).get('/dashboard/metrics');
    expect(res.status).toBe(401);
  });

  it('RF-049: debe rechazar con 403 Forbidden si el rol es Administrador', async () => {
    const res = await request(app.getHttpServer())
      .get('/dashboard/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('no tiene autorización para consultar tableros operacionales');
  });

  it('RF-029 / RF-030: Director Operativo consulta métricas consolidadas con estructura completa', async () => {
    const res = await request(app.getHttpServer())
      .get('/dashboard/metrics')
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('period');
    expect(res.body.period).toHaveProperty('startDate');
    expect(res.body.period).toHaveProperty('endDate');
    expect(res.body.period).toHaveProperty('cutoffDate');
    expect(res.body.period.timezone).toContain('America/Bogota');

    expect(res.body).toHaveProperty('kpis');
    expect(typeof res.body.kpis.totalRegisteredInPeriod).toBe('number');
    expect(typeof res.body.kpis.totalClosedInPeriod).toBe('number');
    expect(typeof res.body.kpis.totalOpenAtCutoff).toBe('number');
    expect(typeof res.body.kpis.averageResolutionHours).toBe('number');

    expect(res.body).toHaveProperty('activities');
    expect(typeof res.body.activities.totalActivities).toBe('number');
    expect(typeof res.body.activities.completed).toBe('number');

    expect(res.body).toHaveProperty('byStatus');
    expect(Array.isArray(res.body.byStatus)).toBe(true);

    expect(res.body).toHaveProperty('byPriority');
    expect(Array.isArray(res.body.byPriority)).toBe(true);

    expect(res.body).toHaveProperty('byCategory');
    expect(Array.isArray(res.body.byCategory)).toBe(true);

    expect(res.body).toHaveProperty('byLocation');
    expect(Array.isArray(res.body.byLocation)).toBe(true);

    expect(res.body).toHaveProperty('attentionRequiredCases');
    expect(Array.isArray(res.body.attentionRequiredCases)).toBe(true);
  });

  it('RF-049: Coordinador Operativo no puede consultar métricas de una propiedad no asignada', async () => {
    // Coordinador 1 está en Torres del Parque, no en Reserva de la Plaza
    const res = await request(app.getHttpServer())
      .get(`/dashboard/metrics?propertyId=${reservaPlazaId}`)
      .set('Authorization', `Bearer ${coordinator1Token}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('no tiene asignación operativa activa');
  });

  it('RF-029: Coordinador Operativo puede consultar métricas de su propiedad asignada', async () => {
    const res = await request(app.getHttpServer())
      .get(`/dashboard/metrics?propertyId=${torresDelParqueId}`)
      .set('Authorization', `Bearer ${coordinator1Token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('kpis');
    expect(res.body.byLocation.every((l: any) => l.id === torresDelParqueId)).toBe(true);
  });

  it('RF-030 / CP-34: Permite filtrar por rango de fechas y ámbito PROPIEDAD vs INTERNA', async () => {
    const res = await request(app.getHttpServer())
      .get('/dashboard/metrics?startDate=2026-01-01&endDate=2026-12-31&scope=PROPIEDAD')
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.period.startDate).toContain('2026-01-01');
    expect(res.body.period.endDate).toContain('2026-12-31');
    // Todas las ubicaciones deben ser de ámbito PROPIEDAD
    expect(res.body.byLocation.every((l: any) => l.scope === 'PROPIEDAD')).toBe(true);
  });
});
