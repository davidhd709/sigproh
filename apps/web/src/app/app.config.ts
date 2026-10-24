import { ApplicationConfig, LOCALE_ID, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { sessionRefreshInterceptor } from './core/interceptors/session-refresh.interceptor';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';

// Fechas, meses y horas en español de Colombia ("22 oct 2026, 1:33 a. m.")
registerLocaleData(localeEsCo);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'es-CO' },
    provideRouter(routes, withComponentInputBinding()),
    // Renueva la sesión al vencer el token de acceso (cookie httpOnly rotativa)
    provideHttpClient(withInterceptors([sessionRefreshInterceptor])),
    // PWA: cachea solo la interfaz; los datos de la API siempre van a la red
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
