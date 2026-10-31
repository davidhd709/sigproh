import { IconComponent } from '../../../shared/icon/icon.component';
import { Component, OnInit, inject, signal } from '@angular/core';
import { priorityLabel, priorityTone, reportStatusLabel, stageLabel, statusLabel, statusTone } from '../../../shared/presentation';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ReportService } from '../../../core/services/report.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  ReportDetail,
  UpdateReportDraftDto,
} from '../../../core/models/report.model';

@Component({
  selector: 'app-report-detail',
  standalone: true,
  imports: [IconComponent, CommonModule, FormsModule, RouterModule],
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
  isSubmittingAction = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  activeTab: 'PREVIEW' | 'EDIT_TEXTS' | 'EVIDENCES' | 'VERSIONS' | 'DISTRIBUTIONS' = 'PREVIEW';
  currentUser = this.authService.currentUser;

  // Presentación
  readonly statusLabel = statusLabel;
  readonly reportStatusLabel = reportStatusLabel;
  readonly statusTone = statusTone;
  readonly priorityLabel = priorityLabel;
  readonly priorityTone = priorityTone;
  readonly stageLabel = stageLabel;

  channelLabel(channel: string): string {
    const labels: Record<string, string> = {
      CORREO_ELECTRONICO: 'Correo electrónico',
      FISICO: 'Entrega física',
      PORTAL: 'Portal web',
      OTRO: 'Otro canal',
    };
    return labels[channel] ?? channel;
  }

  // Textos editables
  editTitle = '';
  editIntroduction = '';
  editObservations = '';
  editRecommendations = '';
  editFinalComments = '';

  // Modales de flujo de gobernanza
  showApprovalModal = signal<boolean>(false);
  showReturnModal = signal<boolean>(false);
  showVersionModal = signal<boolean>(false);
  showDistributionModal = signal<boolean>(false);

  // Campos de modales
  approvalNotes = '';
  returnNotes = '';
  newVersionReason = '';
  distributionRecipient = '';
  distributionChannel = 'CORREO_ELECTRONICO';
  distributionDate = new Date().toISOString().split('T')[0];
  distributionNotes = '';

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

  setTab(tab: 'PREVIEW' | 'EDIT_TEXTS' | 'EVIDENCES' | 'VERSIONS' | 'DISTRIBUTIONS'): void {
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

  /** El autor del informe o el Director Operativo lo gestionan. */
  isAuthorOrDirector(): boolean {
    const rep = this.report();
    if (!rep) return false;
    return this.isDirector() || rep.createdById === this.currentUser()?.id;
  }

  canEdit(): boolean {
    const rep = this.report();
    if (!rep) return false;
    return (rep.status === 'BORRADOR' || rep.status === 'DEVUELTO') && this.isAuthorOrDirector();
  }

  canFinalize(): boolean {
    return this.canEdit();
  }

  isDirector(): boolean {
    return this.currentUser()?.role === 'DIRECTOR_OPERATIVO';
  }

  canReview(): boolean {
    const rep = this.report();
    if (!rep) return false;
    return rep.status === 'EN_REVISION' && this.isDirector();
  }

  isApproved(): boolean {
    return this.report()?.status === 'APROBADO';
  }

  canCreateNewVersion(): boolean {
    return this.isApproved() && this.isAuthorOrDirector();
  }

  canDistribute(): boolean {
    return this.isApproved() && this.isDirector();
  }

  finalize(): void {
    const rep = this.report();
    if (!rep) return;

    if (!confirm('¿Finalizar este informe? Quedará congelado con las fotos seleccionadas y todos podrán verlo.')) {
      return;
    }

    this.isSubmittingAction.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.reportService.finalize(rep.id).subscribe({
      next: (updated) => {
        this.report.set(updated);
        this.syncEditableFields(updated);
        this.isSubmittingAction.set(false);
        this.successMessage.set('Informe finalizado. Ya está disponible para todos.');
        setTimeout(() => this.successMessage.set(null), 4000);
      },
      error: (err) => {
        this.isSubmittingAction.set(false);
        this.errorMessage.set(err.error?.message || 'Error al finalizar el informe.');
      },
    });
  }

  // --- Modal Aprobación ---
  openApproveModal(): void {
    this.approvalNotes = '';
    this.showApprovalModal.set(true);
  }

  closeApproveModal(): void {
    this.showApprovalModal.set(false);
  }

  submitApproval(): void {
    const rep = this.report();
    if (!rep) return;

    this.isSubmittingAction.set(true);
    this.errorMessage.set(null);

    this.reportService.reviewReport(rep.id, {
      decision: 'APROBADO',
      notes: this.approvalNotes.trim(),
    }).subscribe({
      next: (approved) => {
        this.report.set(approved);
        this.syncEditableFields(approved);
        this.isSubmittingAction.set(false);
        this.closeApproveModal();
        this.successMessage.set('Informe aprobado formalmente con firma digital y hash SHA-256 inmutable.');
        setTimeout(() => this.successMessage.set(null), 5000);
      },
      error: (err) => {
        this.isSubmittingAction.set(false);
        this.errorMessage.set(err.error?.message || 'Error al aprobar el informe.');
      },
    });
  }

  // --- Modal Devolución ---
  openReturnModal(): void {
    this.returnNotes = '';
    this.showReturnModal.set(true);
  }

  closeReturnModal(): void {
    this.showReturnModal.set(false);
  }

  submitReturn(): void {
    const rep = this.report();
    if (!rep) return;

    if (!this.returnNotes.trim()) {
      alert('Las observaciones explicativas son obligatorias para devolver un informe (RN-130).');
      return;
    }

    this.isSubmittingAction.set(true);
    this.errorMessage.set(null);

    this.reportService.reviewReport(rep.id, {
      decision: 'DEVUELTO',
      notes: this.returnNotes.trim(),
    }).subscribe({
      next: (returned) => {
        this.report.set(returned);
        this.syncEditableFields(returned);
        this.isSubmittingAction.set(false);
        this.closeReturnModal();
        this.successMessage.set('Informe devuelto al autor con las observaciones registradas.');
        setTimeout(() => this.successMessage.set(null), 4000);
      },
      error: (err) => {
        this.isSubmittingAction.set(false);
        this.errorMessage.set(err.error?.message || 'Error al devolver el informe.');
      },
    });
  }

  // --- Modal Nueva Versión ---
  openNewVersionModal(): void {
    this.newVersionReason = '';
    this.showVersionModal.set(true);
  }

  closeNewVersionModal(): void {
    this.showVersionModal.set(false);
  }

  submitNewVersion(): void {
    const rep = this.report();
    if (!rep) return;

    this.isSubmittingAction.set(true);
    this.errorMessage.set(null);

    this.reportService.createNewVersion(rep.id, {
      reason: this.newVersionReason.trim() || undefined,
    }).subscribe({
      next: (newVersion) => {
        this.report.set(newVersion);
        this.syncEditableFields(newVersion);
        this.isSubmittingAction.set(false);
        this.closeNewVersionModal();
        this.successMessage.set(`Nueva versión v${newVersion.version} creada como borrador editable. La versión anterior se conserva intacta.`);
        setTimeout(() => this.successMessage.set(null), 5000);
      },
      error: (err) => {
        this.isSubmittingAction.set(false);
        this.errorMessage.set(err.error?.message || 'Error al generar nueva versión.');
      },
    });
  }

  // --- Modal Distribución Oficial ---
  openDistributionModal(): void {
    this.distributionRecipient = '';
    this.distributionChannel = 'CORREO_ELECTRONICO';
    this.distributionDate = new Date().toISOString().split('T')[0];
    this.distributionNotes = '';
    this.showDistributionModal.set(true);
  }

  closeDistributionModal(): void {
    this.showDistributionModal.set(false);
  }

  submitDistribution(): void {
    const rep = this.report();
    if (!rep) return;

    if (!this.distributionRecipient.trim()) {
      alert('El destinatario de la distribución es obligatorio.');
      return;
    }

    this.isSubmittingAction.set(true);
    this.errorMessage.set(null);

    this.reportService.distributeReport(rep.id, {
      recipient: this.distributionRecipient.trim(),
      channel: this.distributionChannel,
      deliveryDate: this.distributionDate,
      notes: this.distributionNotes.trim() || undefined,
    }).subscribe({
      next: () => {
        // Recargar informe para refrescar distribuciones
        this.reportService.getReportById(rep.id).subscribe((updated) => {
          this.report.set(updated);
        });
        this.isSubmittingAction.set(false);
        this.closeDistributionModal();
        this.successMessage.set('Distribución oficial registrada exitosamente en la bitácora auditada.');
        setTimeout(() => this.successMessage.set(null), 4000);
      },
      error: (err) => {
        this.isSubmittingAction.set(false);
        this.errorMessage.set(err.error?.message || 'Error al registrar distribución.');
      },
    });
  }
}

