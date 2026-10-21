import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Estructura Organizativa y Aislamiento de Ámbitos (e2e)', () => {
  let app: INestApplication<App>;
  let coordinatorToken: string;
  let directorToken: string;
  let adminToken: string;

  const torresDelParqueId = '00000000-0000-0000-0000-000000000020';
  const reservaPlazaId = '00000000-0000-0000-0000-000000000021';
  const operacionesAreaId = '00000000-0000-0000-0000-000000000030';
  const sistemasAreaId = '00000000-0000-0000-0000-000000000031';

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

    // Iniciar sesión como Coordinador 1 (asignado a Torres del Parque)
    const coordRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'coordinador1@sigproh.local', password: 'Cambiar123!' });
    expect(coordRes.status).toBe(201);
    coordinatorToken = coordRes.body.accessToken;

    // Iniciar sesión como Director Operativo
    const dirRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'director@sigproh.local', password: 'Cambiar123!' });
    expect(dirRes.status).toBe(201);
    directorToken = dirRes.body.accessToken;

    // Iniciar sesión como Administrador
    const adminRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@sigproh.local', password: 'Cambiar123!' });
    expect(adminRes.status).toBe(201);
    adminToken = adminRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('debe rechazar solicitudes a recursos protegidos sin token con 401', async () => {
    await request(app.getHttpServer())
      .get('/properties')
      .expect(401);
  });

  it('GET /auth/me: debe retornar el perfil del usuario autenticado con su rol y asignaciones activas', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(200);

    expect(res.body.email).toBe('coordinador1@sigproh.local');
    expect(res.body.role).toBe('COORDINADOR_OPERATIVO');
    expect(res.body.propertyAssignments).toHaveLength(1);
    expect(res.body.propertyAssignments[0].property.code).toBe('PH-TORRES-PARQUE');
  });

  it('RF-049: Coordinador listando propiedades solo recibe las propiedades asignadas', async () => {
    const res = await request(app.getHttpServer())
      .get('/properties')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].code).toBe('PH-TORRES-PARQUE');
  });

  it('CP-02: Coordinador intentando consultar detalle de propiedad no asignada recibe 403 Forbidden', async () => {
    const res = await request(app.getHttpServer())
      .get(`/properties/${reservaPlazaId}`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(403);

    expect(res.body.message).toContain('Acceso denegado: no tiene asignación activa');
  });

  it('Coordinador consultando su propiedad asignada recibe 200 OK', async () => {
    const res = await request(app.getHttpServer())
      .get(`/properties/${torresDelParqueId}`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(200);

    expect(res.body.id).toBe(torresDelParqueId);
    expect(res.body.code).toBe('PH-TORRES-PARQUE');
    expect(res.body.zones.length).toBeGreaterThan(0);
  });

  it('Director Operativo listando propiedades recibe todas las propiedades de la organización', async () => {
    const res = await request(app.getHttpServer())
      .get('/properties')
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('Director Operativo consultando cualquier propiedad recibe 200 OK (visión global)', async () => {
    await request(app.getHttpServer())
      .get(`/properties/${reservaPlazaId}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);
  });

  it('Coordinador no puede crear propiedades (403 Forbidden)', async () => {
    await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        name: 'Propiedad No Autorizada',
        code: 'PH-NO-AUTH',
      })
      .expect(403);
  });

  it('Director u Administrador pueden registrar una nueva propiedad horizontal', async () => {
    const testCode = `PH-PRUEBA-${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        name: 'Conjunto Residencial Prueba E2E',
        code: testCode,
        address: 'Diagonal 50 # 20-30',
      })
      .expect(201);

    expect(res.body.code).toBe(testCode);
  });

  it('CP-03: Aislamiento entre ámbitos - Coordinador en área interna asignada vs no asignada', async () => {
    // Coordinador 1 está asignado a Operaciones
    await request(app.getHttpServer())
      .get(`/internal-areas/${operacionesAreaId}`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(200);

    // Coordinador 1 NO está asignado a Sistemas -> 403 Forbidden
    await request(app.getHttpServer())
      .get(`/internal-areas/${sistemasAreaId}`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .expect(403);
  });

  it('RF-002: Administrador puede desactivar y reactivar usuarios sin borrar registros', async () => {
    const targetUserId = '00000000-0000-0000-0000-000000000015'; // Coordinador 2

    // 1. Obtener token válido previo a la desactivación
    const coord2LoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'coordinador2@sigproh.local', password: 'Cambiar123!' })
      .expect(201);
    const coord2Token = coord2LoginRes.body.accessToken;

    // Verificar que el token funciona antes de desactivar
    await request(app.getHttpServer())
      .get('/properties')
      .set('Authorization', `Bearer ${coord2Token}`)
      .expect(200);

    // 2. Administrador desactiva al usuario
    const deactRes = await request(app.getHttpServer())
      .patch(`/users/${targetUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    expect(deactRes.body.isActive).toBe(false);

    // 3. VERIFICACIÓN CLAVE: Solicitud con token YA emitido debe ser rechazada de inmediato con 401
    const blockedRes = await request(app.getHttpServer())
      .get('/properties')
      .set('Authorization', `Bearer ${coord2Token}`)
      .expect(401);

    expect(blockedRes.body.message).toContain('Usuario inactivo');

    // 4. Intentar nuevo login con usuario desactivado también da 401
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'coordinador2@sigproh.local', password: 'Cambiar123!' })
      .expect(401);

    // 5. Reactivar al usuario
    const reactRes = await request(app.getHttpServer())
      .patch(`/users/${targetUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
      .expect(200);

    expect(reactRes.body.isActive).toBe(true);

    // 6. Login reactivado funciona exitosamente
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'coordinador2@sigproh.local', password: 'Cambiar123!' })
      .expect(201);
  });
});
