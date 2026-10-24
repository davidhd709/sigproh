import { Routes } from '@angular/router';
import { IssuesListComponent } from './features/issues/issues-list/issues-list.component';
import { IssueCreateComponent } from './features/issues/issue-create/issue-create.component';
import { IssueDetailComponent } from './features/issues/issue-detail/issue-detail.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { ReportsListComponent } from './features/reports/reports-list/reports-list.component';
import { ReportCreateComponent } from './features/reports/report-create/report-create.component';
import { ReportDetailComponent } from './features/reports/report-detail/report-detail.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'issues',
  },
  {
    path: 'dashboard',
    component: DashboardComponent,
    title: 'SIGPROH — Tablero de Control e Indicadores',
  },
  {
    path: 'reports',
    component: ReportsListComponent,
    title: 'SIGPROH — Informes de Gestión Operativa',
  },
  {
    path: 'reports/new',
    component: ReportCreateComponent,
    title: 'SIGPROH — Nuevo Borrador de Informe',
  },
  {
    path: 'reports/:id',
    component: ReportDetailComponent,
    title: 'SIGPROH — Detalle y Vista Previa de Informe',
  },
  {
    path: 'issues',
    component: IssuesListComponent,
    title: 'SIGPROH — Bandeja de Novedades',
  },
  {
    path: 'issues/new',
    component: IssueCreateComponent,
    title: 'SIGPROH — Registrar Novedad',
  },
  {
    path: 'issues/:id',
    component: IssueDetailComponent,
    title: 'SIGPROH — Detalle de Novedad',
  },
  // Configuración: carga diferida (solo la usan administrador y director).
  // Cada pantalla verifica el rol porque la sesión se restaura de forma asíncrona.
  { path: 'settings', pathMatch: 'full', redirectTo: 'settings/properties' },
  {
    path: 'settings/users',
    loadComponent: () => import('./features/settings/users/settings-users.component').then((m) => m.SettingsUsersComponent),
    title: 'SIGPROH — Usuarios',
  },
  {
    path: 'settings/properties',
    loadComponent: () =>
      import('./features/settings/properties/settings-properties.component').then((m) => m.SettingsPropertiesComponent),
    title: 'SIGPROH — Propiedades',
  },
  {
    path: 'settings/areas',
    loadComponent: () => import('./features/settings/areas/settings-areas.component').then((m) => m.SettingsAreasComponent),
    title: 'SIGPROH — Áreas internas',
  },
  {
    path: 'settings/categories',
    loadComponent: () =>
      import('./features/settings/categories/settings-categories.component').then((m) => m.SettingsCategoriesComponent),
    title: 'SIGPROH — Categorías',
  },
  {
    path: '**',
    redirectTo: 'issues',
  },
];
