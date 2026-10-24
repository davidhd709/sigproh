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
  imports: [IconComponent, CommonModule, FormsModule, RouterModule],
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

  updateDefaultTitle(): void {
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    const now = new Date();
    const monthName = monthNames[now.getMonth()];
    const year = now.getFullYear();

    if (this.scope === 'PROPIEDAD') {
      const prop = this.properties().find((p) => p.id === this.propertyId);
      const name = prop ? prop.name : 'Propiedad';
      this.title = `Informe Operativo — ${name} (${monthName} ${year})`;
    } else if (this.scope === 'INTERNA') {
      const area = this.internalAreas().find((a) => a.id === this.internalAreaId);
      const name = area ? area.name : 'Gestión Interna';
      this.title = `Informe de Gestión — ${name} (${monthName} ${year})`;
    } else {
      this.title = `Informe Consolidado Gerencial — ${monthName} ${year}`;
    }
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
