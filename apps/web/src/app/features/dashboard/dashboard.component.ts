import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../core/services/dashboard.service';
import { AuthService } from '../../core/services/auth.service';
import { IssuesService } from '../../core/services/issues.service';
import {
  DashboardFilterParams,
  DashboardMetricsResponse,
} from '../../core/models/dashboard.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent {
  private readonly dashboardService = inject(DashboardService);
  private readonly issuesService = inject(IssuesService);
  readonly authService = inject(AuthService);

  readonly metrics = signal<DashboardMetricsResponse | null>(null);
  readonly loading = signal<boolean>(true);
  readonly errorMessage = signal<string | null>(null);

  // Filtros interactivos
  selectedPreset: 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30_DAYS' | 'THIS_YEAR' | 'CUSTOM' = 'THIS_MONTH';
  filterStartDate = '';
  filterEndDate = '';
  filterScope: '' | 'PROPIEDAD' | 'INTERNA' = '';
  filterPropertyId = '';
  filterInternalAreaId = '';

  // Catálogos para selectores
  properties = signal<any[]>([]);
  internalAreas = signal<any[]>([]);

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.applyPreset('THIS_MONTH');
        this.loadCatalogues();
        this.loadMetrics();
      }
    });
  }

  loadCatalogues(): void {
    this.issuesService.getProperties().subscribe({
      next: (props) => this.properties.set(props),
      error: () => {},
    });

    this.issuesService.getInternalAreas().subscribe({
      next: (areas) => this.internalAreas.set(areas),
      error: () => {},
    });
  }

  applyPreset(preset: 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30_DAYS' | 'THIS_YEAR' | 'CUSTOM'): void {
    this.selectedPreset = preset;
    const now = new Date();

    if (preset === 'THIS_MONTH') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      this.filterStartDate = `${year}-${month}-01`;
      this.filterEndDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    } else if (preset === 'LAST_MONTH') {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const year = lastMonthDate.getFullYear();
      const month = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, lastMonthDate.getMonth() + 1, 0).getDate();
      this.filterStartDate = `${year}-${month}-01`;
      this.filterEndDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    } else if (preset === 'LAST_30_DAYS') {
      const past = new Date();
      past.setDate(now.getDate() - 30);
      this.filterStartDate = past.toISOString().slice(0, 10);
      this.filterEndDate = now.toISOString().slice(0, 10);
    } else if (preset === 'THIS_YEAR') {
      const year = now.getFullYear();
      this.filterStartDate = `${year}-01-01`;
      this.filterEndDate = `${year}-12-31`;
    }
  }

  onPresetChange(preset: any): void {
    this.applyPreset(preset);
    this.loadMetrics();
  }

  loadMetrics(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    const params: DashboardFilterParams = {};
    if (this.filterStartDate) params.startDate = this.filterStartDate;
    if (this.filterEndDate) params.endDate = this.filterEndDate;
    if (this.filterScope) params.scope = this.filterScope;
    if (this.filterPropertyId) params.propertyId = this.filterPropertyId;
    if (this.filterInternalAreaId) params.internalAreaId = this.filterInternalAreaId;

    this.dashboardService.getMetrics(params).subscribe({
      next: (data) => {
        this.metrics.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.metrics.set(null);
        if (err.status === 403) {
          this.errorMessage.set(
            'Acceso denegado (403): Su rol o ámbito no cuenta con autorización para consultar estos tableros (RF-049).',
          );
        } else {
          this.errorMessage.set(
            err.error?.message || 'Error al cargar los indicadores y métricas del tablero.',
          );
        }
      },
    });
  }

  resetFilters(): void {
    this.filterScope = '';
    this.filterPropertyId = '';
    this.filterInternalAreaId = '';
    this.applyPreset('THIS_MONTH');
    this.loadMetrics();
  }

  getStatusClass(status: string): string {
    return `status-bar-${status.toLowerCase()}`;
  }

  getPriorityClass(priority: string): string {
    return `priority-bar-${priority.toLowerCase()}`;
  }
}
