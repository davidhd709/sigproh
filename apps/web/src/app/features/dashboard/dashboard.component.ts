import { IconComponent } from '../../shared/icon/icon.component';
import { Component, inject, signal, effect, computed } from '@angular/core';
import { priorityLabel, priorityTone, statusLabel, statusTone } from '../../shared/presentation';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../core/services/dashboard.service';
import { AuthService } from '../../core/services/auth.service';
import { IssuesService } from '../../core/services/issues.service';
import { ReportService } from '../../core/services/report.service';
import { Issue } from '../../core/models/issue.model';
import { INBOX_VIEWS, InboxView, viewsForRole } from '../issues/inbox-views';
import { BOGOTA_OFFSET, PeriodPreset, daysOpenLabel, presetRange } from '../../shared/bogota-time';
import {
  DashboardFilterParams,
  DashboardMetricsResponse,
} from '../../core/models/dashboard.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [IconComponent, CommonModule, RouterModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent {
  private readonly dashboardService = inject(DashboardService);
  private readonly issuesService = inject(IssuesService);
  readonly authService = inject(AuthService);
  private readonly reportService = inject(ReportService);

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

  readonly showFilters = signal<boolean>(false);

  // ---------- Tus pendientes (bandejas por rol, RF-027) ----------
  private readonly inboxIssues = signal<Issue[] | null>(null);
  readonly reportsInReview = signal<number>(0);
  readonly pending = computed(() => {
    const issues = this.inboxIssues();
    const user = this.authService.currentUser();
    if (!issues || !user) return null;
    const now = new Date();
    return viewsForRole(user.role)
      .filter((k): k is Exclude<InboxView, 'ALL'> => k !== 'ALL')
      .map((k) => ({ def: INBOX_VIEWS[k], count: issues.filter((i) => INBOX_VIEWS[k].match(i, user.id, now)).length }))
      .filter((p) => p.count > 0);
  });
  /** «Mis pendientes»: vistas filtradas por la persona. */
  readonly myPending = computed(() => (this.pending() ?? []).filter((p) => p.def.perUser));
  /** «Pendientes del equipo»: conteos generales de lo que la persona puede ver. */
  readonly teamPending = computed(() => (this.pending() ?? []).filter((p) => !p.def.perUser));
  readonly bogotaOffset = BOGOTA_OFFSET;
  readonly daysOpenLabel = daysOpenLabel;
  readonly isDirector = computed(() => this.authService.currentUser()?.role === 'DIRECTOR_OPERATIVO');
  readonly presets = [
    { value: 'THIS_MONTH', label: 'Este mes' },
    { value: 'LAST_MONTH', label: 'Mes anterior' },
    { value: 'LAST_30_DAYS', label: 'Últimos 30 días' },
    { value: 'THIS_YEAR', label: 'Este año' },
    { value: 'CUSTOM', label: 'Personalizado' },
  ] as const;

  // Presentación
  readonly statusLabel = statusLabel;
  readonly statusTone = statusTone;
  readonly priorityLabel = priorityLabel;
  readonly priorityTone = priorityTone;

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
        this.loadPending(user.role);
      }
    });
  }

  /** Pendientes del usuario: independientes del período del tablero. */
  loadPending(role: string): void {
    this.issuesService.getIssues().subscribe({
      next: (list) => this.inboxIssues.set(list),
      error: () => this.inboxIssues.set([]),
    });
    if (role === 'DIRECTOR_OPERATIVO') {
      this.reportService.getReports({ status: 'EN_REVISION' }).subscribe({
        next: (list) => this.reportsInReview.set(list.length),
        error: () => this.reportsInReview.set(0),
      });
    }
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

  /**
   * Fechas visibles del período en hora de Colombia. Los períodos en curso terminan hoy:
   * antes «Este mes» cortaba el último día del mes y la antigüedad salía inflada.
   */
  applyPreset(preset: 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30_DAYS' | 'THIS_YEAR' | 'CUSTOM', now: Date = new Date()): void {
    this.selectedPreset = preset;
    if (preset === 'CUSTOM') return;
    const range = presetRange(preset as PeriodPreset, now);
    this.filterStartDate = range.start;
    this.filterEndDate = range.end;
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

  openCustomPeriod(): void {
    this.selectedPreset = 'CUSTOM';
    this.showFilters.set(true);
  }

  hasScopeFilter(): boolean {
    return !!(this.filterScope || this.filterPropertyId || this.filterInternalAreaId);
  }
}
