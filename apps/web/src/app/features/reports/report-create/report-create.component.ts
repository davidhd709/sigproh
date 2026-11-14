import { ReportFlowStepsComponent } from '../../../shared/report-flow-steps.component';
import { IconComponent } from '../../../shared/icon/icon.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ReportService } from '../../../core/services/report.service';
import { AuthService } from '../../../core/services/auth.service';
import { IssuesService } from '../../../core/services/issues.service';
import {
  CreateReportDraftDto,
  ReportScope,
} from '../../../core/models/report.model';

@Component({
  selector: 'app-report-create',
  standalone: true,
  imports: [ReportFlowStepsComponent, IconComponent, CommonModule, FormsModule, RouterModule],
  templateUrl: './report-create.component.html',
  styleUrls: ['./report-create.component.css'],
})
export class ReportCreateComponent implements OnInit {
  private readonly reportService = inject(ReportService);
  private readonly issuesService = inject(IssuesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  isSubmitting = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  properties = signal<any[]>([]);
  internalAreas = signal<any[]>([]);

  currentUser = this.authService.currentUser;

  // Campos del formulario
  scope: ReportScope = 'PROPIEDAD';
  title = '';
  propertyId = '';
  internalAreaId = '';
  selectedPreset: 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30_DAYS' | 'THIS_YEAR' | 'CUSTOM' = 'THIS_MONTH';
  periodStart = '';
  periodEnd = '';
  cutoffDate = '';
  introduction = '';
  observations = '';

  ngOnInit(): void {
    this.applyPreset('THIS_MONTH');
    this.loadCatalogues();
  }

  loadCatalogues(): void {
    this.issuesService.getProperties().subscribe({
      next: (props) => {
        this.properties.set(props);
        if (props.length > 0 && !this.propertyId) {
          this.propertyId = props[0].id;
          this.updateDefaultTitle();
        }
      },
    });

    this.issuesService.getInternalAreas().subscribe({
      next: (areas) => {
        this.internalAreas.set(areas);
        if (areas.length > 0 && !this.internalAreaId) {
          this.internalAreaId = areas[0].id;
        }
      },
    });
  }

  onScopeChange(): void {
    if (this.scope === 'PROPIEDAD' && this.properties().length > 0 && !this.propertyId) {
      this.propertyId = this.properties()[0].id;
    } else if (this.scope === 'INTERNA' && this.internalAreas().length > 0 && !this.internalAreaId) {
      this.internalAreaId = this.internalAreas()[0].id;
    }
    this.updateDefaultTitle();
  }

  /** true cuando la persona escribió su propio título: desde ahí no se reemplaza. */
  titleEdited = false;
  private lastAutoTitle = '';

  /** Si la persona cambia el título se respeta; si lo borra, vuelve el sugerido. */
  onTitleInput(): void {
    this.titleEdited = this.title.trim() !== '' && this.title !== this.lastAutoTitle;
    if (!this.titleEdited) this.updateDefaultTitle();
  }

  /**
   * Título sugerido según la ubicación y las fechas del período elegido (no el mes actual).
   * Se recalcula al cambiar período o ubicación, salvo que la persona haya escrito el suyo.
   */
  updateDefaultTitle(): void {
    if (this.titleEdited) return;
    const period = ReportCreateComponent.periodLabel(this.periodStart, this.periodEnd);
    const suffix = period ? ` (${period})` : '';

    if (this.scope === 'PROPIEDAD') {
      const prop = this.properties().find((p) => p.id === this.propertyId);
      this.title = `Informe Operativo — ${prop ? prop.name : 'Propiedad'}${suffix}`;
    } else if (this.scope === 'INTERNA') {
      const area = this.internalAreas().find((a) => a.id === this.internalAreaId);
      this.title = `Informe de Gestión — ${area ? area.name : 'Gestión Interna'}${suffix}`;
    } else {
      this.title = `Informe Consolidado Gerencial${period ? ` — ${period}` : ''}`;
    }
    this.lastAutoTitle = this.title;
  }

  private static readonly MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  /**
   * «Octubre 2026», «Octubre – Noviembre 2026», «Diciembre 2025 – Enero 2026» o «2026»
   * si cubre el año completo. Trabaja con las fechas YYYY-MM-DD tal como se ven.
   */
  static periodLabel(start: string, end: string): string {
    const parse = (ymd: string) => {
      const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(ymd ?? '');
      return m ? { year: m[1], month: ReportCreateComponent.MONTHS[Number(m[2]) - 1] } : null;
    };
    const from = parse(start);
    const to = parse(end) ?? from;
    if (!from || !to) return '';
    if (from.year === to.year && start.endsWith('-01-01') && end.endsWith('-12-31')) return from.year;
    if (from.year === to.year && from.month === to.month) return `${from.month} ${from.year}`;
    if (from.year === to.year) return `${from.month} – ${to.month} ${from.year}`;
    return `${from.month} ${from.year} – ${to.month} ${to.year}`;
  }

  applyPreset(preset: 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30_DAYS' | 'THIS_YEAR' | 'CUSTOM'): void {
    this.selectedPreset = preset;
    const now = new Date();

    if (preset === 'THIS_MONTH') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      this.periodStart = `${year}-${month}-01`;
      this.periodEnd = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    } else if (preset === 'LAST_MONTH') {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const year = lastMonthDate.getFullYear();
      const month = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, lastMonthDate.getMonth() + 1, 0).getDate();
      this.periodStart = `${year}-${month}-01`;
      this.periodEnd = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    } else if (preset === 'LAST_30_DAYS') {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      this.periodStart = start.toISOString().split('T')[0];
      this.periodEnd = end.toISOString().split('T')[0];
    } else if (preset === 'THIS_YEAR') {
      const year = now.getFullYear();
      this.periodStart = `${year}-01-01`;
      this.periodEnd = `${year}-12-31`;
    }

    this.cutoffDate = this.periodEnd;
    this.updateDefaultTitle();
  }

  onSubmit(): void {
    this.errorMessage.set(null);

    if (!this.title.trim()) {
      this.errorMessage.set('El título del informe es obligatorio.');
      return;
    }
    if (this.scope === 'PROPIEDAD' && !this.propertyId) {
      this.errorMessage.set('Debe seleccionar la propiedad horizontal a informar.');
      return;
    }
    if (this.scope === 'INTERNA' && !this.internalAreaId) {
      this.errorMessage.set('Debe seleccionar el área interna a informar.');
      return;
    }
    if (!this.periodStart || !this.periodEnd) {
      this.errorMessage.set('Debe especificar las fechas de inicio y fin del periodo.');
      return;
    }

    this.isSubmitting.set(true);

    const dto: CreateReportDraftDto = {
      scope: this.scope,
      title: this.title.trim(),
      propertyId: this.scope === 'PROPIEDAD' ? this.propertyId : undefined,
      internalAreaId: this.scope === 'INTERNA' ? this.internalAreaId : undefined,
      periodStart: this.periodStart,
      periodEnd: this.periodEnd,
      cutoffDate: this.cutoffDate || this.periodEnd,
      introduction: this.introduction.trim() || undefined,
      observations: this.observations.trim() || undefined,
    };

    this.reportService.createDraft(dto).subscribe({
      next: (created) => {
        this.isSubmitting.set(false);
        this.router.navigate(['/reports', created.id]);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(
          err.error?.message || 'Error al generar el borrador de informe.',
        );
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/reports']);
  }
}
