import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

/**
 * Módulo de Configuración (RF-002 a RF-005). Crea registros con sufijo único
 * y los deja desactivados al terminar, igual que el resto de pruebas e2e.
 */
describe('Configuración: usuarios, propiedades, áreas y categorías (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let directorToken: string;
  let coordinatorToken: string;
  const suffix = Date.now().toString(36);
  const http = () => request(app.getHttpServer());

  const login = async (email: string, password = 'Cambiar123!') => {
    const res = await http().post('/auth/login').send({ email, password });
    expect(res.status).toBe(201);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    adminToken = await login('admin@sigproh.local');
    directorToken = await login('director@sigproh.local');
    coordinatorToken = await login('coordinador1@sigproh.local');
  });

  afterAll(async () => {
    await app.close();
  });

  it('el administrador crea un usuario, lo edita, le cambia la contraseña y lo desactiva', async () => {
    const email = `e2e.${suffix}@sigproh.local`;
    const created = await http()
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: email.toUpperCase(), firstName: 'Prueba', lastName: 'E2E', role: 'COORDINADOR_OPERATIVO', password: 'ClaveInicial2026' })
      .expect(201);
    expect(created.body.email).toBe(email);
    expect(created.body.passwordHash).toBeUndefined();

    // Puede iniciar sesión con la contraseña inicial
    await login(email, 'ClaveInicial2026');

    await http()
      .patch(`/users/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ lastName: 'Editado' })
      .expect(200);

    await http()
      .post(`/users/${created.body.id}/password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'ClaveNueva2026' })
      .expect(200);
    await login(email, 'ClaveNueva2026');
    await http().post('/auth/login').send({ email, password: 'ClaveInicial2026' }).expect(401);

    await http()
      .patch(`/users/${created.body.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);
  });

  it('rechaza correos duplicados y contraseñas cortas', async () => {
    await http()
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'director@sigproh.local', firstName: 'X', lastName: 'Y', role: 'GERENTE', password: 'ClaveInicial2026' })
      .expect(409);
    await http()
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: `corta.${suffix}@sigproh.local`, firstName: 'X', lastName: 'Y', role: 'GERENTE', password: 'corta' })
      .expect(400);
  });

  it('solo el administrador gestiona usuarios (director y coordinador reciben 403)', async () => {
    const body = { email: `no.${suffix}@sigproh.local`, firstName: 'X', lastName: 'Y', role: 'GERENTE', password: 'ClaveInicial2026' };
    await http().post('/users').set('Authorization', `Bearer ${directorToken}`).send(body).expect(403);
    await http().post('/users').set('Authorization', `Bearer ${coordinatorToken}`).send(body).expect(403);
  });

  it('el director gestiona una propiedad: datos, zona y asignación', async () => {
    const prop = await http()
      .post('/properties')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ name: `Conjunto E2E ${suffix}`, code: `E2E${suffix}`.slice(0, 12) })
      .expect(201);

    await http()
      .patch(`/properties/${prop.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ address: 'Calle 1 # 2-3' })
      .expect(200);

    const zone = await http()
      .post(`/properties/${prop.body.id}/zones`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ name: 'Torre A' })
      .expect(201);
    await http()
      .patch(`/properties/${prop.body.id}/zones/${zone.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ isActive: false })
      .expect(200);

    // Inactivas visibles solo al pedirlas explícitamente
    await http()
      .patch(`/properties/${prop.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ isActive: false })
      .expect(200);
    const active = await http().get('/properties').set('Authorization', `Bearer ${directorToken}`).expect(200);
    expect(active.body.some((p: any) => p.id === prop.body.id)).toBe(false);
    const all = await http().get('/properties?includeInactive=true').set('Authorization', `Bearer ${directorToken}`).expect(200);
    expect(all.body.some((p: any) => p.id === prop.body.id)).toBe(true);
  });

  it('un coordinador no puede editar propiedades ni ver las inactivas', async () => {
    const all = await http().get('/properties?includeInactive=true').set('Authorization', `Bearer ${coordinatorToken}`).expect(200);
    expect(all.body.every((p: any) => p.isActive)).toBe(true);
    await http()
      .patch('/properties/00000000-0000-0000-0000-000000000020')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ name: 'Intento' })
      .expect(403);
  });

  it('categorías: crear, impedir duplicados, cambiar exigencia de evidencia y desactivar', async () => {
    const name = `Categoría E2E ${suffix}`;
    const cat = await http()
      .post('/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ scope: 'PROPIEDAD', name })
      .expect(201);
    expect(cat.body.requiresEvidence).toBe(true);

    await http().post('/categories').set('Authorization', `Bearer ${adminToken}`).send({ scope: 'PROPIEDAD', name }).expect(409);

    await http()
      .patch(`/categories/${cat.body.id}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ requiresEvidence: false, isActive: false })
      .expect(200);

    const manage = await http().get('/categories/manage').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const found = manage.body.find((c: any) => c.id === cat.body.id);
    expect(found).toEqual(expect.objectContaining({ requiresEvidence: false, isActive: false }));

    // La consulta operativa sigue mostrando solo las activas
    const operational = await http().get('/categories').set('Authorization', `Bearer ${coordinatorToken}`).expect(200);
    expect(operational.body.some((c: any) => c.id === cat.body.id)).toBe(false);

    await http().get('/categories/manage').set('Authorization', `Bearer ${coordinatorToken}`).expect(403);
  });
});
