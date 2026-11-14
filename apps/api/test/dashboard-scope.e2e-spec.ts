import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/database/prisma.service';

/**
 * Regresión: el tablero de Inicio mostraba al coordinador casos fuera de su alcance (8 en
 * «Casos que requieren atención» frente a 5 en Novedades) y al abrirlos el detalle daba 403.
 * El coordinador 1 tiene a la vez una propiedad y un área asignadas: ese es el caso que fallaba.
 */
describe('Tablero de Inicio con el mismo alcance que Novedades (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};

  const coordinator1Id = '00000000-0000-0000-0000-000000000014';
  const torresDelParqueId = '00000000-0000-0000-0000-000000000020'; // asignada al coordinador 1
  const reservaPlazaId = '00000000-0000-0000-0000-000000000021'; // fuera de su alcance
  const operacionesAreaId = '00000000-0000-0000-0000-000000000030'; // asignada al coordinador 1
  const tecnologiaAreaId = '00000000-0000-0000-0000-000000000031'; // fuera de su alcance
  const categoryPropiedadId = '00000000-0000-0000-0000-000000000040';
  const categoryInternaId = '00000000-0000-0000-0000-000000000043';

  const suffix = Date.now().toString(36).toUpperCase();
  const created: Record<'inProperty' | 'inArea' | 'otherProperty' | 'otherArea', string> = {} as any;

  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    // El coordinador 1 debe tener propiedad y área activas a la vez
    await prisma.propertyAssignment.updateMany({
      where: { userId: coordinator1Id, propertyId: torresDelParqueId },
      data: { isActive: true },
    });
    await prisma.areaAssignment.updateMany({
      where: { userId: coordinator1Id, internalAreaId: operacionesAreaId },
      data: { isActive: true },
    });

    for (const [who, email] of [
      ['coord1', 'coordinador1@sigproh.local'],
      ['gerencia', 'gerencia@sigproh.local'],
    ]) {
      const res = await http().post('/auth/login').send({ email, password: 'Cambiar123!' });
      tokens[who] = res.body.accessToken;
    }

    const coordinator = await prisma.user.findUniqueOrThrow({ where: { id: coordinator1Id } });
    const base = {
      organizationId: coordinator.organizationId,
      createdById: coordinator1Id,
      priority: 'CRITICA' as const,
      initialPriority: 'CRITICA' as const,
      status: 'EN_REVISION' as const,
      description: 'Caso de prueba del alcance del tablero',
      // Muy antiguas: así entran en el top 15 de «Casos que requieren atención» aunque la base
      // de pruebas tenga otras críticas abiertas
      createdAt: new Date('2020-01-15T15:00:00Z'),
    };
    const make = async (key: keyof typeof created, data: Record<string, unknown>) => {
      const issue = await prisma.issue.create({
        data: { ...base, code: `NOV-SCOPE-${suffix}-${key}`, title: `Alcance ${key} ${suffix}`, ...data } as any,
      });
      created[key] = issue.id;
    };
    await make('inProperty', { scope: 'PROPIEDAD', propertyId: torresDelParqueId, categoryId: categoryPropiedadId });
    await make('inArea', { scope: 'INTERNA', internalAreaId: operacionesAreaId, categoryId: categoryInternaId });
    await make('otherProperty', { scope: 'PROPIEDAD', propertyId: reservaPlazaId, categoryId: categoryPropiedadId });
    await make('otherArea', { scope: 'INTERNA', internalAreaId: tecnologiaAreaId, categoryId: categoryInternaId });
  });

  afterAll(async () => {
    const ids = Object.values(created);
    await prisma.issueEvent.deleteMany({ where: { issueId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { issueId: { in: ids } } });
    await prisma.issue.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('todos los casos que requieren atención del coordinador se pueden abrir y están en su bandeja', async () => {
    const dashboard = await http().get('/dashboard/metrics').set(as('coord1'));
    expect(dashboard.status).toBe(200);
    const attentionIds: string[] = dashboard.body.attentionRequiredCases.map((c: { id: string }) => c.id);

    expect(attentionIds).toEqual(expect.arrayContaining([created.inProperty, created.inArea]));
    expect(attentionIds).not.toContain(created.otherProperty);
    expect(attentionIds).not.toContain(created.otherArea);

    const inbox = await http().get('/issues').set(as('coord1'));
    const inboxIds = new Set(inbox.body.map((i: { id: string }) => i.id));
    for (const id of attentionIds) {
      expect(inboxIds.has(id)).toBe(true);
      const detail = await http().get(`/issues/${id}`).set(as('coord1'));
      expect(detail.status).toBe(200);
    }
  });

  it('los conteos del tablero salen solo de las novedades autorizadas', async () => {
    const dashboard = await http().get('/dashboard/metrics').set(as('coord1'));
    const inbox = await http().get('/issues').set(as('coord1'));

    const isOpen = (s: string) => s !== 'CERRADA' && s !== 'DESCARTADA';
    const openInInbox = inbox.body.filter((i: { status: string }) => isOpen(i.status)).length;
    // Abiertas al corte (hoy) = abiertas de la bandeja del mismo usuario
    expect(dashboard.body.kpis.totalOpenAtCutoff).toBe(openInInbox);

    const locations = dashboard.body.byLocation.map((l: { id: string }) => l.id);
    expect(locations).not.toContain(reservaPlazaId);
    expect(locations).not.toContain(tecnologiaAreaId);
  });

  it('respeta los filtros: con el filtro de su área solo cuenta los casos de esa área', async () => {
    const res = await http().get(`/dashboard/metrics?internalAreaId=${operacionesAreaId}`).set(as('coord1'));
    expect(res.status).toBe(200);
    const ids = res.body.attentionRequiredCases.map((c: { id: string }) => c.id);
    expect(ids).toContain(created.inArea);
    expect(ids).not.toContain(created.inProperty);
    expect(ids).not.toContain(created.otherArea);
  });

  it('el acceso directo a un caso fuera de su alcance sigue devolviendo 403', async () => {
    for (const id of [created.otherProperty, created.otherArea]) {
      const res = await http().get(`/issues/${id}`).set(as('coord1'));
      expect(res.status).toBe(403);
    }
  });

  it('la Gerencia conserva la vista de toda la organización', async () => {
    const res = await http().get('/dashboard/metrics').set(as('gerencia'));
    expect(res.status).toBe(200);
    const ids = res.body.attentionRequiredCases.map((c: { id: string }) => c.id);
    expect(ids).toEqual(expect.arrayContaining(Object.values(created)));

    // También las ubicaciones que el coordinador no tiene
    const locations = res.body.byLocation.map((l: { id: string }) => l.id);
    expect(locations).toEqual(expect.arrayContaining([reservaPlazaId, tecnologiaAreaId]));
    for (const id of [created.otherProperty, created.otherArea]) {
      expect((await http().get(`/issues/${id}`).set(as('gerencia'))).status).toBe(200);
    }
  });
});
