import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/database/prisma.service';

/**
 * Reportar desde el celular con mala señal: los reintentos no duplican la novedad ni sus fotos,
 * y cada perfil solo puede hacer lo que le corresponde en el flujo de atención.
 */
describe('Envío de novedades con reintentos y flujo de atención por perfil (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};

  const coordinator1Id = '00000000-0000-0000-0000-000000000014';
  const torresDelParqueId = '00000000-0000-0000-0000-000000000020';
  const categoryPropiedadId = '00000000-0000-0000-0000-000000000040';

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const payload = (clientRequestId: string, title = 'Fuga en el sótano de la Torre B') => ({
    scope: 'PROPIEDAD',
    title,
    description: 'Sale agua por la pared junto a los parqueaderos',
    priority: 'ALTA',
    categoryId: categoryPropiedadId,
    propertyId: torresDelParqueId,
    clientRequestId,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.user.updateMany({
      where: { email: { in: ['coordinador1@sigproh.local', 'director@sigproh.local', 'auxiliar@sigproh.local'] } },
      data: { isActive: true },
    });
    await prisma.category.updateMany({ data: { isActive: true } });

    for (const [who, email] of [
      ['coordinador', 'coordinador1@sigproh.local'],
      ['director', 'director@sigproh.local'],
      ['auxiliar', 'auxiliar@sigproh.local'],
    ]) {
      const res = await http().post('/auth/login').send({ email, password: 'Cambiar123!' });
      tokens[who] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Registro idempotente', () => {
    it('repetir el envío después de que el servidor guardó el caso devuelve la misma novedad', async () => {
      const operationId = randomUUID();

      const first = await http().post('/issues').set(as('coordinador')).send(payload(operationId)).expect(201);
      // La respuesta "se perdió": el celular reintenta con el mismo identificador
      const retry = await http().post('/issues').set(as('coordinador')).send(payload(operationId)).expect(201);

      expect(retry.body.id).toBe(first.body.id);
      expect(retry.body.code).toBe(first.body.code);
      expect(first.body.replayed).toBe(false);
      expect(retry.body.replayed).toBe(true);

      const stored = await prisma.issue.findMany({ where: { clientRequestId: operationId } });
      expect(stored).toHaveLength(1);
      const creationEvents = await prisma.issueEvent.count({
        where: { issueId: first.body.id, eventType: 'CREACION' },
      });
      expect(creationEvents).toBe(1);
    });

    it('dos envíos simultáneos con el mismo identificador generan un solo caso y un solo código', async () => {
      const operationId = randomUUID();

      const [a, b] = await Promise.all([
        http().post('/issues').set(as('coordinador')).send(payload(operationId, 'Doble toque')),
        http().post('/issues').set(as('coordinador')).send(payload(operationId, 'Doble toque')),
      ]);

      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.id).toBe(b.body.id);
      expect(a.body.code).toBe(b.body.code);
      expect(await prisma.issue.count({ where: { clientRequestId: operationId } })).toBe(1);
    });

    it('otra cuenta no puede reutilizar el identificador de un envío ajeno', async () => {
      const operationId = randomUUID();
      await http().post('/issues').set(as('coordinador')).send(payload(operationId)).expect(201);

      const res = await http().post('/issues').set(as('auxiliar')).send(payload(operationId)).expect(409);
      expect(res.body.message).toContain('otra cuenta');
    });

    it('reintentar una foto ya vinculada no la duplica', async () => {
      const created = await http().post('/issues').set(as('coordinador')).send(payload(randomUUID())).expect(201);
      const clientFileId = randomUUID();
      const upload = () =>
        http()
          .post(`/issues/${created.body.id}/attachments`)
          .set(as('coordinador'))
          .attach('file', Buffer.from('foto-de-la-fuga'), { filename: 'fuga.jpg', contentType: 'image/jpeg' })
          .field('stage', 'INICIAL')
          .field('clientFileId', clientFileId);

      const first = await upload().expect(201);
      const retry = await upload().expect(201);

      expect(retry.body.id).toBe(first.body.id);
      expect(await prisma.issueAttachment.count({ where: { issueId: created.body.id } })).toBe(1);
      expect(
        await prisma.issueEvent.count({ where: { issueId: created.body.id, eventType: 'EVIDENCIA_ADJUNTADA' } }),
      ).toBe(1);
    });

    it('un formulario incompleto responde con mensajes en español', async () => {
      const res = await http()
        .post('/issues')
        .set(as('coordinador'))
        .send({ scope: 'PROPIEDAD', title: '', description: '', priority: 'ALTA', propertyId: torresDelParqueId })
        .expect(400);

      const messages: string[] = res.body.message;
      expect(messages).toContain('Escribe un título corto');
      expect(messages).toContain('Describe qué pasó');
      expect(messages).toContain('Elige una categoría');
      expect(messages.join(' ')).not.toMatch(/should not be empty|must be/);
    });
  });

  describe('Flujo de atención según el perfil', () => {
    let issueId: string;

    it('el auxiliar reporta; el caso queda pendiente con su responsable y el aviso dice dónde', async () => {
      const res = await http().post('/issues').set(as('auxiliar')).send(payload(randomUUID())).expect(201);
      issueId = res.body.id;
      expect(res.body.status).toBe('ASIGNADA');
      expect(res.body.assignedUserId).toBe(coordinator1Id);

      const notice = await prisma.notification.findFirst({ where: { issueId, recipientId: coordinator1Id } });
      expect(notice?.title).toBe('Te asignaron una novedad en Torres del Parque');
    });

    it('quien reporta sin ser responsable puede ver el avance pero el servidor le niega iniciar o cerrar', async () => {
      const detail = await http().get(`/issues/${issueId}`).set(as('auxiliar')).expect(200);
      expect(detail.body.assignedUser.id).toBe(coordinator1Id);

      await http().post(`/issues/${issueId}/start`).set(as('auxiliar')).expect(403);
      await http().post(`/issues/${issueId}/close`).set(as('auxiliar')).send({}).expect(403);
    });

    it('el responsable no puede reasignar: esa acción es de coordinación', async () => {
      await http()
        .patch(`/issues/${issueId}/assignment`)
        .set(as('coordinador'))
        .send({ assignedUserId: coordinator1Id })
        .expect(403);
    });

    it('el responsable inicia la atención, registra avance y cierra; el historial guarda quién y cuándo', async () => {
      await http().post(`/issues/${issueId}/start`).set(as('coordinador')).expect(201);

      const activity = await http()
        .post(`/issues/${issueId}/activities`)
        .set(as('coordinador'))
        .send({ title: 'Avance', description: 'Se cambió el tubo roto' })
        .expect(201);
      // El auxiliar no participa en la ejecución
      await http()
        .post(`/issues/${issueId}/activities`)
        .set(as('auxiliar'))
        .send({ title: 'Avance', description: 'No debería poder' })
        .expect(403);

      // Regla vigente: la categoría exige la foto final antes de cerrar
      const category = await prisma.category.findUniqueOrThrow({ where: { id: categoryPropiedadId } });
      if (category.requiresEvidence) {
        const rejected = await http().post(`/issues/${issueId}/close`).set(as('coordinador')).send({}).expect(400);
        expect(rejected.body.message).toContain('foto final');
        await http()
          .post(`/issues/${issueId}/attachments`)
          .set(as('coordinador'))
          .attach('file', Buffer.from('foto-final'), { filename: 'final.jpg', contentType: 'image/jpeg' })
          .field('stage', 'FINAL')
          .expect(201);
      }

      await http()
        .post(`/issues/${issueId}/close`)
        .set(as('coordinador'))
        .send({ closureObservations: 'Se reemplazó el tubo y se secó el área' })
        .expect(201);

      const events = await prisma.issueEvent.findMany({ where: { issueId }, orderBy: { createdAt: 'asc' } });
      const types = events.map((e) => e.eventType);
      expect(types).toEqual(
        expect.arrayContaining(['CREACION', 'CONFIRMACION_ASIGNACION', 'INICIO_TRABAJO', 'ACTIVIDAD_CREADA', 'CIERRE_DEFINITIVO']),
      );
      const closure = events.find((e) => e.eventType === 'CIERRE_DEFINITIVO')!;
      expect(closure.userId).toBe(coordinator1Id);
      expect((closure.details as any).observations).toBe('Se reemplazó el tubo y se secó el área');
      expect(activity.body.id).toBeDefined();
    });

    it('una novedad finalizada antigua, sin foto de cierre, se puede consultar', async () => {
      // Registro histórico: se cerró antes de que existiera la exigencia de foto
      const legacy = await http().post('/issues').set(as('coordinador')).send(payload(randomUUID(), 'Caso antiguo')).expect(201);
      await prisma.issue.update({
        where: { id: legacy.body.id },
        data: { status: 'CERRADA', closedAt: new Date('2026-10-22T15:00:00Z') },
      });

      const detail = await http().get(`/issues/${legacy.body.id}`).set(as('auxiliar')).expect(200);
      expect(detail.body.status).toBe('CERRADA');
      expect(detail.body.closedAt).toBe('2026-10-22T15:00:00.000Z');
      expect(detail.body.attachments).toHaveLength(0);
    });
  });
});
