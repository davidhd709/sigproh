import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ReportService } from '../../../core/services/report.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  ReportDetail,
  ReportStatus,
  UpdateReportDraftDto,
} from '../../../core/models/report.model';

@Component({
  selector: 'app-report-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './report-detail.component.html',
  styleUrls: ['./report-detail.component.css'],
})
export class ReportDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reportService = inject(ReportService);
  private readonly authService = inject(AuthService);

  report = signal<ReportDetail | null>(null);
  isLoading = signal<boolean>(true);
  isSaving = signal<boolean>(false);
  isRefreshing = signal<boolean>(false);
  isDownloading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  activeTab: 'PREVIEW' | 'EDIT_TEXTS' | 'EVIDENCES' = 'PREVIEW';
  currentUser = this.authService.currentUser;

  // Textos editables
  editTitle = '';
  editIntroduction = '';
  editObservations = '';
  editRecommendations = '';
  editFinalComments = '';

  // Evidencias seleccionadas
  selectedEvidences = signal<Set<string>>(new Set<string>());

  // Visibilidad de secciones
  showIntroduction = true;
  showKpis = true;
  showIssuesList = true;
  showActivities = true;
  showEvidences = true;
  showPendingIssues = true;
  showObservations = true;
  showRecommendations = true;
  showFinalComments = true;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadReport(id);
    } else {
      this.router.navigate(['/reports']);
    }
  }

  loadReport(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.reportService.getReportById(id).subscribe({
      next: (data) => {
        this.report.set(data);
        this.syncEditableFields(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(
          err.error?.message || 'Error al cargar los detalles del informe.',
        );
        this.isLoading.set(false);
      },
    });
  }

  syncEditableFields(data: ReportDetail): void {
    this.editTitle = data.title;
    this.editIntroduction = data.introduction || '';
    this.editObservations = data.observations || '';
    this.editRecommendations = data.recommendations || '';
    this.editFinalComments = data.finalComments || '';

    this.showIntroduction = data.showIntroduction;
    this.showKpis = data.showKpis;
    this.showIssuesList = data.showIssuesList;
    this.showActivities = data.showActivities;
    this.showEvidences = data.showEvidences;
    this.showPendingIssues = data.showPendingIssues;
    this.showObservations = data.showObservations;
    this.showRecommendations = data.showRecommendations;
    this.showFinalComments = data.showFinalComments;

    this.selectedEvidences.set(new Set(data.selectedAttachmentIds || []));
  }

  setTab(tab: 'PREVIEW' | 'EDIT_TEXTS' | 'EVIDENCES'): void {
    this.activeTab = tab;
  }

  toggleEvidence(attachmentId: string): void {
    const current = new Set(this.selectedEvidences());
    if (current.has(attachmentId)) {
      current.delete(attachmentId);
    } else {
      current.add(attachmentId);
    }
    this.selectedEvidences.set(current);
  }

  isEvidenceSelected(attachmentId: string): boolean {
    return this.selectedEvidences().has(attachmentId);
  }

  saveDraft(): void {
    const rep = this.report();
    if (!rep) return;

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const dto: UpdateReportDraftDto = {
      title: this.editTitle.trim(),
      introduction: this.editIntroduction.trim() || undefined,
      observations: this.editObservations.trim() || undefined,
      recommendations: this.editRecommendations.trim() || undefined,
      finalComments: this.editFinalComments.trim() || undefined,
      selectedAttachmentIds: Array.from(this.selectedEvidences()),
      showIntroduction: this.showIntroduction,
      showKpis: this.showKpis,
      showIssuesList: this.showIssuesList,
      showActivities: this.showActivities,
      showEvidences: this.showEvidences,
      showPendingIssues: this.showPendingIssues,
      showObservations: this.showObservations,
      showRecommendations: this.showRecommendations,
      showFinalComments: this.showFinalComments,
    };

    this.reportService.updateDraft(rep.id, dto).subscribe({
      next: (updated) => {
        this.report.set(updated);
        this.syncEditableFields(updated);
        this.isSaving.set(false);
        this.successMessage.set('Borrador guardado exitosamente.');
        setTimeout(() => this.successMessage.set(null), 4000);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.errorMessage.set(
          err.error?.message || 'Error al guardar los cambios en el borrador.',
        );
      },
    });
  }

  refreshData(): void {
    const rep = this.report();
    if (!rep) return;

    if (
      !confirm(
        '¿Desea actualizar los datos operacionales de origen (novedades, actividades e indicadores)? Sus textos redactados se mantendrán intactos.',
      )
    ) {
      return;
    }

    this.isRefreshing.set(true);
    this.errorMessage.set(null);

    this.reportService.refreshSourceData(rep.id).subscribe({
      next: (refreshed) => {
        this.report.set(refreshed);
        this.syncEditableFields(refreshed);
        this.isRefreshing.set(false);
        this.successMessage.set(
          'Datos operativos actualizados exitosamente desde los registros fuente.',
        );
        setTimeout(() => this.successMessage.set(null), 4000);
      },
      error: (err) => {
        this.isRefreshing.set(false);
        this.errorMessage.set(
          err.error?.message || 'Error al actualizar los datos operativos.',
        );
      },
    });
  }

  downloadPdf(): void {
    const rep = this.report();
    if (!rep) return;

    this.isDownloading.set(true);
    this.reportService.downloadPdf(rep.id).subscribe({
      next: (blob) => {
        try {
          if (typeof window !== 'undefined' && window.URL?.createObjectURL) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `informe-${rep.code}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          }
        } catch {
          // Fallback para entornos de prueba
        }
        this.isDownloading.set(false);
      },
      error: (err) => {
        this.isDownloading.set(false);
        this.errorMessage.set(
          err.error?.message || 'Error al generar el archivo PDF.',
        );
      },
    });
  }

  downloadExcel(): void {
    const rep = this.report();
    if (!rep) return;

    this.isDownloading.set(true);
    this.reportService.downloadExcel(rep.id).subscribe({
      next: (blob) => {
        try {
          if (typeof window !== 'undefined' && window.URL?.createObjectURL) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `informe-${rep.code}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          }
        } catch {
          // Fallback para entornos de prueba
        }
        this.isDownloading.set(false);
      },
      error: (err) => {
        this.isDownloading.set(false);
        this.errorMessage.set(
          err.error?.message || 'Error al generar el archivo Excel.',
        );
      },
    });
  }

  getStatusBadgeClass(status: ReportStatus): string {
    switch (status) {
      case 'BORRADOR':
        return 'badge-draft';
      case 'EN_REVISION':
        return 'badge-review';
      case 'DEVUELTO':
        return 'badge-returned';
      case 'APROBADO':
        return 'badge-approved';
      default:
        return '';
    }
  }

  canEdit(): boolean {
    const rep = this.report();
    if (!rep) return false;
    return rep.status === 'BORRADOR' || rep.status === 'DEVUELTO';
  }
}
