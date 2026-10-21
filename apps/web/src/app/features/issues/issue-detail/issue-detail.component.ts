import { Component, inject, signal, Input, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IssuesService, CandidateUser } from '../../../core/services/issues.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  ActivityStatus,
  Issue,
  IssueActivity,
  IssueComment,
  IssuePriority,
} from '../../../core/models/issue.model';

@Component({
  selector: 'app-issue-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './issue-detail.component.html',
  styleUrls: ['./issue-detail.component.css'],
})
export class IssueDetailComponent {
  private readonly issuesService = inject(IssuesService);
  private readonly route = inject(ActivatedRoute);
  readonly authService = inject(AuthService);

  @Input() id?: string;

  readonly issue = signal<Issue | null>(null);
  readonly loading = signal<boolean>(true);
  readonly actionLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Modales y formularios de acción
  readonly showAssignModal = signal<boolean>(false);
  readonly showPriorityModal = signal<boolean>(false);
  readonly showUrgentMeasureModal = signal<boolean>(false);

  // Modelos de formularios de acción
  newAssignedUserId = '';
  reassignmentReason = '';

  newPriority: IssuePriority = 'MEDIA';
  priorityChangeReason = '';

  newUrgentMeasure = '';

  // Candidatos disponibles para asignación dinámicos según ámbito (RF-011)
  readonly candidates = signal<CandidateUser[]>([]);
  readonly candidatesLoading = signal<boolean>(false);

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      const issueId = this.id || this.route.snapshot.paramMap.get('id');
      if (user && issueId) {
        // Al detectar usuario y caso, limpiar datos previos y recargar según la nueva identidad
        this.issue.set(null);
        this.candidates.set([]);
        this.loadIssue(issueId);
      } else if (!user) {
        this.issue.set(null);
        this.candidates.set([]);
        this.loading.set(false);
      }
    });
  }

  loadIssue(issueId: string): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.issuesService.getIssueById(issueId).subscribe({
      next: (data) => {
        this.issue.set(data);
        this.newPriority = data.priority;
        this.newAssignedUserId = data.suggestedUserId || data.assignedUserId || '';
        this.loading.set(false);

        // Cargar candidatos autorizados para la novedad para cualquier usuario operativo autorizado (RF-020 / F4)
        if (!this.authService.isAdmin()) {
          this.loadCandidates(issueId);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.issue.set(null);
        if (err.status === 403) {
          this.errorMessage.set(
            'Acceso denegado (403): Su usuario no tiene autorización operativa para consultar esta novedad conforme al aislamiento de ámbitos (RF-011 / RN-003).',
          );
        } else if (err.status === 404) {
          this.errorMessage.set(
            'Novedad no encontrada (404): El registro solicitado no existe o no pertenece a su organización.',
          );
        } else {
          this.errorMessage.set(
            err.error?.message || 'Error de comunicación al consultar el detalle de la novedad.',
          );
        }
      },
    });
  }

  loadCandidates(issueId: string): void {
    this.candidatesLoading.set(true);
    this.issuesService.getCandidates(issueId).subscribe({
      next: (data) => {
        this.candidates.set(data);
        this.candidatesLoading.set(false);
      },
      error: (err) => {
        this.candidatesLoading.set(false);
        console.warn('No se pudieron consultar candidatos autorizados:', err);
      },
    });
  }

  openAssignModal(): void {
    const current = this.issue();
    if (!current) return;
    this.loadCandidates(current.id);
    this.showAssignModal.set(true);
  }

  // Confirmar o Reasignar Responsable Principal (Exclusivo Director Operativo - DEC-04 / RN-006 / RN-039)
  confirmOrReassign(): void {
    const current = this.issue();
    if (!current) return;

    if (!this.newAssignedUserId) {
      this.errorMessage.set('Debe seleccionar un usuario para la asignación.');
      return;
    }

    const isReassignment = Boolean(
      current.assignedUserId && current.assignedUserId !== this.newAssignedUserId,
    );

    if (isReassignment && !this.reassignmentReason.trim()) {
      this.errorMessage.set(
        'La reasignación de responsable exige un motivo obligatorio justificativo.',
      );
      return;
    }

    this.actionLoading.set(true);
    this.errorMessage.set(null);

    this.issuesService
      .assignPrincipal(
        current.id,
        this.newAssignedUserId,
        isReassignment ? this.reassignmentReason.trim() : undefined,
      )
      .subscribe({
        next: (updated) => {
          this.actionLoading.set(false);
          this.issue.set(updated);
          this.showAssignModal.set(false);
          this.reassignmentReason = '';
          this.successMessage.set(
            isReassignment
              ? 'Responsable principal reasignado con éxito.'
              : 'Asignación de responsable confirmada por la Dirección.',
          );
          this.loadIssue(current.id);
        },
        error: (err) => {
          this.actionLoading.set(false);
          const msg =
            err.error?.message ||
            'Error al procesar la asignación. Verifique la autorización del usuario.';
          this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
        },
      });
  }

  // Modificar Prioridad (Exclusivo Director Operativo - DEC-07 / RF-015)
  changePriority(): void {
    const current = this.issue();
    if (!current) return;

    if (!this.priorityChangeReason.trim()) {
      this.errorMessage.set('Debe ingresar el motivo obligatorio para cambiar la prioridad.');
      return;
    }

    this.actionLoading.set(true);
    this.errorMessage.set(null);

    this.issuesService
      .updatePriority(current.id, this.newPriority, this.priorityChangeReason.trim())
      .subscribe({
        next: (updated) => {
          this.actionLoading.set(false);
          this.issue.set(updated);
          this.showPriorityModal.set(false);
          this.priorityChangeReason = '';
          this.successMessage.set('Prioridad actualizada formalmente con trazabilidad.');
          this.loadIssue(current.id);
        },
        error: (err) => {
          this.actionLoading.set(false);
          const msg = err.error?.message || 'Error al modificar prioridad.';
          this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
        },
      });
  }

  // Registrar Medida Urgente Adicional (DEC-06 / RF-013)
  submitUrgentMeasure(): void {
    const current = this.issue();
    if (!current) return;

    if (!this.newUrgentMeasure.trim()) {
      this.errorMessage.set('Debe redactar la medida urgente realizada.');
      return;
    }

    this.actionLoading.set(true);
    this.errorMessage.set(null);

    this.issuesService
      .addUrgentMeasure(current.id, this.newUrgentMeasure.trim())
      .subscribe({
        next: (updated) => {
          this.actionLoading.set(false);
          this.issue.set(updated);
          this.showUrgentMeasureModal.set(false);
          this.newUrgentMeasure = '';
          this.successMessage.set(
            'Medida urgente registrada exitosamente y notificada a la Dirección.',
          );
          this.loadIssue(current.id);
        },
        error: (err) => {
          this.actionLoading.set(false);
          const msg = err.error?.message || 'Error al registrar medida urgente.';
          this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
        },
      });
  }

  // --- F4: Pestañas, Actividades y Comentarios ---

  readonly activeTab = signal<'actividades' | 'comentarios' | 'historial'>('actividades');

  selectTab(tab: 'actividades' | 'comentarios' | 'historial'): void {
    this.activeTab.set(tab);
    if (tab === 'comentarios' && this.candidates().length === 0) {
      const current = this.issue();
      if (current && !this.authService.isAdmin()) {
        this.loadCandidates(current.id);
      }
    }
  }

  // Estado de actividades
  readonly showCreateActivityModal = signal<boolean>(false);
  newActivityTitle = '';
  newActivityDescription = '';
  newActivityAssignedUserId = '';
  newActivityDueDate = '';

  readonly showStatusModal = signal<boolean>(false);
  readonly selectedActivity = signal<IssueActivity | null>(null);
  targetActivityStatus: ActivityStatus = 'EN_CURSO';
  activityStatusReason = '';

  readonly showReassignActivityModal = signal<boolean>(false);
  reassignActivityUserId = '';

  // Estado de comentarios
  newCommentContent = '';
  newCommentActivityId = '';
  newCommentMentionId = '';

  canCreateActivity(): boolean {
    const current = this.issue();
    const user = this.authService.currentUser();
    if (!current || !user) return false;
    return this.authService.isDirector() || current.assignedUserId === user.id;
  }

  canModifyActivity(act: IssueActivity): boolean {
    const current = this.issue();
    const user = this.authService.currentUser();
    if (!current || !user) return false;
    return (
      this.authService.isDirector() ||
      current.assignedUserId === user.id ||
      act.assignedUserId === user.id
    );
  }

  canCancelOrEditDetails(): boolean {
    const current = this.issue();
    const user = this.authService.currentUser();
    if (!current || !user) return false;
    return this.authService.isDirector() || current.assignedUserId === user.id;
  }

  openCreateActivityModal(): void {
    const current = this.issue();
    if (!current) return;
    this.newActivityTitle = '';
    this.newActivityDescription = '';
    this.newActivityAssignedUserId = '';
    this.newActivityDueDate = '';
    this.loadCandidates(current.id);
    this.showCreateActivityModal.set(true);
  }

  submitCreateActivity(): void {
    const current = this.issue();
    if (!current) return;

    if (!this.newActivityTitle.trim() || !this.newActivityDescription.trim()) {
      this.errorMessage.set('El título y la descripción de la actividad son obligatorios.');
      return;
    }

    this.actionLoading.set(true);
    this.errorMessage.set(null);

    this.issuesService
      .createActivity(current.id, {
        title: this.newActivityTitle.trim(),
        description: this.newActivityDescription.trim(),
        assignedUserId: this.newActivityAssignedUserId || undefined,
        dueDate: this.newActivityDueDate || undefined,
      })
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          this.showCreateActivityModal.set(false);
          this.successMessage.set('Actividad creada exitosamente y notificada al responsable si aplica.');
          this.loadIssue(current.id);
        },
        error: (err) => {
          this.actionLoading.set(false);
          const msg = err.error?.message || 'Error al crear la actividad.';
          this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
        },
      });
  }

  openStatusModal(act: IssueActivity): void {
    this.selectedActivity.set(act);
    this.targetActivityStatus = act.status;
    this.activityStatusReason = act.statusReason || '';
    this.showStatusModal.set(true);
  }

  submitUpdateStatus(): void {
    const current = this.issue();
    const act = this.selectedActivity();
    if (!current || !act) return;

    if (
      (this.targetActivityStatus === 'BLOQUEADA' || this.targetActivityStatus === 'CANCELADA') &&
      !this.activityStatusReason.trim()
    ) {
      this.errorMessage.set(
        'El motivo es obligatorio para marcar la actividad como BLOQUEADA o CANCELADA (CP-11 / RN-069 / RN-070).',
      );
      return;
    }

    this.actionLoading.set(true);
    this.errorMessage.set(null);

    this.issuesService
      .updateActivity(current.id, act.id, {
        status: this.targetActivityStatus,
        statusReason: this.activityStatusReason ? this.activityStatusReason.trim() : undefined,
        version: act.version,
      })
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          this.showStatusModal.set(false);
          this.selectedActivity.set(null);
          this.successMessage.set('Estado de la actividad actualizado con trazabilidad.');
          this.loadIssue(current.id);
        },
        error: (err) => {
          this.actionLoading.set(false);
          if (err.status === 409) {
            this.showStatusModal.set(false);
            this.loadIssue(current.id);
            this.errorMessage.set(
              'Conflicto de concurrencia (409): Otro usuario modificó esta actividad mientras usted la consultaba. La vista se ha recargado con los datos más recientes.',
            );
          } else {
            const msg = err.error?.message || 'Error al actualizar el estado de la actividad.';
            this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
          }
        },
      });
  }

  openReassignActivityModal(act: IssueActivity): void {
    const current = this.issue();
    if (!current) return;
    this.selectedActivity.set(act);
    this.reassignActivityUserId = act.assignedUserId || '';
    this.loadCandidates(current.id);
    this.showReassignActivityModal.set(true);
  }

  submitReassignActivity(): void {
    const current = this.issue();
    const act = this.selectedActivity();
    if (!current || !act) return;

    if (!this.reassignActivityUserId) {
      this.errorMessage.set('Debe seleccionar el usuario al que se reasignará la actividad.');
      return;
    }

    this.actionLoading.set(true);
    this.errorMessage.set(null);

    this.issuesService
      .assignActivity(current.id, act.id, {
        assignedUserId: this.reassignActivityUserId,
        version: act.version,
      })
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          this.showReassignActivityModal.set(false);
          this.selectedActivity.set(null);
          this.successMessage.set('Actividad reasignada exitosamente y notificada al nuevo responsable.');
          this.loadIssue(current.id);
        },
        error: (err) => {
          this.actionLoading.set(false);
          if (err.status === 409) {
            this.showReassignActivityModal.set(false);
            this.loadIssue(current.id);
            this.errorMessage.set(
              'Conflicto de concurrencia (409): La actividad fue modificada concurrentemente. Se ha recargado con los datos más recientes.',
            );
          } else {
            const msg = err.error?.message || 'Error al reasignar actividad.';
            this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
          }
        },
      });
  }

  submitComment(): void {
    const current = this.issue();
    if (!current) return;

    if (!this.newCommentContent.trim()) {
      this.errorMessage.set('El contenido del comentario no puede estar vacío.');
      return;
    }

    this.actionLoading.set(true);
    this.errorMessage.set(null);

    const mentions = this.newCommentMentionId ? [this.newCommentMentionId] : undefined;

    this.issuesService
      .createComment(current.id, {
        content: this.newCommentContent.trim(),
        activityId: this.newCommentActivityId || undefined,
        mentions,
      })
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          this.newCommentContent = '';
          this.newCommentActivityId = '';
          this.newCommentMentionId = '';
          this.successMessage.set('Comentario registrado con éxito.');
          this.loadIssue(current.id);
        },
        error: (err) => {
          this.actionLoading.set(false);
          const msg = err.error?.message || 'Error al registrar comentario.';
          this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
        },
      });
  }
}

