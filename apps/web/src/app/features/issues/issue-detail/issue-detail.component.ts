import { IconComponent } from '../../../shared/icon/icon.component';
import { Component, DestroyRef, inject, signal, Input, effect, computed } from '@angular/core';
import { IconName } from '../../../shared/icon/icon.component';
import {
  eventLabel,
  initialsOf,
  priorityLabel,
  priorityTone,
  roleLabel,
  stageLabel,
  stageTone,
  statusLabel,
  statusTone,
  timeAgo,
} from '../../../shared/presentation';
import {
  ACCEPT_ANY,
  ACCEPT_IMAGES,
  ALLOWED_FORMATS_LABEL,
  FILE_POLICY,
  MAX_SIZE_LABEL,
  fileRejection,
} from '../../../shared/file-policy';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { attentionState, fullName, humanDate, openActivities } from '../../../shared/issue-attention';
import { IssueDraftService } from '../../../core/services/issue-draft.service';
import { listReturnUrl } from '../issues-list/list-return';
import { FormsModule } from '@angular/forms';
import { IssuesService, CandidateUser } from '../../../core/services/issues.service';
import { AuthService } from '../../../core/services/auth.service';
import { Observable, of, switchMap } from 'rxjs';
import { EvidenceStage, Issue, IssueActivity, IssueAttachment, IssuePriority } from '../../../core/models/issue.model';

type DetailAction =
  | 'progress'
  | 'confirm-suggested'
  | 'start'
  | 'close'
  | 'confirm-responsible'
  | 'reopen'
  | 'urgent-measure'
  | 'reassign'
  | 'change-priority'
  | 'attach'
  | 'discard';

interface ActionItem {
  key: DetailAction;
  label: string;
  icon: IconName;
  tone?: 'success' | 'danger' | 'warning';
  hint?: string;
  /** Se muestra como botón visible, no dentro de «Más opciones». */
  prominent?: boolean;
}

/** Etapas visibles del flujo; cada estado del backend se ubica en una de ellas. */
const FLOW_STEPS: { label: string; statuses: string[] }[] = [
  // REGISTRADA y EN_REVISION: sin responsable (el ámbito no tiene coordinador ni director)
  { label: 'Pendiente', statuses: ['ASIGNADA', 'REGISTRADA', 'EN_REVISION'] },
  // PENDIENTE_CIERRE ya no se usa; se ubica en proceso por compatibilidad
  { label: 'En proceso', statuses: ['EN_ATENCION', 'PENDIENTE_CIERRE'] },
  { label: 'Finalizada', statuses: ['CERRADA'] },
];

@Component({
  selector: 'app-issue-detail',
  standalone: true,
  imports: [IconComponent, CommonModule, RouterModule, FormsModule],
  templateUrl: './issue-detail.component.html',
  styleUrls: ['./issue-detail.component.css'],
})
export class IssueDetailComponent {
  private readonly issuesService = inject(IssuesService);
  private readonly route = inject(ActivatedRoute);
  readonly authService = inject(AuthService);

  @Input() id?: string;

  // Presentación
  readonly acceptFiles = ACCEPT_ANY;
  readonly acceptImages = ACCEPT_IMAGES;
  readonly formatsLabel = ALLOWED_FORMATS_LABEL;
  readonly maxSizeLabel = MAX_SIZE_LABEL;
  readonly statusLabel = statusLabel;
  readonly statusTone = statusTone;
  readonly priorityLabel = priorityLabel;
  readonly priorityTone = priorityTone;
  readonly stageLabel = stageLabel;
  readonly stageTone = stageTone;
  readonly eventLabel = eventLabel;
  readonly roleLabel = roleLabel;
  readonly timeAgo = timeAgo;
  readonly initials = initialsOf;

  // ---------- Galería de fotos ----------
  private readonly destroyRef = inject(DestroyRef);
  /** URLs locales (blob) de las fotos ya descargadas, por id de adjunto. */
  readonly photoUrls = signal<Record<string, string>>({});
  private readonly requestedPhotos = new Set<string>();
  readonly lightbox = signal<IssueAttachment | null>(null);
  readonly photoAttachments = computed(() =>
    (this.issue()?.attachments ?? []).filter((a) => a.mimeType.startsWith('image/')),
  );
  readonly documentAttachments = computed(() =>
    (this.issue()?.attachments ?? []).filter((a) => !a.mimeType.startsWith('image/')),
  );

