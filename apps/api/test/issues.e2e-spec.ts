import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/database/prisma.service';

describe('Ciclo Operativo de Novedades F3 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let coordinator1Token: string;
  let coordinator2Token: string;
  let directorToken: string;
  let adminToken: string;
  let adminId: string;
  let auxiliarToken: string;

  const directorId = '00000000-0000-0000-0000-000000000011';
  const coordinator1Id = '00000000-0000-0000-0000-000000000014';
  const coordinator2Id = '00000000-0000-0000-0000-000000000015';

  const torresDelParqueId = '00000000-0000-0000-0000-000000000020';
  const reservaPlazaId = '00000000-0000-0000-0000-000000000021';
  const operacionesAreaId = '00000000-0000-0000-0000-000000000030';

  const categoryPropiedadId = '00000000-0000-0000-0000-000000000040'; // Mantenimiento Locativo
  const categoryInternaId = '00000000-0000-0000-0000-000000000043'; // Gestión Operativa

  let createdIssueId: string;
  let criticalIssueId: string;

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

    // Asegurar que los usuarios requeridos estén activos
    await prisma.user.updateMany({
      where: {
        id: {
          in: [
            directorId,
            coordinator1Id,
            coordinator2Id,
            '00000000-0000-0000-0000-000000000010',
            '00000000-0000-0000-0000-000000000013',
          ],
        },
      },
      data: { isActive: true },
    });

    // Asegurar que las categorías estén activas
    await prisma.category.updateMany({
      data: { isActive: true },
    });

    // Login Coordinador 1 (asignado a Torres del Parque y Operaciones)
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
    adminId = adminRes.body.user.id;

    // Login Auxiliar de Gerencia
    const auxRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'auxiliar@sigproh.local', password: 'Cambiar123!' });
    auxiliarToken = auxRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('CP-01: Coordinador crea novedad en su propiedad y queda a su cargo, pendiente', async () => {
    const res = await request(app.getHttpServer())
      .post('/issues')
      .set('Authorization', `Bearer ${coordinator1Token}`)
      .send({
        scope: 'PROPIEDAD',
        title: 'Fuga de agua en motobombas',
        description: 'Se evidencia goteo continuo en válvula de paso principal',
        priority: 'ALTA',
        categoryId: categoryPropiedadId,
        propertyId: torresDelParqueId,
      })
      .expect(201);

    expect(res.body.code).toMatch(/^NOV-\d{4}-\d{4}$/);
    expect(res.body.scope).toBe('PROPIEDAD');
    expect(res.body.status).toBe('ASIGNADA');
    expect(res.body.assignedUserId).toBe(coordinator1Id); // Asignación automática a quien reporta

    createdIssueId = res.body.id;
  });

  it('CP-02: Coordinador intenta crear novedad en propiedad no asignada recibe 403 Forbidden', async () => {
    await request(app.getHttpServer())
      .post('/issues')
      .set('Authorization', `Bearer ${coordinator1Token}`)
      .send({
        scope: 'PROPIEDAD',
        title: 'Intento de novedad ajena',
        description: 'No debería permitirse',
        priority: 'MEDIA',
        categoryId: categoryPropiedadId,
        propertyId: reservaPlazaId,
      })
      .expect(403);
  });

  it('CP-03: Validación de pertenencia exclusiva - rechaza novedad interna con propiedad', async () => {
    await request(app.getHttpServer())
      .post('/issues')
      .set('Authorization', `Bearer ${coordinator1Token}`)
      .send({
        scope: 'INTERNA',
        title: 'Incompatibilidad de ámbitos',
        description: 'Prueba',
        priority: 'MEDIA',
        categoryId: categoryInternaId,
        internalAreaId: operacionesAreaId,
        propertyId: torresDelParqueId, // Error: no debe tener propertyId
      })
      .expect(400);
  });

  it('CP-04: Sin coordinador principal en el ámbito -> queda por asignar, sin responsable aleatorio (RN-031)', async () => {
    // Si se crea una novedad donde no hay responsable líder activo definido, queda sin asignar
    const uniqueCode = `AT_${Date.now().toString().slice(-6)}`;
    const unassignedArea = await prisma.internalArea.create({
      data: {
        organizationId: '00000000-0000-0000-0000-000000000001',
        name: `Área Temporal Sin Líder ${uniqueCode}`,
        code: uniqueCode,
      },
    });

    try {
      const unassignedIssueRes = await request(app.getHttpServer())
        .post('/issues')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          scope: 'INTERNA',
          title: 'Novedad en área sin líder sugerido',
          description: 'Debe quedar sin asignar y no asignarse a un usuario aleatorio',
          priority: 'MEDIA',
          categoryId: categoryInternaId,
          internalAreaId: unassignedArea.id,
        })
        .expect(201);

      expect(unassignedIssueRes.body.assignedUserId).toBeNull();
      expect(unassignedIssueRes.body.assignedUser).toBeFalsy();
      expect(unassignedIssueRes.body.status).toBe('EN_REVISION');
    } finally {
      const issuesToDelete = await prisma.issue.findMany({
        where: { internalAreaId: unassignedArea.id },
        select: { id: true },
      });
      const ids = issuesToDelete.map((i) => i.id);
      if (ids.length > 0) {
        await prisma.issueEvent.deleteMany({ where: { issueId: { in: ids } } });
        await prisma.issue.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.internalArea.delete({ where: { id: unassignedArea.id } });
    }
  });

  it('PEN-03: el Auxiliar de Gerencia registra novedades, incluso críticas', async () => {
    await request(app.getHttpServer())
      .post('/issues')
      .set('Authorization', `Bearer ${auxiliarToken}`)
      .send({
        scope: 'PROPIEDAD',
        title: 'Fallo crítico reportado por Auxiliar',
        description: 'Permitido tras resolver PEN-03',
        priority: 'CRITICA',
        categoryId: categoryPropiedadId,
        propertyId: torresDelParqueId,
      })
      .expect(201);
  });

  it('Aislamiento del Administrador: no puede registrar ni consultar novedades operativas', async () => {
    // 1. No puede registrar novedad (403)
    await request(app.getHttpServer())
      .post('/issues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        scope: 'PROPIEDAD',
        title: 'Intento Admin',
        description: 'Admin no crea novedades',
        priority: 'MEDIA',
        categoryId: categoryPropiedadId,
        propertyId: torresDelParqueId,
      })
      .expect(403);

    // 2. No puede listar novedades (403)
    await request(app.getHttpServer())
      .get('/issues')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    // 3. No puede consultar detalle operativo (403)
    await request(app.getHttpServer())
      .get(`/issues/${createdIssueId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  it('CP-06: Coordinador intenta confirmar/asignar responsable principal y recibe 403 Forbidden', async () => {
    await request(app.getHttpServer())
      .patch(`/issues/${createdIssueId}/assignment`)
      .set('Authorization', `Bearer ${coordinator1Token}`)
      .send({
        assignedUserId: coordinator1Id,
      })
      .expect(403);
  });

  it('RF-011: Director y usuarios autorizados en el ámbito consultan candidatos', async () => {
    // Coordinador sin acceso al ámbito o Administrador reciben 403
    await request(app.getHttpServer())
      .get(`/issues/${createdIssueId}/candidates`)
      .set('Authorization', `Bearer ${coordinator2Token}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/issues/${createdIssueId}/candidates`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    // Coordinador autorizado en el ámbito puede consultar candidatos para asignaciones/menciones (F4)
    const coordRes = await request(app.getHttpServer())
      .get(`/issues/${createdIssueId}/candidates`)
      .set('Authorization', `Bearer ${coordinator1Token}`)
      .expect(200);

    const coordCandidateIds = coordRes.body.map((c: any) => c.id);
    expect(coordCandidateIds).toContain(coordinator1Id);
    expect(coordCandidateIds).toContain(directorId);
    expect(coordCandidateIds).not.toContain(coordinator2Id);

    // Director consulta candidatos válidos
    const res = await request(app.getHttpServer())
      .get(`/issues/${createdIssueId}/candidates`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    const candidateIds = res.body.map((c: any) => c.id);
    expect(candidateIds).toContain(coordinator1Id);
    expect(candidateIds).toContain(directorId);
    expect(candidateIds).not.toContain(coordinator2Id);
    expect(candidateIds).not.toContain(adminId);
  });

  it('RN-001 / RN-002: Rechaza asignar al Administrador del Sistema como responsable principal', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/issues/${createdIssueId}/assignment`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        assignedUserId: adminId,
      })
      .expect(400);

    expect(res.body.message).toContain('Administrador del Sistema');
  });

  it('RF-011: Director intenta asignar responsable no autorizado en el ámbito y recibe 400 Bad Request', async () => {
    // Coordinador 2 solo tiene asignación en Reserva de la Plaza, no en Torres del Parque
    const res = await request(app.getHttpServer())
      .patch(`/issues/${createdIssueId}/assignment`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        assignedUserId: coordinator2Id,
      })
      .expect(400);

    expect(res.body.message).toContain('RF-011');
  });

  it('CP-05: Confirmar al mismo responsable no cambia el estado de una novedad pendiente', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/issues/${createdIssueId}/assignment`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        assignedUserId: coordinator1Id,
      })
      .expect(200);

    expect(res.body.status).toBe('ASIGNADA');
    expect(res.body.assignedUserId).toBe(coordinator1Id);
  });

  it('Director reasigna responsable principal a usuario autorizado exigiendo motivo obligatorio', async () => {
    // 1. Intento sin motivo -> 400
    await request(app.getHttpServer())
      .patch(`/issues/${createdIssueId}/assignment`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        assignedUserId: directorId, // Director tiene alcance global
      })
      .expect(400);

    // 2. Con motivo -> 200
    const res = await request(app.getHttpServer())
      .patch(`/issues/${createdIssueId}/assignment`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        assignedUserId: directorId,
        reason: 'Dirección asume temporalmente la atención directa del caso',
      })
      .expect(200);

    expect(res.body.assignedUserId).toBe(directorId);
  });

  it('CP-07: Registro de novedad crítica con medidas urgentes inmediatas y alerta al Director', async () => {
    const res = await request(app.getHttpServer())
      .post('/issues')
      .set('Authorization', `Bearer ${coordinator1Token}`)
      .send({
        scope: 'PROPIEDAD',
        title: 'Incendio incipiente en cuarto de máquinas',
        description: 'Humo denso y cortocircuito en tablero principal',
        priority: 'CRITICA',
        categoryId: categoryPropiedadId,
        propertyId: torresDelParqueId,
        urgentMeasures: 'Se bajó el totalizador eléctrico y se activó extintor de CO2',
      })
      .expect(201);

    expect(res.body.priority).toBe('CRITICA');
    expect(res.body.initialPriority).toBe('CRITICA');
    expect(res.body.urgentMeasures).toContain('Se bajó el totalizador eléctrico');

    criticalIssueId = res.body.id;

    // Verificar notificación de alerta creada para el Director
    const notif = await prisma.notification.findFirst({
      where: {
        issueId: criticalIssueId,
        recipientId: directorId,
      },
    });
    expect(notif).toBeDefined();
    expect(notif?.title).toContain('ALERTA: Novedad crítica');
  });

  it('RF-014 / CP-08: Reclasificar a CRITICA genera alerta al Director; luego Director ajusta prioridad con motivo', async () => {
    // 1. Crear novedad con prioridad MEDIA
    const newIssueRes = await request(app.getHttpServer())
      .post('/issues')
      .set('Authorization', `Bearer ${coordinator1Token}`)
      .send({
        scope: 'PROPIEDAD',
        title: 'Goteo en cubierta',
        description: 'Filtración leve',
        priority: 'MEDIA',
        categoryId: categoryPropiedadId,
        propertyId: torresDelParqueId,
      })
      .expect(201);

    const reclassId = newIssueRes.body.id;

    // 2. Director la reclasifica a CRITICA con motivo -> debe disparar alerta RF-014 en la misma transacción
    await request(app.getHttpServer())
      .patch(`/issues/${reclassId}/priority`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        priority: 'CRITICA',
        reason: 'Se detectó desprendimiento de láminas con riesgo sobre peatones',
      })
      .expect(200);

    const reclassAlert = await prisma.notification.findFirst({
      where: {
        issueId: reclassId,
        recipientId: directorId,
        title: { contains: 'reclasificada a CRÍTICA' },
      },
    });
    expect(reclassAlert).toBeDefined();

    // 3. Ajuste posterior de criticidad reservado a Director, preservando prioridad inicial
    const adjustRes = await request(app.getHttpServer())
      .patch(`/issues/${criticalIssueId}/priority`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        priority: 'MEDIA',
        reason: 'Revisión técnica confirma que fue solo un fusible quemado ya controlado',
      })
      .expect(200);

    expect(adjustRes.body.priority).toBe('MEDIA');
    expect(adjustRes.body.initialPriority).toBe('CRITICA');
  });

  it('RF-026: Consulta de detalle incluye historial cronológico de eventos de auditoría', async () => {
    const res = await request(app.getHttpServer())
      .get(`/issues/${criticalIssueId}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    expect(res.body.events.length).toBeGreaterThanOrEqual(3);
    const eventTypes = res.body.events.map((e: any) => e.eventType);
    expect(eventTypes).toContain('CREACION');
    expect(eventTypes).toContain('MEDIDA_URGENTE');
    expect(eventTypes).toContain('CAMBIO_PRIORIDAD');
  });

  it('RF-049: Filtrado de novedades por alcance de usuario en listado', async () => {
    // Coordinador 1 listando novedades: ve la novedad creada en Torres del Parque
    const c1List = await request(app.getHttpServer())
      .get('/issues')
      .set('Authorization', `Bearer ${coordinator1Token}`)
      .expect(200);

    expect(c1List.body.some((i: any) => i.id === createdIssueId)).toBe(true);

    // Coordinador 2 no está asignado a Torres del Parque: NO ve la novedad creada en Torres del Parque
    const c2List = await request(app.getHttpServer())
      .get('/issues')
      .set('Authorization', `Bearer ${coordinator2Token}`)
      .expect(200);

    expect(c2List.body.some((i: any) => i.id === createdIssueId)).toBe(false);

    // Director Operativo ve todas
    const dirList = await request(app.getHttpServer())
      .get('/issues')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    expect(dirList.body.some((i: any) => i.id === createdIssueId)).toBe(true);
  });

  describe('F4: Actividades, comentarios, integridad y auditoría (CP-09 a CP-11)', () => {
    let activityId: string;

    it('CP-09 (RF-019 / RF-020): Creación de actividad y notificación al responsable asignado', async () => {
      // 1. Director crea la actividad asignando al Coordinador 1 (autorizado en Torres del Parque)
      const res = await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/activities`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: 'Inspección técnica de contactores',
          description: 'Verificar estado de contactos y bobina de control',
          assignedUserId: coordinator1Id,
          dueDate: '2026-10-25T18:00:00.000Z',
        })
        .expect(201);

      activityId = res.body.id;
      expect(activityId).toBeDefined();
      expect(res.body.title).toBe('Inspección técnica de contactores');
      expect(res.body.status).toBe('PENDIENTE');
      expect(res.body.version).toBe(1);
      expect(res.body.assignedUserId).toBe(coordinator1Id);

      // 2. Verificar evento de auditoría ACTIVIDAD_CREADA en la misma transacción
      const auditEvent = await prisma.issueEvent.findFirst({
        where: {
          issueId: createdIssueId,
          eventType: 'ACTIVIDAD_CREADA',
          details: {
            path: ['activityId'],
            equals: activityId,
          },
        },
      });
      expect(auditEvent).toBeDefined();
      expect(auditEvent?.userId).toBe(directorId);

      // 3. Verificar notificación creada para el responsable asignado
      const notification = await prisma.notification.findFirst({
        where: {
          issueId: createdIssueId,
          recipientId: coordinator1Id,
          title: { contains: 'Nueva actividad asignada' },
        },
      });
      expect(notification).toBeDefined();
    });

    it('CP-10: Rechazo de candidatos no autorizados en el ámbito o rol Administrador', async () => {
      // 1. Intento de asignar al Coordinador 2 (pertenece a Reserva de la Plaza, no a Torres del Parque)
      const unauthRes = await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/activities`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: 'Prueba no autorizada',
          description: 'Debe fallar por falta de asignación al ámbito',
          assignedUserId: coordinator2Id,
        })
        .expect(400);

      expect(unauthRes.body.message).toContain('autorización activa sobre la propiedad');

      // 2. Intento de asignar al Administrador del Sistema (RN-001 / RN-002)
      const adminRes = await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/activities`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: 'Prueba admin',
          description: 'Debe fallar porque admin no opera',
          assignedUserId: adminId,
        })
        .expect(400);

      expect(adminRes.body.message).toContain('Administrador del Sistema no puede ser asignado');
    });

    it('CP-11 (RF-019 / RN-069 / RN-070): Bloqueo y cancelación exigen motivo obligatorio', async () => {
      // 1. Intentar pasar a BLOQUEADA sin motivo -> 400
      await request(app.getHttpServer())
        .patch(`/issues/${createdIssueId}/activities/${activityId}`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({
          status: 'BLOQUEADA',
          version: 1,
        })
        .expect(400);

      // 2. Pasar a BLOQUEADA con motivo válido -> 200 y version incrementada a 2
      const blockRes = await request(app.getHttpServer())
        .patch(`/issues/${createdIssueId}/activities/${activityId}`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({
          status: 'BLOQUEADA',
          statusReason: 'Falta repuesto Schneider LC1D09 en bodega',
          version: 1,
        })
        .expect(200);

      expect(blockRes.body.status).toBe('BLOQUEADA');
      expect(blockRes.body.statusReason).toBe('Falta repuesto Schneider LC1D09 en bodega');
      expect(blockRes.body.version).toBe(2);

      // Finding 4: Una actividad bloqueada rechaza { statusReason: "" } o { statusReason: "   " } sin cambiar de estado (400)
      await request(app.getHttpServer())
        .patch(`/issues/${createdIssueId}/activities/${activityId}`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({
          statusReason: '',
          version: 2,
        })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/issues/${createdIssueId}/activities/${activityId}`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({
          statusReason: '   ',
          version: 2,
        })
        .expect(400);

      // Verificar evento de auditoría de cambio de estado
      const blockEvent = await prisma.issueEvent.findFirst({
        where: {
          issueId: createdIssueId,
          eventType: 'ACTIVIDAD_ESTADO',
          details: {
            path: ['newStatus'],
            equals: 'BLOQUEADA',
          },
        },
      });
      expect(blockEvent).toBeDefined();
    });

    it('Concurrencia: Rechazo con 409 Conflict ante versión desactualizada', async () => {
      // Intentar actualizar usando version 1 cuando la actividad ya está en version 2
      const conflictRes = await request(app.getHttpServer())
        .patch(`/issues/${createdIssueId}/activities/${activityId}`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({
          status: 'EN_CURSO',
          version: 1, // Versión obsoleta
        })
        .expect(409);

      expect(conflictRes.body.message).toContain('Conflicto de concurrencia (409)');
    });

    it('Permisos de actualización y ámbito vigente: Distinción entre Director, responsable principal y responsable de actividad', async () => {
      // Finding 2: Usuario sin acceso vigente al ámbito (Coordinador 2) recibe 403 en creación, reasignación y modificación
      await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/activities`)
        .set('Authorization', `Bearer ${coordinator2Token}`)
        .send({
          title: 'Actividad sin acceso',
          description: 'No debería permitirse',
        })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/issues/${createdIssueId}/activities/${activityId}/assignment`)
        .set('Authorization', `Bearer ${coordinator2Token}`)
        .send({
          assignedUserId: coordinator1Id,
          version: 2,
        })
        .expect(403);

      // 1. Coordinador 2 (sin permisos ni asignación) intenta modificar la actividad -> 403
      await request(app.getHttpServer())
        .patch(`/issues/${createdIssueId}/activities/${activityId}`)
        .set('Authorization', `Bearer ${coordinator2Token}`)
        .send({
          status: 'EN_CURSO',
          version: 2,
        })
        .expect(403);

      // 2. Coordinador 1 (responsable asignado de la actividad, pero no Director ni Principal)
      // intenta modificar título general de la tarea -> 403
      await request(app.getHttpServer())
        .patch(`/issues/${createdIssueId}/activities/${activityId}`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({
          title: 'Nuevo título no permitido',
          version: 2,
        })
        .expect(403);

      // 3. Coordinador 1 intenta cancelar la actividad -> 403 (solo Director o Principal)
      await request(app.getHttpServer())
        .patch(`/issues/${createdIssueId}/activities/${activityId}`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({
          status: 'CANCELADA',
          statusReason: 'Cancelación solicitada por técnico',
          version: 2,
        })
        .expect(403);
    });

    it('Invariante de NO cierre y preservación de completedAt: Guardar nuevamente COMPLETADA conserva la fecha real', async () => {
      // 1. Coordinador 1 completa la actividad con version 2 -> 200 y version 3
      const completeRes = await request(app.getHttpServer())
        .patch(`/issues/${createdIssueId}/activities/${activityId}`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({
          status: 'COMPLETADA',
          version: 2,
        })
        .expect(200);

      expect(completeRes.body.status).toBe('COMPLETADA');
      expect(completeRes.body.completedAt).toBeDefined();
      expect(completeRes.body.version).toBe(3);
      const initialCompletedAt = completeRes.body.completedAt;

      // Finding 5: Guardar nuevamente COMPLETADA NO debe reemplazar completedAt
      const reSaveRes = await request(app.getHttpServer())
        .patch(`/issues/${createdIssueId}/activities/${activityId}`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({
          status: 'COMPLETADA',
          version: 3,
        })
        .expect(200);

      expect(reSaveRes.body.status).toBe('COMPLETADA');
      expect(reSaveRes.body.completedAt).toBe(initialCompletedAt);
      expect(reSaveRes.body.version).toBe(4);

      // 2. Comprobar que la novedad NO ha sido cerrada (el cierre formal pertenece a F5)
      const issueRes = await request(app.getHttpServer())
        .get(`/issues/${createdIssueId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);

      expect(issueRes.body.status).not.toBe('CERRADA');
      expect(issueRes.body.status).not.toBe('RESUELTA');
    });

    it('Auditoría detallada de datos generales: Registra valores anteriores y nuevos al cambiar título, descripción o fecha límite', async () => {
      // Finding 6: El Director actualiza datos generales en versión 4
      const newDueDate = new Date(Date.now() + 86400000).toISOString();
      const updateRes = await request(app.getHttpServer())
        .patch(`/issues/${createdIssueId}/activities/${activityId}`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          title: 'Inspección final de contactores y cableado',
          description: 'Verificación exhaustiva de contactor trifásico y terminales de potencia',
          dueDate: newDueDate,
          version: 4,
        })
        .expect(200);

      expect(updateRes.body.version).toBe(5);

      // Comprobar el evento de auditoría en la base de datos
      const auditEvent = await prisma.issueEvent.findFirst({
        where: {
          issueId: createdIssueId,
          eventType: 'ACTIVIDAD_ESTADO',
          details: {
            path: ['newVersion'],
            equals: 5,
          },
        },
      });

      expect(auditEvent).toBeDefined();
      const details = auditEvent?.details as any;
      expect(details.changes).toBeDefined();
      expect(details.changes.title).toEqual({
        previous: 'Inspección técnica de contactores',
        new: 'Inspección final de contactores y cableado',
      });
      expect(details.changes.description).toEqual({
        previous: 'Verificar estado de contactos y bobina de control',
        new: 'Verificación exhaustiva de contactor trifásico y terminales de potencia',
      });
      expect(details.changes.dueDate).toBeDefined();
      expect(details.changes.dueDate.new).toBe(newDueDate);
    });

    it('Integridad y menciones en comentarios (RF-020): Verificación estricta de pertenencia y notificaciones', async () => {
      // 1. Intento de comentar con un activityId inexistente o que no pertenece a la novedad -> 400
      await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/comments`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          content: 'Comentario con actividad inválida',
          activityId: '00000000-0000-0000-0000-000000000999',
        })
        .expect(400);

      // 2. Intento de mencionar a un usuario no autorizado en el ámbito -> 400
      await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/comments`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          content: 'Mención a usuario no autorizado',
          activityId,
          mentions: [coordinator2Id],
        })
        .expect(400);

      // 3. Comentario válido vinculando actividad y mencionando al Coordinador 1 (autorizado)
      const commentRes = await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/comments`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          content: 'Excelente trabajo con la inspección del contactor @coordinador1',
          activityId,
          mentions: [coordinator1Id],
        })
        .expect(201);

      expect(commentRes.body.id).toBeDefined();
      expect(commentRes.body.activityId).toBe(activityId);
      expect(commentRes.body.mentions).toContain(coordinator1Id);

      // 4. Verificar auditoría del comentario
      const commentEvent = await prisma.issueEvent.findFirst({
        where: {
          issueId: createdIssueId,
          eventType: 'COMENTARIO_AGREGADO',
          details: {
            path: ['commentId'],
            equals: commentRes.body.id,
          },
        },
      });
      expect(commentEvent).toBeDefined();

      // 5. Verificar notificación por mención generada en la misma transacción
      const mentionNotification = await prisma.notification.findFirst({
        where: {
          issueId: createdIssueId,
          recipientId: coordinator1Id,
          title: { contains: 'Mención' },
        },
      });
      expect(mentionNotification).toBeDefined();

      // 6. Listado de comentarios filtrado por actividad respetando integridad
      const commentsList = await request(app.getHttpServer())
        .get(`/issues/${createdIssueId}/comments?activityId=${activityId}`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .expect(200);

      expect(commentsList.body.length).toBeGreaterThanOrEqual(1);
      expect(commentsList.body[0].activityId).toBe(activityId);

      // 7. Detalle de la novedad incluye actividades y comentarios consolidados
      const detailRes = await request(app.getHttpServer())
        .get(`/issues/${createdIssueId}`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .expect(200);

      expect(detailRes.body.activities.length).toBeGreaterThanOrEqual(1);
      expect(detailRes.body.comments.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('F5: Evidencias de cierre, cierre directo, reapertura, descarte y notificaciones (CP-12 a CP-16)', () => {
    let attachmentId: string;
    let finalAttachmentId: string;
    let sampleNotificationId: string;

    it('CP-12: Categoría exige evidencia final y se intenta cerrar sin ella -> Cierre impedido con mensaje claro (400 Bad Request)', async () => {
      // 0. Director reasigna formalmente al Coordinador 1 para que sea el responsable principal
      await request(app.getHttpServer())
        .patch(`/issues/${createdIssueId}/assignment`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({
          assignedUserId: coordinator1Id,
          reason: 'Reasignación operativa al coordinador de la propiedad para gestión de cierre',
        })
        .expect(200);

      // 1. Sin iniciar el trabajo no se puede finalizar; el responsable lo inicia
      const pendingRes = await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/close`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({})
        .expect(400);
      expect(pendingRes.body.message).toContain('Inicie el trabajo');

      const startRes = await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/start`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .expect(201);
      expect(startRes.body.status).toBe('EN_ATENCION');

      // 2. Coordinador 1 intenta cerrar sin haber adjuntado evidencia FINAL
      const res = await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/close`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({ closureObservations: 'Listo para cierre técnico' })
        .expect(400);

      expect(res.body.message).toContain('foto final');
    });

    it('RF-021 / RF-022 / PEN-07: Adjuntar y descargar evidencias con clasificación de etapas, hash de integridad y aislamiento de ámbito', async () => {
      // 1. Coordinador 1 adjunta una evidencia de etapa SOPORTE
      const fakeImageBuffer = Buffer.from('fake-image-content-soporte');
      const attachRes = await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/attachments`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .attach('file', fakeImageBuffer, 'cotizacion_repuestos.pdf')
        .field('stage', 'SOPORTE')
        .expect(201);

      expect(attachRes.body.id).toBeDefined();
      expect(attachRes.body.fileName).toBe('cotizacion_repuestos.pdf');
      expect(attachRes.body.stage).toBe('SOPORTE');
      expect(attachRes.body.mimeType).toBe('application/pdf');
      expect(attachRes.body.sha256).toBeDefined();
      attachmentId = attachRes.body.id;

      // 2. Coordinador 2 (no autorizado en Torres del Parque) intenta acceder a los adjuntos -> 403 Forbidden
      await request(app.getHttpServer())
        .get(`/issues/${createdIssueId}/attachments`)
        .set('Authorization', `Bearer ${coordinator2Token}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/issues/${createdIssueId}/attachments/${attachmentId}/download`)
        .set('Authorization', `Bearer ${coordinator2Token}`)
        .expect(403);

      // 3. Coordinador 1 autorizado descarga el archivo -> 200 OK con Content-Type y Disposition
      const downloadRes = await request(app.getHttpServer())
        .get(`/issues/${createdIssueId}/attachments/${attachmentId}/download`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .expect(200);

      expect(downloadRes.header['content-type']).toContain('application/pdf');
      expect(downloadRes.header['content-disposition']).toContain('cotizacion_repuestos.pdf');
      expect(downloadRes.body.toString()).toBe('fake-image-content-soporte');

      // 4. Coordinador 1 adjunta la evidencia obligatoria en etapa FINAL
      const fakeFinalBuffer = Buffer.from('fake-final-photo-content');
      const finalAttachRes = await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/attachments`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .attach('file', fakeFinalBuffer, 'foto_reparacion_final.png')
        .field('stage', 'FINAL')
        .expect(201);

      expect(finalAttachRes.body.stage).toBe('FINAL');
      finalAttachmentId = finalAttachRes.body.id;
    });

    it('CP-14: Quien no es el coordinador responsable ni el Director no puede cerrar (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/close`)
        .set('Authorization', `Bearer ${auxiliarToken}`)
        .send({ closureObservations: 'Intento de cierre no autorizado' })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/close`)
        .set('Authorization', `Bearer ${coordinator2Token}`)
        .send({ closureObservations: 'Intento de cierre no autorizado' })
        .expect(403);
    });

    it('CP-13 (RF-025): El coordinador responsable cierra directamente con evidencias suficientes y se notifica al Director', async () => {
      const closeRes = await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/close`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({ closureObservations: 'Se culminó la reparación y se adjuntó la foto final del contactor nuevo.' })
        .expect(201);

      expect(closeRes.body.status).toBe('CERRADA');
      expect(closeRes.body.closedAt).toBeDefined();

      const closeEvent = await prisma.issueEvent.findFirst({
        where: {
          issueId: createdIssueId,
          eventType: 'CIERRE_DEFINITIVO',
        },
      });
      expect(closeEvent).toBeDefined();
      expect((closeEvent?.details as any).observations).toContain('foto final');

      const directorNotification = await prisma.notification.findFirst({
        where: {
          issueId: createdIssueId,
          recipientId: directorId,
          title: { contains: 'Novedad cerrada' },
        },
      });
      expect(directorNotification).toBeDefined();
    });

    it('CP-16: El coordinador responsable reabre con motivo -> EN_ATENCION; el Director vuelve a cerrar', async () => {
      // 1. Un coordinador sin la novedad asignada no puede reabrir -> 403 Forbidden
      await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/reopen`)
        .set('Authorization', `Bearer ${coordinator2Token}`)
        .send({ reason: 'Falla recurrente detectada' })
        .expect(403);

      // 2. El coordinador responsable reabre con motivo obligatorio
      const reopenRes = await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/reopen`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({ reason: 'El equipo volvió a fallar en la noche según reporte del vigilante' })
        .expect(201);

      expect(reopenRes.body.status).toBe('EN_ATENCION');
      expect(reopenRes.body.closedAt).toBeNull();

      const reopenEvent = await prisma.issueEvent.findFirst({
        where: {
          issueId: createdIssueId,
          eventType: 'REAPERTURA',
        },
      });
      expect(reopenEvent).toBeDefined();
      expect((reopenEvent?.details as any).reason).toContain('volvió a fallar');

      // 3. El Director también puede cerrar
      const closeRes = await request(app.getHttpServer())
        .post(`/issues/${createdIssueId}/close`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ closureObservations: 'Verificado trabajo técnico tras la reapertura.' })
        .expect(201);

      expect(closeRes.body.status).toBe('CERRADA');
    });

    it('Descarte de novedad (RF-012 / PEN-13): Solo por Director, en cualquier novedad abierta', async () => {
      // 1. Crear una nueva novedad ordinaria para prueba de descarte
      const createRes = await request(app.getHttpServer())
        .post('/issues')
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({
          scope: 'PROPIEDAD',
          propertyId: torresDelParqueId,
          categoryId: categoryPropiedadId,
          priority: 'BAJA',
          title: 'Reporte duplicado de lámpara',
          description: 'Lámpara del pasillo 3 que ya había sido reportada en otro ticket',
        })
        .expect(201);

      const discardCandidateId = createRes.body.id;

      // 2. Coordinador intenta descartar -> 403 Forbidden
      await request(app.getHttpServer())
        .post(`/issues/${discardCandidateId}/discard`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .send({ reason: 'Es un duplicado' })
        .expect(403);

      // 3. Director descarta con motivo
      const discardRes = await request(app.getHttpServer())
        .post(`/issues/${discardCandidateId}/discard`)
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ reason: 'Novedad duplicada con respecto a caso NOV anterior' })
        .expect(201);

      expect(discardRes.body.status).toBe('DESCARTADA');

      const discardEvent = await prisma.issueEvent.findFirst({
        where: {
          issueId: discardCandidateId,
          eventType: 'DESCARTE',
        },
      });
      expect(discardEvent).toBeDefined();
      expect((discardEvent?.details as any).reason).toContain('duplicada');
    });

    it('Módulo de Notificaciones (RF-027 / RF-028): Consultar, contar y marcar como leídas las notificaciones', async () => {
      // 1. Coordinador 1 consulta su lista de notificaciones
      const notifRes = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .expect(200);

      expect(Array.isArray(notifRes.body)).toBe(true);
      expect(notifRes.body.length).toBeGreaterThanOrEqual(1);
      sampleNotificationId = notifRes.body[0].id;

      // 2. Conteo de notificaciones no leídas
      const countRes = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .expect(200);

      expect(countRes.body.unreadCount).toBeGreaterThanOrEqual(1);

      // 3. Marcar una notificación individual como leída
      const markRes = await request(app.getHttpServer())
        .patch(`/notifications/${sampleNotificationId}/read`)
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .expect(200);

      expect(markRes.body.isRead).toBe(true);
      expect(markRes.body.readAt).toBeDefined();

      // 4. Marcar todas las notificaciones como leídas
      const markAllRes = await request(app.getHttpServer())
        .patch('/notifications/read-all')
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .expect(200);

      expect(markAllRes.body.updatedCount).toBeGreaterThanOrEqual(0);

      // 5. Verificar que el conteo de no leídas ahora es 0
      const finalCountRes = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${coordinator1Token}`)
        .expect(200);

      expect(finalCountRes.body.unreadCount).toBe(0);
    });

    it('CP-17: Desactivar una categoría con casos anteriores -> el historial y detalle de los casos permanece totalmente legible', async () => {
      try {
        // 1. Desactivar la categoría en la base de datos
        await prisma.category.update({
          where: { id: categoryPropiedadId },
          data: { isActive: false },
        });

        // 2. Intentar crear una NUEVA novedad con esta categoría desactivada debe ser rechazada (400)
        await request(app.getHttpServer())
          .post('/issues')
          .set('Authorization', `Bearer ${coordinator1Token}`)
          .send({
            scope: 'PROPIEDAD',
            propertyId: torresDelParqueId,
            categoryId: categoryPropiedadId,
            priority: 'BAJA',
            title: 'Intento con categoría inactiva',
            description: 'No debe permitirse',
          })
          .expect(400);

        // 3. Consultar la novedad histórica que ya tenía asignada esta categoría
        const issueDetailRes = await request(app.getHttpServer())
          .get(`/issues/${createdIssueId}`)
          .set('Authorization', `Bearer ${coordinator1Token}`)
          .expect(200);

        // El nombre y detalle de la categoría permanece legible e intacto en el caso histórico
        expect(issueDetailRes.body.category).toBeDefined();
        expect(issueDetailRes.body.category.id).toBe(categoryPropiedadId);
        expect(issueDetailRes.body.category.name).toBe('Mantenimiento Locativo');
      } finally {
        // Restauramos siempre la categoría a activa
        await prisma.category.update({
          where: { id: categoryPropiedadId },
          data: { isActive: true },
        });
      }
    });
  });
});

