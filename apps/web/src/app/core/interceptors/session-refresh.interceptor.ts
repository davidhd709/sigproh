import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Rutas de autenticación que nunca deben disparar una renovación (evita bucles). */
const AUTH_ENDPOINTS = /\/auth\/(login|refresh|logout|change-password)$/;

/**
 * Si una petición con token recibe 401 (token de 15 min vencido), renueva la sesión con la
 * cookie de refresco y la repite una sola vez con el token nuevo. Si no se puede renovar,
 * cierra la sesión local y el login muestra "Tu sesión expiró".
 */
export const sessionRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  // AuthService se resuelve solo al necesitarlo: él mismo hace peticiones desde su constructor
  // (recuperar la sesión) y pedirlo aquí de entrada crearía una dependencia circular.
  const injector = inject(Injector);
  const hadToken = req.headers.has('Authorization');

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !hadToken || AUTH_ENDPOINTS.test(req.url)) {
        return throwError(() => error);
      }
      const auth = injector.get(AuthService);
      return auth.refreshAccessToken().pipe(
        catchError((refreshError) => {
          auth.expireSession();
          return throwError(() => refreshError);
        }),
        switchMap((token) => next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }))),
      );
    }),
  );
};
