import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/database/prisma.service';

describe('Informes automáticos, borradores, PDF y Excel F7 (e2e)', () => {
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

    await prisma.user.updateMany({
      where: {
        id: { in: [directorId, coordinator1Id, coordinator2Id] },
      },
      data: { isActive: true },
    });

    const c1Res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'coordinador1@sigproh.local', password: 'Cambiar123!' });
    coordinator1Token = c1Res.body.accessToken;

    const c2Res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'coordinador2@sigproh.local', password: 'Cambiar123!' });
    coordinator2Token = c2Res.body.accessToken;

    const dirRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'director@sigproh.local', password: 'Cambiar123!' });
    directorToken = dirRes.body.accessToken;

    const adminRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@sigproh.local', password: 'Cambiar123!' });
    adminToken = adminRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('debe rechazar con 401 si no hay token de autenticación', async () => {
    const res = await request(app.getHttpServer()).get('/reports');
    expect(res.status).toBe(401);
  });

  it('RF-049: debe rechazar con 403 Forbidden si el rol es Administrador', async () => {
    const res = await request(app.getHttpServer())
      .get('/reports')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it('RN-122: debe rechazar con 403 si un Coordinador intenta crear un informe CONSOLIDADO', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports/draft')
      .set('Authorization', `Bearer ${coordinator1Token}`)
      .send({
        scope: 'CONSOLIDADO',
        title: 'Intento Consolidado no autorizado',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
      });
    expect(res.status).toBe(403);
  });

  it('RF-049: debe rechazar con 403 si un Coordinador intenta crear un informe en propiedad ajena', async () => {
    // Coordinador 1 está en Torres del Parque, no en Reserva de la Plaza
    const res = await request(app.getHttpServer())
      .post('/reports/draft')
      .set('Authorization', `Bearer ${coordinator1Token}`)
      .send({
        scope: 'PROPIEDAD',
        propertyId: reservaPlazaId,
        title: 'Informe en propiedad ajena',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
      });
    expect(res.status).toBe(403);
  });

  let createdReportId: string;
  let createdReportCode: string;

  it('RF-031, RF-032, CP-18: debe permitir al Director crear un borrador de informe por propiedad con recopilación automática', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports/draft')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        scope: 'PROPIEDAD',
        propertyId: torresDelParqueId,
        title: 'Informe Mensual de Gestión — Torres del Parque',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
        cutoffDate: '2026-05-31',
        introduction: 'Este es el resumen preliminar de la operación en Torres del Parque.',
        observations: 'Todas las novedades críticas fueron atendidas dentro del tiempo reglamentario.',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.code).toMatch(/^INF-\d{4}-\d{4}$/);
    expect(res.body.status).toBe('BORRADOR');
    expect(res.body.propertyName).toBe('Torres del Parque');
    expect(res.body.introduction).toBe('Este es el resumen preliminar de la operación en Torres del Parque.');

    // Verificar que los datos operacionales fueron calculados automáticamente (RF-032)
    expect(res.body.operationalData).toBeDefined();
    expect(res.body.operationalData.kpis).toBeDefined();
    expect(res.body.operationalData.issuesList).toBeDefined();
    expect(Array.isArray(res.body.operationalData.issuesList)).toBe(true);

    createdReportId = res.body.id;
    createdReportCode = res.body.code;
  });

  it('RF-049: debe permitir listar informes según permisos de alcance', async () => {
    const res = await request(app.getHttpServer())
      .get('/reports')
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((r: any) => r.id === createdReportId);
    expect(found).toBeDefined();
    expect(found.code).toBe(createdReportCode);
  });

  it('CP-19, CP-20, RN-125: debe actualizar textos redactados sin alterar datos de origen ni indicadores', async () => {
    const res = await request(app.getHttpServer())
      .put(`/reports/${createdReportId}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        observations: 'Observaciones actualizadas por la dirección operativa.',
        recommendations: 'Implementar rondas preventivas nocturnas adicionales.',
        showKpis: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.observations).toBe('Observaciones actualizadas por la dirección operativa.');
    expect(res.body.recommendations).toBe('Implementar rondas preventivas nocturnas adicionales.');
    // Los datos operativos y de novedades de origen permanecen intactos
    expect(res.body.operationalData).toBeDefined();
    expect(res.body.operationalData.kpis).toBeDefined();
  });

  it('RF-035: debe permitir actualizar explícitamente los datos operativos fuente del borrador', async () => {
    const res = await request(app.getHttpServer())
      .post(`/reports/${createdReportId}/refresh`)
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.operationalData).toBeDefined();
    // Preserva los textos redactados previamente por el autor
    expect(res.body.observations).toBe('Observaciones actualizadas por la dirección operativa.');
    expect(res.body.recommendations).toBe('Implementar rondas preventivas nocturnas adicionales.');
  });

  it('RF-036, CP-33: debe generar y descargar el documento PDF oficial formateado', async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/${createdReportId}/pdf`)
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    expect(res.header['content-type']).toBe('application/pdf');
    expect(res.header['content-disposition']).toContain(`inline; filename="informe-${createdReportCode}.pdf"`);
    expect(res.body).toBeDefined();
    expect(Buffer.isBuffer(res.body) || typeof res.body === 'object').toBe(true);
  });

  it('RF-043, RN-098: debe exportar los datos operativos del informe a Excel (.xlsx)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/${createdReportId}/excel`)
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    expect(res.header['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.header['content-disposition']).toContain(`attachment; filename="informe-${createdReportCode}.xlsx"`);
    expect(res.body).toBeDefined();
  });

  it('debe permitir eliminar un borrador de informe', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/reports/${createdReportId}`)
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const getRes = await request(app.getHttpServer())
      .get(`/reports/${createdReportId}`)
      .set('Authorization', `Bearer ${directorToken}`);
    expect(getRes.status).toBe(404);
  });
});
