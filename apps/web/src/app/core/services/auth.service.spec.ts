import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('inicia en estado sin usuario (currentUser === null)', () => {
    expect(service.currentUser()).toBeNull();
  });

  it('debe contener las cuentas de prueba para validación operativa en entorno de desarrollo', () => {
    expect(service.isDev).toBe(true);
    // Una cuenta por rol, las mismas que existen en la base de desarrollo
    expect(service.availableAccounts.map((a) => a.email)).toEqual([
      'director@sigproh.local',
      'coordinador1@sigproh.local',
      'gerencia@sigproh.local',
      'auxiliar@sigproh.local',
      'admin@sigproh.local',
    ]);
  });

  it('debe autenticar contra /auth/login, esperar /auth/me y almacenar el token JWT real', () => {
    service.login('coordinador2@sigproh.local', 'Cambiar123!').subscribe((profile) => {
      expect(profile.email).toBe('coordinador2@sigproh.local');
      expect(localStorage.getItem('sigproh_token')).toBe('jwt-coord2-token');
    });

    const loginReq = httpMock.expectOne((req) => req.url.includes('/auth/login'));
    expect(loginReq.request.method).toBe('POST');
    expect(loginReq.request.body).toEqual({
      email: 'coordinador2@sigproh.local',
      password: 'Cambiar123!',
    });

    loginReq.flush({
      accessToken: 'jwt-coord2-token',
      user: {
        id: '00000000-0000-0000-0000-000000000015',
        email: 'coordinador2@sigproh.local',
        firstName: 'Pedro',
        lastName: 'Coordinador Sur',
        role: 'COORDINADOR_OPERATIVO',
      },
    });

    const meReq = httpMock.expectOne((req) => req.url.includes('/auth/me'));
    expect(meReq.request.headers.get('Authorization')).toBe('Bearer jwt-coord2-token');
    meReq.flush({
      id: '00000000-0000-0000-0000-000000000015',
      email: 'coordinador2@sigproh.local',
      firstName: 'Pedro',
      lastName: 'Coordinador Sur',
      role: 'COORDINADOR_OPERATIVO',
      propertyAssignments: [{ property: { code: 'PH-RESERVA-PLAZA' } }],
    });

    expect(service.currentUser()?.email).toBe('coordinador2@sigproh.local');
    expect(service.isCoordinator()).toBe(true);
    expect(service.isDirector()).toBe(false);
  });

  it('switchAccount limpia de inmediato el usuario anterior antes de consultar el nuevo', () => {
    // Simular que había un usuario previo
    service.currentUser.set({
      id: 'dir-1',
      email: 'director@sigproh.local',
      firstName: 'Carlos',
      lastName: 'Director',
      role: 'DIRECTOR_OPERATIVO',
    });
    localStorage.setItem('sigproh_token', 'old-token');

    // Al iniciar el cambio de cuenta
    const sub = service.switchAccount('coordinador1@sigproh.local', 'Cambiar123!').subscribe();

    // Debe haberse limpiado inmediatamente
    expect(service.currentUser()).toBeNull();
    expect(localStorage.getItem('sigproh_token')).toBeNull();

    const loginReq = httpMock.expectOne((req) => req.url.includes('/auth/login'));
    loginReq.flush({
      accessToken: 'jwt-coord1-token',
      user: { id: 'c1', email: 'coordinador1@sigproh.local', firstName: 'Juan', lastName: 'C1', role: 'COORDINADOR_OPERATIVO' },
    });

    const meReq = httpMock.expectOne((req) => req.url.includes('/auth/me'));
    meReq.flush({
      id: 'c1',
      email: 'coordinador1@sigproh.local',
      firstName: 'Juan',
      lastName: 'C1',
      role: 'COORDINADOR_OPERATIVO',
    });

    expect(service.currentUser()?.email).toBe('coordinador1@sigproh.local');
    sub.unsubscribe();
  });

  it('logout limpia token de localStorage y deja currentUser en null', () => {
    localStorage.setItem('sigproh_token', 'active-token');
    service.currentUser.set({
      id: 'user-1',
      email: 'user@test.local',
      firstName: 'Test',
      lastName: 'User',
      role: 'COORDINADOR_OPERATIVO',
    });

    service.logout();

    expect(localStorage.getItem('sigproh_token')).toBeNull();
    expect(service.currentUser()).toBeNull();
    // Revoca la sesión en el servidor enviando la cookie de refresco
    const logoutReq = httpMock.expectOne((req) => req.url.includes('/auth/logout'));
    expect(logoutReq.request.withCredentials).toBe(true);
    logoutReq.flush(null, { status: 204, statusText: 'No Content' });
  });
});