  // ---------- Progreso del flujo ----------
  readonly flowSteps = FLOW_STEPS.map((s) => s.label);
  readonly isDiscarded = computed(() => this.issue()?.status === 'DESCARTADA');
  readonly currentStep = computed(() => {
    const status = this.issue()?.status ?? '';
    const idx = FLOW_STEPS.findIndex((s) => s.statuses.includes(status));
    return idx === -1 ? 0 : idx;
  });

  // ---------- Situación de atención (la misma que en la bandeja y el diálogo) ----------
  readonly fullName = fullName;
  readonly humanDate = humanDate;
  readonly attention = computed(() => {
    const current = this.issue();
    return current ? attentionState(current, this.authService.currentUser()?.id) : null;
  });
  /** Actividades abiertas por orden de atención: la primera se destaca arriba. */
  readonly openActs = computed(() => openActivities(this.issue()?.activities));
  readonly mainActivity = computed<IssueActivity | null>(() => this.openActs()[0] ?? null);
  readonly activitiesByRecency = computed(() =>
    [...(this.issue()?.activities ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
  );
  /** Volver a la bandeja tal como se dejó (filtros, búsqueda y orden). */
  readonly backUrl = listReturnUrl();

  /** Datos del cierre: solución, fecha, quién cerró y fotos finales disponibles. */
  readonly closure = computed(() => {
    const current = this.issue();
    if (!current || current.status !== 'CERRADA') return null;
    const event = [...(current.events ?? [])].reverse().find((e) => e.eventType === 'CIERRE_DEFINITIVO' || e.eventType === 'CIERRE');
    return {
      closedAt: current.closedAt ?? event?.createdAt ?? current.updatedAt,
      closedBy: event?.user ?? null,
      solution: (event?.details?.observations as string | null | undefined) ?? null,
      photos: this.photoAttachments().filter((a) => a.stage === 'FINAL'),
    };
  });

  // ---------- Acciones: las principales visibles y el resto en "Más opciones" ----------
  readonly showMoreActions = signal(false);
  readonly actions = computed<ActionItem[]>(() => {
    const current = this.issue();
    const user = this.authService.currentUser();
    const state = this.attention();
    if (!current || !user || !state) return [];
    const director = this.authService.isDirector();
    const list: ActionItem[] = [];
    const isCritical = current.priority === 'CRITICA' || current.initialPriority === 'CRITICA';

    const isOpen = current.status !== 'CERRADA' && current.status !== 'DESCARTADA';
    const canAssign = this.authService.canAssignIssues();

    // Primero lo que mueve el flujo, según la situación
    if (canAssign && state.stage === 'UNASSIGNED') {
      list.push({ key: 'confirm-responsible', label: 'Asignar responsable', icon: 'user', prominent: true });
    }
    if (canAssign && state.stage === 'SUGGESTED' && state.suggested) {
      list.push({ key: 'confirm-suggested', label: `Confirmar a ${fullName(state.suggested)}`, icon: 'check', prominent: true });
      list.push({ key: 'reassign', label: 'Elegir otra persona', icon: 'user', prominent: true });
    }
    if (this.canStart()) {
      list.push({ key: 'start', label: 'Iniciar atención', icon: 'zap', hint: 'La novedad pasa a «En proceso»', prominent: true });
    }
    if (this.canRegisterProgress()) {
      list.push({ key: 'progress', label: 'Registrar avance', icon: 'edit', hint: 'Qué se hizo, con foto si quieres', prominent: true });
    }
    if (this.canClose()) {
      list.push({
        key: 'close',
        label: 'Resolver',
        icon: 'check-circle',
        tone: 'success',
        hint: this.hasMissingFinalEvidence() ? 'Con la foto final del trabajo' : 'Cierra la novedad',
        prominent: true,
      });
    }
    if (isCritical && !current.urgentMeasures && isOpen) {
      list.push({ key: 'urgent-measure', label: 'Registrar qué se hizo de inmediato', icon: 'alert-octagon', tone: 'danger' });
    }
    if (this.canReopen()) {
      list.push({ key: 'reopen', label: 'Reabrir', icon: 'refresh' });
    }
    if (isOpen && !this.authService.isAdmin()) {
      list.push({ key: 'attach', label: 'Adjuntar foto o archivo', icon: 'camera' });
    }
    if (isCritical && current.urgentMeasures && isOpen) {
      list.push({ key: 'urgent-measure', label: 'Agregar medida urgente', icon: 'alert-octagon' });
    }
    if (canAssign && isOpen && current.assignedUserId) {
      list.push({ key: 'reassign', label: 'Cambiar responsable', icon: 'user' });
    }
    if (director && isOpen) {
      list.push({ key: 'change-priority', label: 'Cambiar prioridad', icon: 'zap' });
    }
    if (this.canDiscard()) {
      list.push({ key: 'discard', label: 'Descartar', icon: 'ban', tone: 'danger' });
    }
    return list;
  });
  /** Acciones del paso actual, visibles como botones; lo demás queda en «Más opciones». */
  readonly mainActions = computed(() => this.actions().filter((a) => a.prominent));
  readonly primaryAction = computed(() => this.mainActions()[0] ?? null);

  /** Qué sigue y quién lo hace, en una línea, para cualquier perfil (también quien solo reportó). */
  readonly nextStepHint = computed<string | null>(() => {
    const current = this.issue();
    const state = this.attention();
    const user = this.authService.currentUser();
    if (!current || !state || !user) return null;
    const isMine = current.assignedUserId === user.id;
    const responsible = fullName(state.responsible) || 'el responsable';
    const canAssign = this.authService.canAssignIssues();

    switch (state.stage) {
      case 'UNASSIGNED':
        return canAssign ? 'Elige quién la atenderá.' : 'Gerencia o la Dirección deben asignar un responsable.';
      case 'SUGGESTED':
        return canAssign
          ? `Confirma a ${fullName(state.suggested)} o elige otra persona.`
          : 'Gerencia o la Dirección deben confirmar al responsable.';
      case 'CONFIRMED':
        if (this.canStart()) {
          return isMine
            ? 'Cuando empieces el trabajo, toca «Iniciar atención».'
            : `Puedes iniciar la atención en nombre de ${responsible}.`;
        }
        return `Próximo paso: ${responsible} inicia la atención.`;
      case 'IN_PROGRESS':
        if (this.canClose()) {
          return this.hasMissingFinalEvidence()
            ? 'Registra los avances. Para cerrarla necesitas la foto final.'
            : 'Registra los avances y ciérrala cuando termine el trabajo.';
        }
        return `Próximo paso: ${responsible} la cierra cuando termine el trabajo.`;
      case 'FINISHED':
        return null;
      case 'DISCARDED':
        return null;
    }
  });
  readonly moreActions = computed(() => {
    const shown = new Set(this.mainActions());
    return this.actions().filter((a) => !shown.has(a));
  });

  runAction(key: DetailAction): void {
    this.showMoreActions.set(false);
    switch (key) {
      case 'progress':
        return this.openProgressModal();
      case 'confirm-suggested':
        return this.openAssignModal(this.issue()?.suggestedUserId);
      case 'start':
        return this.startWork();
      case 'close':
        return this.openCloseModal();
      case 'confirm-responsible':
      case 'reassign':
        return this.openAssignModal();
      case 'reopen':
        return this.openReopenModal();
      case 'urgent-measure':
        return this.showUrgentMeasureModal.set(true);
      case 'change-priority':
        return this.showPriorityModal.set(true);
      case 'attach':
        return this.openUploadEvidenceModal();
      case 'discard':
        return this.openDiscardModal();
    }
  }

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
    // Descarga las fotos con la sesión del usuario (el almacenamiento es privado)
    effect(() => {
      const current = this.issue();
      if (!current) return;
      for (const att of this.photoAttachments()) {
        if (this.requestedPhotos.has(att.id)) continue;
        this.requestedPhotos.add(att.id);
        this.issuesService.downloadAttachment(current.id, att.id).subscribe({
          next: (blob) => this.photoUrls.update((m) => ({ ...m, [att.id]: URL.createObjectURL(blob) })),
          error: () => this.requestedPhotos.delete(att.id),
        });
      }
    });
    this.destroyRef.onDestroy(() => {
      Object.values(this.photoUrls()).forEach((u) => URL.revokeObjectURL(u));
      this.setFinalPhoto(null);
    });

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

  openAssignModal(preselectUserId?: string | null): void {
    const current = this.issue();
    if (!current) return;
    this.newAssignedUserId = preselectUserId ?? current.assignedUserId ?? '';
    this.reassignmentReason = '';
    this.loadCandidates(current.id);
    this.showAssignModal.set(true);
  }

  /** Texto del botón que confirma el diálogo: dice exactamente qué va a pasar. */
  assignConfirmLabel(): string {
    const stage = this.attention()?.stage;
    if (stage === 'SUGGESTED' && this.newAssignedUserId === this.issue()?.suggestedUserId) return 'Confirmar responsable';
    if (this.issue()?.assignedUserId) return 'Cambiar responsable';
    return 'Asignar responsable';
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
          const name = fullName(this.candidates().find((c) => c.id === this.newAssignedUserId)) || 'La persona elegida';
          this.successMessage.set(
            isReassignment ? `${name} es ahora responsable. Se le avisó.` : `${name} quedó como responsable. Se le avisó.`,
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

  // --- F4: Pestañas y Comentarios ---

  readonly activeTab = signal<'avances' | 'comentarios' | 'evidencias' | 'historial'>('avances');

  selectTab(tab: 'avances' | 'comentarios' | 'evidencias' | 'historial'): void {
    this.activeTab.set(tab);
    if (tab === 'comentarios' && this.candidates().length === 0) {
      const current = this.issue();
      if (current && !this.authService.isAdmin()) {
        this.loadCandidates(current.id);
      }
    }
  }

  // Estado de comentarios
  newCommentContent = '';
  newCommentMentionId = '';

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
        mentions,
      })
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          this.newCommentContent = '';
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

  // --- F4 / RF-021, RF-022: Gestión de Evidencias ---
  readonly showUploadEvidenceModal = signal<boolean>(false);
  selectedFile: File | null = null;
  selectedEvidenceStage: EvidenceStage = 'SOPORTE';

  // --- F5 / RF-012, RF-023 a RF-028: Inicio, finalización y reapertura ---
  readonly showCloseModal = signal<boolean>(false);
  readonly showReopenModal = signal<boolean>(false);
  readonly showDiscardModal = signal<boolean>(false);

  closureObservations = '';
  /** Foto final elegida en el panel de finalizar; se sube justo antes de cerrar. */
  readonly finalPhoto = signal<File | null>(null);
  readonly finalPhotoPreview = signal<string | null>(null);
  readonly finalPhotoError = signal<string | null>(null);
  reopenReason = '';
  discardReason = '';

  /** Iniciar, finalizar y reabrir: Director o coordinador responsable de la novedad. */
  canChangeState(): boolean {
    const current = this.issue();
    const user = this.authService.currentUser();
    if (!current || !user) return false;
    return (
      this.authService.isDirector() ||
      (this.authService.isCoordinator() && current.assignedUserId === user.id)
    );
  }

  canStart(): boolean {
    const current = this.issue();
    return this.canChangeState() && current?.status === 'ASIGNADA' && Boolean(current.assignedUserId);
  }

  canClose(): boolean {
    const status = this.issue()?.status;
    return this.canChangeState() && (status === 'EN_ATENCION' || status === 'PENDIENTE_CIERRE');
  }

  canReopen(): boolean {
    return this.canChangeState() && this.issue()?.status === 'CERRADA';
  }

  canDiscard(): boolean {
    const current = this.issue();
    if (!current || !this.authService.isDirector()) return false;
    return current.status !== 'CERRADA' && current.status !== 'DESCARTADA';
  }

  /** Registrar avance usa las actividades: Director o responsable, con la novedad en proceso. */
  canRegisterProgress(): boolean {
    const current = this.issue();
    const user = this.authService.currentUser();
    if (!current || !user) return false;
    const inProgress = current.status === 'EN_ATENCION' || current.status === 'PENDIENTE_CIERRE';
    return inProgress && (this.authService.isDirector() || current.assignedUserId === user.id);
  }

  // ---------- Registrar avance ----------
  readonly showProgressModal = signal(false);
  readonly progressError = signal<string | null>(null);
  readonly progressPhoto = signal<File | null>(null);
  progressText = '';
  private progressPhotoId = IssueDraftService.newRequestId();

  openProgressModal(): void {
    this.progressText = '';
    this.progressError.set(null);
    this.progressPhoto.set(null);
    this.progressPhotoId = IssueDraftService.newRequestId();
    this.showProgressModal.set(true);
  }

  onProgressPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    const reason = fileRejection(file, FILE_POLICY.imageTypes);
    this.progressError.set(reason);
    this.progressPhoto.set(reason ? null : file);
    this.progressPhotoId = IssueDraftService.newRequestId();
  }

  /**
   * Un avance es una actividad ya realizada: se crea con lo que se hizo, se marca completada
   * y, si hay foto, se adjunta a esa actividad como evidencia de ejecución.
   */
  submitProgress(): void {
    const current = this.issue();
    const text = this.progressText.trim();
    if (!current) return;
    if (!text) {
      this.progressError.set('Cuenta qué se hizo.');
      setTimeout(() => document.getElementById('progressText')?.focus());
      return;
    }
    this.actionLoading.set(true);
    this.progressError.set(null);
    const firstLine = text.split('\n')[0];
    const title = firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
    const photo = this.progressPhoto();
    let savedActivity = false;

    this.issuesService
      .createActivity(current.id, { title, description: text })
      .pipe(
        switchMap((activity) =>
          this.issuesService.updateActivity(current.id, activity.id, { status: 'COMPLETADA', version: activity.version }),
        ),
        switchMap((activity) => {
          savedActivity = true;
          return photo
            ? this.issuesService.uploadAttachment(current.id, photo, 'EJECUCION', activity.id, this.progressPhotoId)
            : of(null);
        }),
      )
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          this.showProgressModal.set(false);
          this.successMessage.set('Avance registrado. Quien reportó puede verlo en el seguimiento.');
          this.activeTab.set('avances');
          this.loadIssue(current.id);
        },
        error: (err) => {
          this.actionLoading.set(false);
          if (savedActivity) {
            // El avance quedó registrado; solo falta la foto, que se puede adjuntar después
            this.showProgressModal.set(false);
            this.errorMessage.set(
              'El avance quedó registrado, pero la foto no se pudo subir. Adjúntala con «Adjuntar foto o archivo».',
            );
          } else {
            const msg = err.error?.message || 'No pudimos guardar el avance. Revisa la conexión e inténtalo de nuevo.';
            this.progressError.set(Array.isArray(msg) ? msg.join(', ') : msg);
          }
          this.loadIssue(current.id);
        },
      });
  }

  hasMissingFinalEvidence(): boolean {
    const current = this.issue();
    if (!current || !current.category?.requiresEvidence) return false;
    const attachments = current.attachments || [];
    return !attachments.some((att) => att.stage === 'FINAL');
  }

  hasFinalEvidence(): boolean {
    return (this.issue()?.attachments || []).some((att) => att.stage === 'FINAL');
  }

  openUploadEvidenceModal(stage: EvidenceStage = 'SOPORTE'): void {
    const current = this.issue();
    if (!current) return;
    this.selectedFile = null;
    this.selectedEvidenceStage = stage;
    this.showUploadEvidenceModal.set(true);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    }
  }

  submitUploadEvidence(): void {
    const current = this.issue();
    if (!current || !this.selectedFile) {
      this.errorMessage.set('Debe seleccionar un archivo válido para adjuntar.');
      return;
    }

    this.actionLoading.set(true);
    this.errorMessage.set(null);

    this.issuesService
      .uploadAttachment(current.id, this.selectedFile, this.selectedEvidenceStage)
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          this.showUploadEvidenceModal.set(false);
          this.selectedFile = null;
          this.successMessage.set('Evidencia adjuntada exitosamente.');
          this.loadIssue(current.id);
        },
        error: (err) => {
          this.actionLoading.set(false);
          const msg = err.error?.message || 'Error al adjuntar evidencia.';
          this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
        },
      });
  }

  downloadEvidence(att: IssueAttachment): void {
    const current = this.issue();
    if (!current) return;

    this.issuesService.downloadAttachment(current.id, att.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = att.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        const msg = err.error?.message || 'Error al descargar archivo.';
        this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
      },
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  startWork(): void {
    const current = this.issue();
    if (!current) return;

    this.actionLoading.set(true);
    this.errorMessage.set(null);

    this.issuesService.startWork(current.id).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.successMessage.set('Atención iniciada. La novedad quedó en proceso.');
        this.loadIssue(current.id);
      },
      error: (err) => {
        this.actionLoading.set(false);
        const msg = err.error?.message || 'Error al iniciar el trabajo.';
        this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
      },
    });
  }

  openCloseModal(): void {
    this.closureObservations = '';
    this.setFinalPhoto(null);
    this.showCloseModal.set(true);
  }

  closeFinalizeModal(): void {
    this.setFinalPhoto(null);
    this.showCloseModal.set(false);
  }

  onFinalPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = ''; // permite volver a elegir la misma foto
    if (!file) return;
    const reason = fileRejection(file, FILE_POLICY.imageTypes);
    if (reason) {
      this.finalPhotoError.set(reason);
      return;
    }
    this.setFinalPhoto(file);
  }

  /** Estable mientras la foto no cambie: reintentar el cierre no la sube dos veces. */
  private finalPhotoId = IssueDraftService.newRequestId();

  setFinalPhoto(file: File | null): void {
    this.finalPhotoId = IssueDraftService.newRequestId();
    const previous = this.finalPhotoPreview();
    if (previous) URL.revokeObjectURL(previous);
    this.finalPhoto.set(file);
    this.finalPhotoPreview.set(file ? URL.createObjectURL(file) : null);
    this.finalPhotoError.set(null);
  }

  /** La foto final es obligatoria si la categoría la exige y aún no se ha subido. */
  finalPhotoRequired(): boolean {
    return this.hasMissingFinalEvidence();
  }

  /** Sube la foto final (si se eligió) y finaliza la novedad en un solo paso para el usuario. */
  submitClose(): void {
    const current = this.issue();
    if (!current) return;

    const photo = this.finalPhoto();
    if (!photo && this.finalPhotoRequired()) {
      this.finalPhotoError.set('Agrega la foto final del trabajo terminado.');
      return;
    }

    this.actionLoading.set(true);
    this.errorMessage.set(null);

    let photoUploaded = false;
    const upload$: Observable<unknown> = photo
      ? this.issuesService.uploadAttachment(current.id, photo, 'FINAL', undefined, this.finalPhotoId)
      : of(null);

    upload$
      .pipe(
        switchMap(() => {
          photoUploaded = Boolean(photo);
          return this.issuesService.closeIssue(current.id, {
            closureObservations: this.closureObservations.trim() || undefined,
          });
        }),
      )
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          this.closeFinalizeModal();
          this.closureObservations = '';
          this.successMessage.set('Novedad cerrada. Se avisó a quien la reportó.');
          this.loadIssue(current.id);
        },
        error: (err) => {
          this.actionLoading.set(false);
          // Si la foto ya subió pero el cierre falló, no se vuelve a subir al reintentar
          if (photoUploaded) {
            this.setFinalPhoto(null);
            this.loadIssue(current.id);
          }
          const msg = err.error?.message || 'Error al finalizar la novedad.';
          this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
        },
      });
  }

  openReopenModal(): void {
    this.reopenReason = '';
    this.showReopenModal.set(true);
  }

  submitReopen(): void {
    const current = this.issue();
    if (!current) return;

    if (!this.reopenReason.trim()) {
      this.errorMessage.set('El motivo de reapertura es obligatorio.');
      return;
    }

    this.actionLoading.set(true);
    this.errorMessage.set(null);

    this.issuesService
      .reopenIssue(current.id, { reason: this.reopenReason.trim() })
      .subscribe({
        next: (updated) => {
          this.actionLoading.set(false);
          this.issue.set(updated);
          this.showReopenModal.set(false);
          this.reopenReason = '';
          this.successMessage.set('Novedad reabierta formalmente con trazabilidad.');
          this.loadIssue(current.id);
        },
        error: (err) => {
          this.actionLoading.set(false);
          const msg = err.error?.message || 'Error al reabrir caso.';
          this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
        },
      });
  }

  openDiscardModal(): void {
    this.discardReason = '';
    this.showDiscardModal.set(true);
  }

  submitDiscard(): void {
    const current = this.issue();
    if (!current) return;

    if (!this.discardReason.trim()) {
      this.errorMessage.set('El motivo de descarte es obligatorio.');
      return;
    }

    this.actionLoading.set(true);
    this.errorMessage.set(null);

    this.issuesService
      .discardIssue(current.id, { reason: this.discardReason.trim() })
      .subscribe({
        next: (updated) => {
          this.actionLoading.set(false);
          this.issue.set(updated);
          this.showDiscardModal.set(false);
          this.discardReason = '';
          this.successMessage.set('Novedad descartada formalmente.');
          this.loadIssue(current.id);
        },
        error: (err) => {
          this.actionLoading.set(false);
          const msg = err.error?.message || 'Error al descartar caso.';
          this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
        },
      });
  }
}

