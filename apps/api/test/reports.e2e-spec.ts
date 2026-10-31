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
  let gerenteToken: string;

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

    const gerRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'gerencia@sigproh.local', password: 'Cambiar123!' });
    gerenteToken = gerRes.body.accessToken;
    // Limpieza de datos de informes para idempotencia de pruebas
    await prisma.reportDistribution.deleteMany({});
    await prisma.reportReview.deleteMany({});
    await prisma.reportVersion.deleteMany({});
    await prisma.report.deleteMany({});
    await prisma.propertyReportConfig.deleteMany({});
    await prisma.institutionalTemplate.deleteMany({});
  });

  afterAll(async () => {
    await prisma.reportDistribution.deleteMany({});
    await prisma.reportReview.deleteMany({});
    await prisma.reportVersion.deleteMany({});
    await prisma.report.deleteMany({});
    await prisma.propertyReportConfig.deleteMany({});
    await prisma.institutionalTemplate.deleteMany({});
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

  // =========================================================================
  // FASE 8: GOBERNANZA, REVISIÓN, APROBACIÓN, VERSIONES Y DISTRIBUCIÓN (e2e)
  // =========================================================================

  describe('Fase 8: Gobernanza de Plantillas, Revisión, Aprobación, Versiones y Distribución', () => {
    let reportId: string;

    it('CP-29, CP-31: Administrador crea y versiona plantilla institucional (solo ADMIN)', async () => {
      // Intento no autorizado por Director
      const dirFail = await request(app.getHttpServer())
        .post('/reports/templates/institutional')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ name: 'Plantilla Director' });
      expect(dirFail.status).toBe(403);

      // Intento omitiendo secciones obligatorias (CP-31)
      const missingMandatory = await request(app.getHttpServer())
        .post('/reports/templates/institutional')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Plantilla Incompleta',
          mandatorySections: ['header', 'metadata'],
        });
      expect(missingMandatory.status).toBe(400);

      // Creación exitosa por Administrador
      const successRes = await request(app.getHttpServer())
        .post('/reports/templates/institutional')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Plantilla Institucional Oficial 2026',
          headerTitle: 'EG S.A.S. — SEGURIDAD INTEGRAL',
          headerSubtitle: 'INFORME DE GESTIÓN OPERATIVA',
          primaryColor: '#0F172A',
          secondaryColor: '#3B82F6',
          isPublished: true,
        });

      expect(successRes.status).toBe(201);
      expect(successRes.body.version).toBeGreaterThanOrEqual(1);
      expect(successRes.body.headerTitle).toBe('EG S.A.S. — SEGURIDAD INTEGRAL');

      // Consultar plantilla publicada
      const pubRes = await request(app.getHttpServer())
        .get('/reports/templates/institutional/published')
        .set('Authorization', `Bearer ${directorToken}`);
      expect(pubRes.status).toBe(200);
      expect(pubRes.body.isPublished).toBe(true);
    });

    it('CP-30, CP-31: Director Operativo configura personalización de copropiedad', async () => {
      // Intento no autorizado por Coordinador
      const coordFail = await request(app.getHttpServer())
        .put(`/reports/properties/${torresDelParqueId}/config`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({ customSubtitle: 'Torres del Parque' });
      expect(coordFail.status).toBe(403);

      // Intento de modificar sección obligatoria institucional (CP-31)
      const invalidSection = await request(app.getHttpServer())
        .put(`/reports/properties/${torresDelParqueId}/config`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ optionalSectionsOrder: ['header', 'kpis'] });
      expect(invalidSection.status).toBe(400);

      // Configuración exitosa por Director
      const successRes = await request(app.getHttpServer())
        .put(`/reports/properties/${torresDelParqueId}/config`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          customSubtitle: 'CONDOMINIO TORRES DEL PARQUE P.H.',
          contactInfo: 'administracion@torresdelparque.com | Cel. 300 123 4567',
          optionalSectionsOrder: ['observations', 'recommendations', 'finalComments'],
        });

      expect(successRes.status).toBe(200);
      expect(successRes.body.customSubtitle).toBe('CONDOMINIO TORRES DEL PARQUE P.H.');
      expect(successRes.body.version).toBe(1);

      // Consultar configuración de la propiedad
      const getRes = await request(app.getHttpServer())
        .get(`/reports/properties/${torresDelParqueId}/config`)
        .set('Authorization', `Bearer ${coordinator1Token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.customSubtitle).toBe('CONDOMINIO TORRES DEL PARQUE P.H.');
    });

    it('La Gerencia no redacta informes (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/reports/draft')
        .set('Authorization', `Bearer ${gerenteToken}`)
        .send({
          scope: 'PROPIEDAD',
          propertyId: torresDelParqueId,
          title: 'Intento de la Gerencia',
          periodStart: '2026-05-01',
          periodEnd: '2026-05-31',
        });
      expect(res.status).toBe(403);
    });

    it('CP-21: El borrador solo lo ven su autor y el Director', async () => {
      const draftRes = await request(app.getHttpServer())
        .post('/reports/draft')
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({
          scope: 'PROPIEDAD',
          propertyId: torresDelParqueId,
          title: 'Informe Operativo Mensual F8',
          periodStart: '2026-05-01',
          periodEnd: '2026-05-31',
          introduction: 'Introducción del coordinador',
        });

      expect(draftRes.status).toBe(201);
      reportId = draftRes.body.id;
      expect(draftRes.body.status).toBe('BORRADOR');

      const gerenteView = await request(app.getHttpServer())
        .get(`/reports/${reportId}`)
        .set('Authorization', `Bearer ${gerenteToken}`);
      expect(gerenteView.status).toBe(404);

      const gerenteList = await request(app.getHttpServer())
        .get('/reports')
        .set('Authorization', `Bearer ${gerenteToken}`);
      expect(gerenteList.status).toBe(200);
      expect(gerenteList.body.some((r: any) => r.id === reportId)).toBe(false);

      const directorView = await request(app.getHttpServer())
        .get(`/reports/${reportId}`)
        .set('Authorization', `Bearer ${directorToken}`);
      expect(directorView.status).toBe(200);

      // El autor ajusta el borrador (incluida la selección de fotos) antes de finalizar (RN-132)
      const editRes = await request(app.getHttpServer())
        .put(`/reports/${reportId}`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({
          observations: 'Se amplió el detalle del cerramiento y rondas de vigilancia.',
          selectedAttachmentIds: [],
        });
      expect(editRes.status).toBe(200);
      expect(editRes.body.observations).toContain('rondas de vigilancia');
    });

    it('CP-22, CP-24: El autor finaliza el informe (BORRADOR -> APROBADO) con hash SHA-256 y queda visible para todos', async () => {
      const finalizeRes = await request(app.getHttpServer())
        .post(`/reports/${reportId}/finalize`)
        .set('Authorization', `Bearer ${coordinator1Token}`);

      expect(finalizeRes.status).toBe(200);
      expect(finalizeRes.body.status).toBe('APROBADO');
      expect(finalizeRes.body.approvedByName).toBeDefined();
      expect(finalizeRes.body.pdfSha256).toBeDefined();
      expect(finalizeRes.body.pdfSha256.length).toBe(64); // SHA-256 hex string

      const gerenteView = await request(app.getHttpServer())
        .get(`/reports/${reportId}`)
        .set('Authorization', `Bearer ${gerenteToken}`);
      expect(gerenteView.status).toBe(200);

      // El informe finalizado es estrictamente inmutable (RN-132)
      const editFail = await request(app.getHttpServer())
        .put(`/reports/${reportId}`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({ title: 'Intento de modificar informe finalizado' });
      expect(editFail.status).toBe(400);
    });

    it('CP-25, CP-26: Crear nueva versión (v2) a partir de informe aprobado', async () => {
      const v2Res = await request(app.getHttpServer())
        .post(`/reports/${reportId}/new-version`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ reason: 'Inclusión de actividades complementarias solicitadas por el consejo' });

      expect(v2Res.status).toBe(200);
      expect(v2Res.body.version).toBe(2);
      expect(v2Res.body.status).toBe('BORRADOR');

      // Consultar historial de versiones inmutables (RF-041)
      const histRes = await request(app.getHttpServer())
        .get(`/reports/${reportId}/versions`)
        .set('Authorization', `Bearer ${directorToken}`);

      expect(histRes.status).toBe(200);
      expect(histRes.body.length).toBeGreaterThanOrEqual(1);
      expect(histRes.body[0].versionNumber).toBe(1);
      expect(histRes.body[0].status).toBe('APROBADO');
      expect(histRes.body[0].pdfSha256).toBeDefined();
    });

    it('CP-27, CP-28: Registrar distribución oficial externa del informe aprobado (solo DIRECTOR)', async () => {
      // Volver a aprobar para poder distribuir o distribuir sobre versión aprobada
      // El borrador actual es v2, así que distribuir v2 debe fallar con 400 (CP-28)
      const distFail = await request(app.getHttpServer())
        .post(`/reports/${reportId}/distribute`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          recipient: 'Consejo de Administración Torres del Parque',
          channel: 'CORREO_ELECTRONICO',
          deliveryDate: '2026-06-05',
        });
      expect(distFail.status).toBe(400);

      // Finalizamos v2
      await request(app.getHttpServer())
        .post(`/reports/${reportId}/finalize`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);

      // Ahora distribuir v2 aprobada
      const distSuccess = await request(app.getHttpServer())
        .post(`/reports/${reportId}/distribute`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          recipient: 'Consejo de Administración Torres del Parque',
          channel: 'CORREO_ELECTRONICO',
          deliveryDate: '2026-06-05',
          notes: 'Enviado formalmente a los 5 miembros del consejo.',
        });

      expect(distSuccess.status).toBe(200);
      expect(distSuccess.body.recipient).toBe('Consejo de Administración Torres del Parque');
      expect(distSuccess.body.reportVersion).toBe(2);

      // Consultar bitácora de distribuciones
      const listDist = await request(app.getHttpServer())
        .get(`/reports/${reportId}/distributions`)
        .set('Authorization', `Bearer ${directorToken}`);

      expect(listDist.status).toBe(200);
      expect(listDist.body.length).toBeGreaterThanOrEqual(1);
      expect(listDist.body[0].recipient).toBe('Consejo de Administración Torres del Parque');
    });

    it('CP-32: Usuario intenta leer o descargar un PDF de otra propiedad por URL directa -> 403 Forbidden', async () => {
      // coordinator2Token solo tiene asignación en Reserva de la Plaza, NO en Torres del Parque
      const directPdfRes = await request(app.getHttpServer())
        .get(`/reports/${reportId}/pdf`)
        .set('Authorization', `Bearer ${coordinator2Token}`);

      expect(directPdfRes.status).toBe(403);
      expect(directPdfRes.body.message).toContain('Acceso denegado');

      const directGetRes = await request(app.getHttpServer())
        .get(`/reports/${reportId}`)
        .set('Authorization', `Bearer ${coordinator2Token}`);

      expect(directGetRes.status).toBe(403);
    });

    it('CP-35: Concurrencia e integridad en transiciones paralelas y versiones de informe', async () => {
      // El informe ya fue APROBADO (v2).
      // 1. Intento de finalizar un informe que ya está APROBADO -> 400 Bad Request
      const reReviewRes = await request(app.getHttpServer())
        .post(`/reports/${reportId}/finalize`)
        .set('Authorization', `Bearer ${coordinator1Token}`);

      expect(reReviewRes.status).toBe(400);

      // 2. Intento de volver a revisar/aprobar directamente un informe ya APROBADO -> 400 Bad Request
      const duplicateApproveRes = await request(app.getHttpServer())
        .post(`/reports/${reportId}/review`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ decision: 'APROBADO' });

      expect(duplicateApproveRes.status).toBe(400);

      // 3. Creación de nueva versión v3 válida a partir de la aprobada
      const v3Res = await request(app.getHttpServer())
        .post(`/reports/${reportId}/new-version`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ reason: 'Actualización complementaria auditada' });

      expect(v3Res.status).toBe(200);
      expect(v3Res.body.version).toBe(3);
      expect(v3Res.body.status).toBe('BORRADOR');

      // Intentar crear otra versión mientras está en BORRADOR debe fallar (solo sobre APROBADOS)
      const invalidDraftVersionRes = await request(app.getHttpServer())
        .post(`/reports/${reportId}/new-version`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ reason: 'Intento inválido sobre borrador' });

      expect(invalidDraftVersionRes.status).toBe(400);

      // Las versiones históricas conservan integridad inmutable
      const versionsRes = await request(app.getHttpServer())
        .get(`/reports/${reportId}/versions`)
        .set('Authorization', `Bearer ${directorToken}`);

      expect(versionsRes.status).toBe(200);
      expect(versionsRes.body.length).toBeGreaterThanOrEqual(2);
    });
  });
});

