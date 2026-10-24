import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

/** Renovación de sesión con cookie httpOnly rotativa y cambio de contraseña propio. */
describe('Sesión renovable y cambio de contraseña (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  const email = `sesion.${Date.now().toString(36)}@sigproh.local`;
  const http = () => request(app.getHttpServer());

  /** Extrae "sigproh_rt=…" de la cabecera Set-Cookie. */
  const refreshCookie = (res: request.Response): string => {
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const found = cookies.find((c) => c.startsWith('sigproh_rt='));
    expect(found).toBeDefined();
    expect(found).toContain('HttpOnly');
    expect(found).toContain('SameSite=Strict');
    return found!.split(';')[0];
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const admin = await http().post('/auth/login').send({ email: 'admin@sigproh.local', password: 'Cambiar123!' });
    adminToken = admin.body.accessToken;
    await http()
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, firstName: 'Sesión', lastName: 'E2E', role: 'GERENTE', password: 'ClaveInicial2026' })
      .expect(201);
  });

  afterAll(async () => {
    const users = await http().get('/users').set('Authorization', `Bearer ${adminToken}`);
    const created = users.body.find((u: any) => u.email === email);
    if (created) {
      await http().patch(`/users/${created.id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ isActive: false });
    }
    await app.close();
  });

  it('login entrega la cookie de refresco y /auth/refresh la rota', async () => {
    const login = await http().post('/auth/login').send({ email, password: 'ClaveInicial2026' }).expect(201);
    const first = refreshCookie(login);

    const refreshed = await http().post('/auth/refresh').set('Cookie', first).expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    const second = refreshCookie(refreshed);
    expect(second).not.toBe(first);

    // El token nuevo sirve para la API
    await http().get('/auth/me').set('Authorization', `Bearer ${refreshed.body.accessToken}`).expect(200);
    // El anterior, recién rotado, responde 409 (pestaña concurrente) sin invalidar el nuevo
    await http().post('/auth/refresh').set('Cookie', first).expect(409);
    await http().post('/auth/refresh').set('Cookie', second).expect(200);
  });

  it('sin cookie o con una inventada responde 401', async () => {
    await http().post('/auth/refresh').expect(401);
    await http().post('/auth/refresh').set('Cookie', 'sigproh_rt=inventada').expect(401);
  });

  it('cerrar sesión invalida la cookie', async () => {
    const login = await http().post('/auth/login').send({ email, password: 'ClaveInicial2026' }).expect(201);
    const cookie = refreshCookie(login);
    await http().post('/auth/logout').set('Cookie', cookie).expect(204);
    // Pasado el margen de concurrencia también se rechazaría; aquí basta con que ya no renueve
    const after = await http().post('/auth/refresh').set('Cookie', cookie);
    expect([401, 409]).toContain(after.status);
  });

  it('el usuario cambia su contraseña: valida la actual y cierra las demás sesiones', async () => {
    const otherDevice = refreshCookie(await http().post('/auth/login').send({ email, password: 'ClaveInicial2026' }).expect(201));
    const login = await http().post('/auth/login').send({ email, password: 'ClaveInicial2026' }).expect(201);

    await http()
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: 'equivocada', newPassword: 'ClaveNueva2026' })
      .expect(400);

    const changed = await http()
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: 'ClaveInicial2026', newPassword: 'ClaveNueva2026' })
      .expect(200);
    refreshCookie(changed);

    await http().post('/auth/login').send({ email, password: 'ClaveInicial2026' }).expect(401);
    await http().post('/auth/login').send({ email, password: 'ClaveNueva2026' }).expect(201);
    // La sesión del otro dispositivo quedó cerrada
    const other = await http().post('/auth/refresh').set('Cookie', otherDevice);
    expect([401, 409]).toContain(other.status);
  });
});
