import { Routes } from '@angular/router';
import { IssuesListComponent } from './features/issues/issues-list/issues-list.component';
import { IssueCreateComponent } from './features/issues/issue-create/issue-create.component';
import { IssueDetailComponent } from './features/issues/issue-detail/issue-detail.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';

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
  {
    path: '**',
    redirectTo: 'issues',
  },
];
