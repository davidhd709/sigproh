import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { sessionRefreshInterceptor } from './session-refresh.interceptor';
import { AuthService } from '../services/auth.service';

describe('sessionRefreshInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;
  const authHeader = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([sessionRefreshInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    auth.currentUser.set({ id: 'u1', email: 'a@x', firstName: 'A', lastName: 'B', role: 'GERENTE' });
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('ante un 401 renueva la sesión y repite la petición con el token nuevo', () => {
    let result: unknown;
    http.get('/api/issues', authHeader('viejo')).subscribe((r) => (result = r));

    httpMock.expectOne('/api/issues').flush(null, { status: 401, statusText: 'Unauthorized' });
    const refresh = httpMock.expectOne((r) => r.url.endsWith('/auth/refresh'));
    expect(refresh.request.withCredentials).toBe(true);
    refresh.flush({ accessToken: 'nuevo' });

    const retry = httpMock.expectOne('/api/issues');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer nuevo');
    retry.flush([{ id: 1 }]);

    expect(result).toEqual([{ id: 1 }]);
    expect(localStorage.getItem('sigproh_token')).toBe('nuevo');
  });

  it('varias peticiones con 401 a la vez comparten una sola renovación', () => {
    http.get('/api/a', authHeader('viejo')).subscribe();
    http.get('/api/b', authHeader('viejo')).subscribe();

    httpMock.expectOne('/api/a').flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne('/api/b').flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne((r) => r.url.endsWith('/auth/refresh')).flush({ accessToken: 'nuevo' });

    httpMock.expectOne('/api/a').flush({});
    httpMock.expectOne('/api/b').flush({});
  });

  it('si la sesión no se puede renovar, la cierra y avisa en el login', () => {
    let failed = false;
    http.get('/api/issues', authHeader('viejo')).subscribe({ error: () => (failed = true) });

    httpMock.expectOne('/api/issues').flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne((r) => r.url.endsWith('/auth/refresh')).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBe(true);
    expect(auth.currentUser()).toBeNull();
    expect(auth.sessionNotice()).toContain('expiró');
  });

  it('no intenta renovar cuando falla el propio login', () => {
    http.post('/api/auth/login', {}, authHeader('x')).subscribe({ error: () => {} });
    httpMock.expectOne('/api/auth/login').flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectNone((r) => r.url.endsWith('/auth/refresh'));
  });

  it('al abrir la app con un token guardado y vencido, recupera la sesión sin dependencia circular', () => {
    // Escenario real: AuthService se crea por primera vez con un token en localStorage
    localStorage.setItem('sigproh_token', 'vencido');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([sessionRefreshInterceptor])), provideHttpClientTesting()],
    });
    const mock = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(AuthService);
    expect(service.restoring()).toBe(true);

    mock.expectOne((r) => r.url.endsWith('/auth/me')).flush(null, { status: 401, statusText: 'Unauthorized' });
    mock.expectOne((r) => r.url.endsWith('/auth/refresh')).flush({ accessToken: 'nuevo' });
    const retry = mock.expectOne((r) => r.url.endsWith('/auth/me'));
    expect(retry.request.headers.get('Authorization')).toBe('Bearer nuevo');
    retry.flush({ id: 'u1', email: 'a@x', firstName: 'A', lastName: 'B', role: 'GERENTE' });

    expect(service.currentUser()?.id).toBe('u1');
    expect(service.restoring()).toBe(false);
    mock.verify();
  });

  it('al abrir la app con una sesión que ya no se puede renovar, muestra el aviso en el login', () => {
    localStorage.setItem('sigproh_token', 'vencido');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([sessionRefreshInterceptor])), provideHttpClientTesting()],
    });
    const mock = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(AuthService);

    mock.expectOne((r) => r.url.endsWith('/auth/me')).flush(null, { status: 401, statusText: 'Unauthorized' });
    mock.expectOne((r) => r.url.endsWith('/auth/refresh')).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(service.currentUser()).toBeNull();
    expect(service.restoring()).toBe(false);
    expect(service.sessionNotice()).toContain('expiró');
    expect(localStorage.getItem('sigproh_token')).toBeNull();
    mock.verify();
  });
});
