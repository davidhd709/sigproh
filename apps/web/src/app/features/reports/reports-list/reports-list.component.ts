import { IconComponent } from '../../../shared/icon/icon.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ReportService } from '../../../core/services/report.service';
import { statusLabel, statusTone } from '../../../shared/presentation';
import { AuthService } from '../../../core/services/auth.service';
import {
  ReportFilter,
  ReportListItem,
  ReportScope,
  ReportStatus,
} from '../../../core/models/report.model';

@Component({
  selector: 'app-reports-list',
  standalone: true,
  imports: [IconComponent, CommonModule, FormsModule, RouterModule],
  templateUrl: './reports-list.component.html',
  styleUrls: ['./reports-list.component.css'],
})
export class ReportsListComponent implements OnInit {
  private readonly reportService = inject(ReportService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  reports = signal<ReportListItem[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  downloadingId = signal<string | null>(null);

  // Filtros
  searchTerm = '';
  selectedScope: '' | ReportScope = '';
  selectedStatus: '' | ReportStatus = '';

  currentUser = this.authService.currentUser;

  readonly statusFilters: { value: '' | ReportStatus; label: string }[] = [
    { value: '', label: 'Todos' },
    { value: 'BORRADOR', label: 'Borradores' },
    { value: 'EN_REVISION', label: 'En revisión' },
    { value: 'DEVUELTO', label: 'Devueltos' },
    { value: 'APROBADO', label: 'Aprobados' },
  ];
  readonly statusLabel = statusLabel;
  readonly statusTone = statusTone;

  ngOnInit(): void {
    this.loadReports();
  }

  loadReports(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const filter: ReportFilter = {};
    if (this.selectedScope) filter.scope = this.selectedScope;
    if (this.selectedStatus) filter.status = this.selectedStatus;
    if (this.searchTerm.trim()) filter.search = this.searchTerm.trim();

    this.reportService.getReports(filter).subscribe({
      next: (data) => {
        this.reports.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(
          err.error?.message || 'Error al cargar los informes operacionales.',
        );
        this.isLoading.set(false);
      },
    });
  }

  onFilterChange(): void {
    this.loadReports();
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.selectedScope = '';
    this.selectedStatus = '';
    this.loadReports();
  }

  openCreate(): void {
    this.router.navigate(['/reports/new']);
  }

  openDetail(id: string): void {
    this.router.navigate(['/reports', id]);
  }

  downloadPdf(event: Event, report: ReportListItem): void {
    event.stopPropagation();
    this.downloadingId.set(report.id);
    this.reportService.downloadPdf(report.id).subscribe({
      next: (blob) => {
        try {
          if (typeof window !== 'undefined' && window.URL?.createObjectURL) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `informe-${report.code}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          }
        } catch {
          // Fallback para entornos de prueba
        }
        this.downloadingId.set(null);
      },
      error: (err) => {
        this.errorMessage.set(
          err.error?.message || 'Error al descargar el PDF del informe.',
        );
        this.downloadingId.set(null);
      },
    });
  }

  downloadExcel(event: Event, report: ReportListItem): void {
    event.stopPropagation();
    this.downloadingId.set(report.id);
    this.reportService.downloadExcel(report.id).subscribe({
      next: (blob) => {
        try {
          if (typeof window !== 'undefined' && window.URL?.createObjectURL) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `informe-${report.code}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          }
        } catch {
          // Fallback para entornos de prueba
        }
        this.downloadingId.set(null);
      },
      error: (err) => {
        this.errorMessage.set(
          err.error?.message || 'Error al descargar la exportación en Excel.',
        );
        this.downloadingId.set(null);
      },
    });
  }

  deleteReport(event: Event, report: ReportListItem): void {
    event.stopPropagation();
    if (!confirm(`¿Está seguro de eliminar el borrador ${report.code}?`)) {
      return;
    }

    this.reportService.deleteDraft(report.id).subscribe({
      next: () => {
        this.successMessage.set(`Borrador ${report.code} eliminado correctamente.`);
        this.loadReports();
        setTimeout(() => this.successMessage.set(null), 4000);
      },
      error: (err) => {
        this.errorMessage.set(
          err.error?.message || 'Error al eliminar el borrador.',
        );
      },
    });
  }

  setStatus(status: '' | ReportStatus): void {
    this.selectedStatus = status;
    this.loadReports();
  }

  scopeLabel(scope: ReportScope): string {
    switch (scope) {
      case 'PROPIEDAD':
        return 'Propiedad horizontal';
      case 'INTERNA':
        return 'Gestión interna';
      case 'CONSOLIDADO':
        return 'Consolidado general';
      default:
        return scope;
    }
  }
}
