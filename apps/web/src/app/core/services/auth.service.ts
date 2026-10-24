import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, switchMap, map, finalize, shareReplay, throwError, timer } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CurrentUserProfile {
  id: string;
  organizationId?: string;
  email: string;
  firstName: string;
  lastName: string;
  role:
    | 'DIRECTOR_OPERATIVO'
    | 'COORDINADOR_OPERATIVO'
    | 'GERENTE'
    | 'AUXILIAR_GERENCIA'
    | 'ADMINISTRADOR';
  isActive?: boolean;
  propertyAssignments?: any[];
  areaAssignments?: any[];
}

export interface LoginResponse {
  accessToken: string;
  user: CurrentUserProfile;
}

export interface AvailableAccount {
  email: string;
  name: string;
  role: CurrentUserProfile['role'];
  label: string;
  password?: string;
}

export function getApiBaseUrl(): string {
  if (environment.production) return '/api';

  if (typeof window !== 'undefined' && window.location && window.location.port === '4200') {
    return '/api';
  }
  return 'http://localhost:3000';
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = getApiBaseUrl();

  /** Indica si las ayudas de desarrollo están habilitadas por entorno */
  readonly isDev = environment.enableDevAccounts;

  /** Estado inicial de la sesión: null (sin usuario autenticado por defecto) */
  readonly currentUser = signal<CurrentUserProfile | null>(null);

  readonly loading = signal<boolean>(false);
  readonly authError = signal<string | null>(null);
  /** true mientras se recupera una sesión guardada al abrir la app (evita mostrar el login un instante). */
  readonly restoring = signal<boolean>(false);
  /** Motivo por el que se cerró la sesión sin que el usuario lo pidiera (se muestra en el login). */
  readonly sessionNotice = signal<string | null>(null);

  /** Renovación en curso, compartida por todas las peticiones que reciban 401 a la vez. */
  private refreshInFlight: Observable<string> | null = null;

  /** Cuentas de prueba para pruebas operativas: provistas exclusivamente por environment en desarrollo */
  readonly availableAccounts: AvailableAccount[] = environment.devAccounts;

  constructor() {
    this.initSession();
  }

  private initSession(): void {
    if (typeof localStorage === 'undefined') return;
    const token = localStorage.getItem('sigproh_token');
    if (token) {
      // Si el token venció, el interceptor lo renueva con la cookie y reintenta /auth/me
      this.restoring.set(true);
      this.fetchMe(token)
        .pipe(finalize(() => this.restoring.set(false)))
        .subscribe({
          error: () => {
            localStorage.removeItem('sigproh_token');
            this.currentUser.set(null);
          },
        });
    }
  }

  /**
   * Pide un token de acceso nuevo usando la cookie httpOnly de refresco (que el backend rota).
   * Si otra pestaña renovó al mismo tiempo (409), reintenta una vez con la cookie ya actualizada.
   */
  refreshAccessToken(): Observable<string> {
    if (!this.refreshInFlight) {
      const request = () =>
        this.http.post<{ accessToken: string }>(`${this.apiUrl}/auth/refresh`, {}, { withCredentials: true });
      this.refreshInFlight = request().pipe(
        catchError((err) => (err.status === 409 ? timer(400).pipe(switchMap(request)) : throwError(() => err))),
        map((res) => {
          localStorage.setItem('sigproh_token', res.accessToken);
          return res.accessToken;
        }),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay(1),
      );
    }
    return this.refreshInFlight;
  }

  /** La sesión ya no se puede renovar: se limpia y el login explica por qué. */
  expireSession(): void {
    // Avisa tanto si la sesión estaba en uso como si se intentaba recuperar al abrir la app
    if (!this.currentUser() && !this.restoring()) return;
    this.clearLocalSession();
    this.sessionNotice.set('Tu sesión expiró. Vuelve a iniciar sesión.');
  }

  /** El propio usuario cambia su contraseña; el backend cierra sus otras sesiones. */
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    const token = localStorage.getItem('sigproh_token');
    return this.http
      .post<{ accessToken: string }>(
        `${this.apiUrl}/auth/change-password`,
        { currentPassword, newPassword },
        { headers: token ? { Authorization: `Bearer ${token}` } : {}, withCredentials: true },
      )
      .pipe(
        map((res) => {
          localStorage.setItem('sigproh_token', res.accessToken);
        }),
      );
  }

  /**
   * Inicio de sesión real con credenciales
   */
  login(email: string, password: string): Observable<CurrentUserProfile> {
    this.loading.set(true);
    this.authError.set(null);
    this.sessionNotice.set(null);

    return this.http
      // withCredentials: el backend entrega la cookie httpOnly de refresco
      .post<LoginResponse>(`${this.apiUrl}/auth/login`, { email, password }, { withCredentials: true })
      .pipe(
        switchMap((res) => {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('sigproh_token', res.accessToken);
          }
          return this.fetchMe(res.accessToken);
        }),
        catchError((err) => {
          this.loading.set(false);
          this.authError.set(err.error?.message || 'Credenciales inválidas o error de conexión');
          throw err;
        }),
      );
  }

  /**
   * Consulta el perfil autenticado actual (/auth/me) y actualiza el signal reactivo
   */
  fetchMe(explicitToken?: string): Observable<CurrentUserProfile> {
    this.loading.set(true);
    const token =
      explicitToken ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('sigproh_token') : null);

    return this.http
      .get<CurrentUserProfile>(`${this.apiUrl}/auth/me`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .pipe(
        tap((profile) => {
          this.currentUser.set(profile);
          this.loading.set(false);
        }),
        catchError((err) => {
          this.loading.set(false);
          throw err;
        }),
      );
  }

  /**
   * Selector rápido exclusivo de desarrollo:
   * Limpia datos previos, realiza autenticación real y espera el perfil confirmado.
   * Utiliza las credenciales configuradas en el entorno de desarrollo.
   */
  switchAccount(email: string, password?: string): Observable<CurrentUserProfile> {
    if (!this.isDev || this.availableAccounts.length === 0) {
      throw new Error('El selector de cuentas de prueba está deshabilitado en entorno de producción');
    }

    const targetAccount = this.availableAccounts.find((a) => a.email === email);
    const pass = password || targetAccount?.password;
    if (!pass) {
      throw new Error(`Contraseña no disponible para la cuenta ${email}`);
    }

    // 1. Limpieza inmediata del usuario anterior para evitar fuga de información entre sesiones
    this.currentUser.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('sigproh_token');
    }

    // 2. Autenticación y confirmación de perfil antes de emitir
    return this.login(email, pass);
  }

  /**
   * Cierra la sesión activa y borra el token almacenado
   */
  logout(): void {
    // Revoca la sesión en el servidor (y borra la cookie); no bloquea la salida si falla
    this.http.post(`${this.apiUrl}/auth/logout`, {}, { withCredentials: true }).subscribe({ error: () => {} });
    this.clearLocalSession();
    this.sessionNotice.set(null);
  }

  private clearLocalSession(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('sigproh_token');
    }
    this.currentUser.set(null);
    this.authError.set(null);
  }

  isDirector(): boolean {
    return this.currentUser()?.role === 'DIRECTOR_OPERATIVO';
  }

  isCoordinator(): boolean {
    return this.currentUser()?.role === 'COORDINADOR_OPERATIVO';
  }

  isAuxiliar(): boolean {
    return this.currentUser()?.role === 'AUXILIAR_GERENCIA';
  }

  isManager(): boolean {
    return this.currentUser()?.role === 'GERENTE';
  }

  isAdmin(): boolean {
    return this.currentUser()?.role === 'ADMINISTRADOR';
  }

  // Compatibilidad hacia atrás
  setUserRole(role: CurrentUserProfile['role']): void {
    if (!this.isDev) return;
    const acc = this.availableAccounts.find((a) => a.role === role);
    if (acc) {
      this.switchAccount(acc.email).subscribe();
    }
  }
}
