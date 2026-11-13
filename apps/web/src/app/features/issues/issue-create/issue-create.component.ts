import { IconComponent } from '../../../shared/icon/icon.component';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, concatMap, from, map, of, catchError, toArray } from 'rxjs';
import { IssuesService } from '../../../core/services/issues.service';
import { IssueDraft, IssueDraftService, IssueDraftStatus } from '../../../core/services/issue-draft.service';
import {
  ACCEPT_ANY,
  ACCEPT_IMAGES,
  ALLOWED_FORMATS_LABEL,
  FILE_POLICY,
  MAX_SIZE_LABEL,
  fileRejection,
  formatBytes,
} from '../../../shared/file-policy';
import { timeAgo } from '../../../shared/presentation';
import { fullName } from '../../../shared/issue-attention';
import { AuthService } from '../../../core/services/auth.service';
import {
  Category,
  CreateIssuePayload,
  EvidenceStage,
  Issue,
  IssuePriority,
  IssueScope,
} from '../../../core/models/issue.model';

/** Campos que se validan; coinciden con el id del control en la plantilla y con el orden visual. */
export type FormField = 'propertyId' | 'internalAreaId' | 'categoryId' | 'title' | 'description';
const FIELD_ORDER: FormField[] = ['propertyId', 'internalAreaId', 'categoryId', 'title', 'description'];

/** Mensajes del servidor que corresponden a un campo concreto (ver CreateIssueDto). */
const SERVER_FIELD_MESSAGES: Record<string, FormField> = {
  'Escribe un título corto': 'title',
  'El título no puede superar 160 caracteres': 'title',
  'Describe qué pasó': 'description',
  'Elige una categoría': 'categoryId',
  'Elige una categoría válida': 'categoryId',
  'La categoría seleccionada no es válida para el ámbito de la novedad': 'categoryId',
  'Elige un conjunto o edificio válido': 'propertyId',
  'Para una novedad de propiedad horizontal, propertyId es obligatorio': 'propertyId',
  'Elige un área de la empresa válida': 'internalAreaId',
  'Para una novedad interna, internalAreaId es obligatorio': 'internalAreaId',
};

/** Archivo elegido en el formulario, pendiente de subir cuando exista la novedad. */
interface PendingFile {
  id: string;
  /** Estable entre reintentos: el servidor no duplica un archivo ya vinculado. */
  clientFileId: string;
  file: File;
  kind: 'PHOTO' | 'QUOTE';
  previewUrl: string | null;
  uploaded: boolean;
}

/**
 * editing: llenando el formulario · sending: esperando al servidor ·
 * unconfirmed: no sabemos si llegó (se ofrece Reintentar) · done: el servidor confirmó el registro.
 */
type Phase = 'editing' | 'sending' | 'unconfirmed' | 'done';

interface Outcome {
  issue: Issue;
  whoHandlesIt: string;
}

export const PRIORITY_OPTIONS: { value: IssuePriority; tone: string; label: string; hint: string; example: string }[] = [
  { value: 'BAJA', tone: 'neutral', label: 'Baja', hint: 'Se puede programar', example: 'Bombillo fundido en un pasillo' },
  { value: 'MEDIA', tone: 'info', label: 'Media', hint: 'En los próximos días', example: 'Puerta que cierra mal' },
  { value: 'ALTA', tone: 'warning', label: 'Alta', hint: 'Afecta el servicio', example: 'Ascensor fuera de servicio' },
  { value: 'CRITICA', tone: 'danger', label: 'Crítica', hint: 'Riesgo para personas o bienes', example: 'Fuga de agua o gas, incendio' },
];

@Component({
  selector: 'app-issue-create',
  standalone: true,
  imports: [IconComponent, CommonModule, RouterModule, FormsModule],
  templateUrl: './issue-create.component.html',
  styleUrls: ['./issue-create.component.css'],
})
export class IssueCreateComponent implements OnInit, OnDestroy {
  private readonly issuesService = inject(IssuesService);
  private readonly drafts = inject(IssueDraftService);
  readonly authService = inject(AuthService);

  // Modelo del formulario
  scope: IssueScope = 'PROPIEDAD';
  title = '';
  description = '';
  priority: IssuePriority = 'MEDIA';
  categoryId = '';
  propertyId = '';
  propertyZoneId = '';
  internalAreaId = '';
  urgentMeasures = '';

  readonly priorityOptions = PRIORITY_OPTIONS;

  // Catálogos
  readonly categories = signal<Category[]>([]);
  readonly properties = signal<any[]>([]);
  readonly internalAreas = signal<any[]>([]);
  private catalogsPending = 2;
  /** Solo se pregunta el tipo de ubicación si la persona tiene de los dos. */
  readonly showScopeChoice = computed(() => this.properties().length > 0 && this.internalAreas().length > 0);

  // Estado del envío
  readonly phase = signal<Phase>('editing');
  readonly loading = computed(() => this.phase() === 'sending');
  readonly errorMessage = signal<string | null>(null);
  readonly outcome = signal<Outcome | null>(null);
  /** Errores por campo, en español, junto a cada control. */
  readonly fieldErrors = signal<Partial<Record<FormField, string>>>({});
  readonly errorCount = computed(() => Object.keys(this.fieldErrors()).length);

  // Borrador
  /** Borrador encontrado al entrar; el formulario espera a que la persona elija qué hacer. */
  readonly draftOffer = signal<IssueDraft | null>(null);
  readonly draftStatus = signal<IssueDraftStatus>('BORRADOR');
  readonly draftSavedAt = signal<string | null>(null);
  /** Archivos del borrador que hay que volver a elegir (el navegador no los conserva). */
  readonly filesToReselect = signal<string[]>([]);
  private clientRequestId = IssueDraftService.newRequestId();
  readonly timeAgo = timeAgo;

  // Fotos y cotizaciones opcionales (se suben después de crear la novedad)
  readonly acceptImages = ACCEPT_IMAGES;
  readonly acceptQuotes = ACCEPT_ANY;
  readonly formatsLabel = ALLOWED_FORMATS_LABEL;
  readonly maxSizeLabel = MAX_SIZE_LABEL;
  readonly formatBytes = formatBytes;
  private fileSeq = 0;
  readonly pendingFiles = signal<PendingFile[]>([]);
  readonly photos = computed(() => this.pendingFiles().filter((f) => f.kind === 'PHOTO'));
  readonly quotes = computed(() => this.pendingFiles().filter((f) => f.kind === 'QUOTE'));
  readonly failedFiles = computed(() => (this.outcome() ? this.pendingFiles().filter((f) => !f.uploaded) : []));
  readonly fileWarning = signal<string[]>([]);
  readonly uploadProgress = signal<{ done: number; total: number } | null>(null);

  ngOnInit(): void {
    const saved = this.drafts.load();
    if (saved && IssueDraftService.hasContent(saved.fields)) {
      this.draftOffer.set(saved);
    }
    this.loadCatalogs();
  }

  loadCatalogs(): void {
    this.loadCategories(this.scope);

    this.issuesService.getProperties().subscribe({
      next: (data) => {
        this.properties.set(data);
        this.catalogLoaded();
      },
      error: () => {
        this.errorMessage.set('No pudimos cargar los conjuntos y edificios. Revisa la conexión y vuelve a abrir el formulario.');
        this.catalogLoaded();
      },
    });

    this.issuesService.getInternalAreas().subscribe({
      next: (data) => {
        this.internalAreas.set(data);
        this.catalogLoaded();
      },
      error: () => {
        this.errorMessage.set('No pudimos cargar las áreas de la empresa. Revisa la conexión y vuelve a abrir el formulario.');
        this.catalogLoaded();
      },
    });
  }

  private loadCategories(scope: IssueScope): void {
    this.issuesService.getCategories(scope).subscribe({
      next: (data) => this.categories.set(data),
      error: () => {
        this.categories.set([]);
        this.errorMessage.set('Error al cargar las categorías. Revisa la conexión y vuelve a intentarlo.');
      },
    });
  }

  private catalogLoaded(): void {
    if (--this.catalogsPending > 0) return;
    this.preselectLocation();
  }

  /** Si la persona solo tiene un lugar posible, se elige por ella. */
  private preselectLocation(): void {
    if (this.draftOffer()) return; // primero decide si continúa el borrador
    const props = this.properties();
    const areas = this.internalAreas();
    if (props.length === 0 && areas.length > 0 && this.scope !== 'INTERNA') {
      this.setScope('INTERNA');
    }
    if (this.scope === 'PROPIEDAD' && props.length === 1 && !this.propertyId) this.propertyId = props[0].id;
    if (this.scope === 'INTERNA' && areas.length === 1 && !this.internalAreaId) this.internalAreaId = areas[0].id;
  }

  // ---------- Errores por campo ----------

  errorFor(field: FormField): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  /** Quita la marca de error cuando la persona corrige el campo. */
  clearFieldError(field: FormField): void {
    if (!this.fieldErrors()[field]) return;
    this.fieldErrors.update(({ [field]: _removed, ...rest }) => rest);
  }

  private showFieldErrors(errors: Partial<Record<FormField, string>>): void {
    this.fieldErrors.set(errors);
    const first = FIELD_ORDER.find((f) => errors[f]);
    if (!first) return;
    // Espera a que se pinte la marca de error antes de llevar el foco al campo
    setTimeout(() => {
      const control = document.getElementById(first);
      control?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      control?.focus({ preventScroll: true });
    });
  }

  validate(): Partial<Record<FormField, string>> {
    const errors: Partial<Record<FormField, string>> = {};
    if (this.scope === 'PROPIEDAD' && !this.propertyId) errors.propertyId = 'Elige el conjunto o edificio.';
    if (this.scope === 'INTERNA' && !this.internalAreaId) errors.internalAreaId = 'Elige el área de la empresa.';
    if (!this.categoryId) errors.categoryId = 'Elige una categoría.';
    if (!this.title.trim()) errors.title = 'Escribe un título corto.';
    if (!this.description.trim()) errors.description = 'Cuenta qué pasó.';
    return errors;
  }

  // ---------- Ubicación ----------

  onScopeChange(newScope: IssueScope): void {
    this.setScope(newScope);
    this.preselectLocation();
    this.onEdit();
  }

  private setScope(newScope: IssueScope, keepSelection = false): void {
    this.scope = newScope;
    this.fieldErrors.set({});
    this.errorMessage.set(null);
    if (!keepSelection) {
      this.categoryId = '';
      this.propertyId = '';
      this.propertyZoneId = '';
      this.internalAreaId = '';
    }
    this.categories.set([]);
    this.loadCategories(newScope);
  }

  onPropertyChange(): void {
    this.propertyZoneId = '';
    this.clearFieldError('propertyId');
  }

  getSelectedPropertyZones(): any[] {
    const prop = this.properties().find((p) => p.id === this.propertyId);
    return prop?.zones || [];
  }

  // ---------- Borrador ----------

  /** Se llama en cada cambio del formulario: lo escrito queda guardado en este dispositivo. */
  onEdit(): void {
    if (this.phase() === 'done' || this.draftOffer()) return;
    const fields = this.currentFields();
    if (!IssueDraftService.hasContent(fields) && this.pendingFiles().length === 0) return;
    this.drafts.save({
      status: this.draftStatus(),
      clientRequestId: this.clientRequestId,
      fields,
      attachments: this.pendingFiles()
        .filter((f) => !f.uploaded)
        .map((f) => ({ name: f.file.name, kind: f.kind })),
    });
    this.draftSavedAt.set(new Date().toISOString());
  }

  private currentFields() {
    return {
      scope: this.scope,
      propertyId: this.propertyId,
      propertyZoneId: this.propertyZoneId,
      internalAreaId: this.internalAreaId,
      categoryId: this.categoryId,
      title: this.title,
      description: this.description,
      priority: this.priority,
      urgentMeasures: this.urgentMeasures,
    };
  }

  continueDraft(): void {
    const draft = this.draftOffer();
    if (!draft) return;
    const f = draft.fields;
    if (f.scope !== this.scope) this.setScope(f.scope, true);
    Object.assign(this, {
      propertyId: f.propertyId,
      propertyZoneId: f.propertyZoneId,
      internalAreaId: f.internalAreaId,
      categoryId: f.categoryId,
      title: f.title,
      description: f.description,
      priority: f.priority,
      urgentMeasures: f.urgentMeasures,
    });
    // Mismo identificador: si el envío anterior sí llegó, el servidor devuelve ese caso
    this.clientRequestId = draft.clientRequestId;
    this.draftStatus.set(draft.status);
    this.draftSavedAt.set(draft.updatedAt);
    this.filesToReselect.set(draft.attachments.map((a) => a.name));
    this.draftOffer.set(null);
    if (draft.status === 'PENDIENTE_ENVIO') {
      this.errorMessage.set(null);
      this.phase.set('unconfirmed');
    }
  }

  discardDraft(): void {
    this.drafts.clear();
    this.draftOffer.set(null);
    this.clientRequestId = IssueDraftService.newRequestId();
    this.draftStatus.set('BORRADOR');
    this.draftSavedAt.set(null);
    this.preselectLocation();
  }

  // ---------- Archivos ----------

  ngOnDestroy(): void {
    this.pendingFiles().forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
  }

  onFilesSelected(event: Event, kind: PendingFile['kind']): void {
    const input = event.target as HTMLInputElement;
    const chosen = Array.from(input.files ?? []);
    input.value = ''; // permite volver a elegir el mismo archivo tras quitarlo
    if (chosen.length === 0) return;

    const allowed = kind === 'PHOTO' ? FILE_POLICY.imageTypes : undefined;
    const rejected: string[] = [];
    const accepted: PendingFile[] = [];
    for (const file of chosen) {
      const reason = fileRejection(file, allowed);
      if (reason) {
        rejected.push(reason);
        continue;
      }
      if (this.pendingFiles().length + accepted.length >= FILE_POLICY.maxAttachmentsPerIssue) {
        rejected.push(`Puedes adjuntar hasta ${FILE_POLICY.maxAttachmentsPerIssue} archivos. Quita alguno para agregar «${file.name}».`);
        break;
      }
      accepted.push({
        id: `f${++this.fileSeq}`,
        clientFileId: IssueDraftService.newRequestId(),
        file,
        kind,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        uploaded: false,
      });
    }

    this.pendingFiles.update((list) => [...list, ...accepted]);
    // Lo que se volvió a elegir deja de estar en la lista de pendientes
    const names = new Set(accepted.map((a) => a.file.name));
    this.filesToReselect.update((list) => list.filter((n) => !names.has(n)));
    this.fileWarning.set(rejected);
    this.onEdit();
  }

  removeFile(id: string): void {
    const target = this.pendingFiles().find((f) => f.id === id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    this.pendingFiles.update((list) => list.filter((f) => f.id !== id));
    this.onEdit();
  }

  /** Sube uno por uno los archivos que falten; devuelve cuántos fallaron. */
  private uploadPending(issueId: string): Observable<number> {
    const files = this.pendingFiles().filter((f) => !f.uploaded);
    if (files.length === 0) return of(0);
    this.uploadProgress.set({ done: 0, total: files.length });
    return from(files).pipe(
      concatMap((pending) => {
        // Fotos = estado al reportar; cotizaciones = soporte documental
        const stage: EvidenceStage = pending.kind === 'PHOTO' ? 'INICIAL' : 'SOPORTE';
        return this.issuesService.uploadAttachment(issueId, pending.file, stage, undefined, pending.clientFileId).pipe(
          map(() => {
            this.pendingFiles.update((list) => list.map((f) => (f.id === pending.id ? { ...f, uploaded: true } : f)));
            return 0;
          }),
          catchError(() => of(1)),
        );
      }),
      map((failed) => {
        this.uploadProgress.update((p) => (p ? { ...p, done: p.done + 1 } : p));
        return failed;
      }),
      toArray(),
      map((results) => results.reduce((a, b) => a + b, 0)),
    );
  }

  // ---------- Envío ----------

  /** Le dice a quien reporta quién se encargará, para que no tenga que adivinar el siguiente paso. */
  private assignmentNote(created: Issue): string {
    if (created.assignedUserId && created.assignedUserId === this.authService.currentUser()?.id) {
      return 'Quedó a tu cargo: el siguiente paso es iniciar la atención.';
    }
    if (created.assignedUser) {
      return `La atiende ${fullName(created.assignedUser)}. Te avisaremos cuando avance.`;
    }
    return 'Aún no tiene responsable: Gerencia o la Dirección lo asignarán.';
  }

  onSubmit(): void {
    // Evita el doble toque mientras se espera al servidor
    if (this.phase() === 'sending' || this.phase() === 'done') return;
    this.errorMessage.set(null);

    // Aislamiento Administrador (RN-001)
    if (this.authService.isAdmin()) {
      this.errorMessage.set(
        'El rol Administrador del Sistema tiene aislamiento operativo y no puede registrar novedades (RN-001).',
      );
      return;
    }

    const errors = this.validate();
    if (Object.keys(errors).length > 0) {
      this.phase.set('editing');
      this.showFieldErrors(errors);
      return;
    }
    this.fieldErrors.set({});

    // Las medidas urgentes son opcionales para no frenar la alerta de un riesgo crítico
    const measures = this.urgentMeasures.trim();
    const payload: CreateIssuePayload = {
      scope: this.scope,
      title: this.title.trim(),
      description: this.description.trim(),
      priority: this.priority,
      categoryId: this.categoryId,
      propertyId: this.scope === 'PROPIEDAD' ? this.propertyId : undefined,
      propertyZoneId: this.scope === 'PROPIEDAD' && this.propertyZoneId ? this.propertyZoneId : undefined,
      internalAreaId: this.scope === 'INTERNA' ? this.internalAreaId : undefined,
      urgentMeasures: this.priority === 'CRITICA' && measures ? measures : undefined,
      clientRequestId: this.clientRequestId,
    };

    // Si la app se cierra a mitad de camino, al volver se verá como «Pendiente de envío»
    this.draftStatus.set('PENDIENTE_ENVIO');
    this.onEdit();
    this.phase.set('sending');

    this.issuesService.createIssue(payload).subscribe({
      next: (created) => {
        // El servidor confirmó: el caso existe y el borrador ya no hace falta
        this.drafts.clear();
        this.outcome.set({ issue: created, whoHandlesIt: this.assignmentNote(created) });
        this.uploadPending(created.id).subscribe(() => {
          this.uploadProgress.set(null);
          this.phase.set('done');
          setTimeout(() => document.getElementById('submit-result')?.focus());
        });
      },
      error: (err: HttpErrorResponse) => this.handleSubmitError(err),
    });
  }

  private handleSubmitError(err: HttpErrorResponse): void {
    // Sin respuesta o error del servidor: no sabemos si se guardó; los datos se conservan
    if (err.status === 0 || err.status === 408 || err.status >= 500) {
      this.phase.set('unconfirmed');
      return;
    }

    this.phase.set('editing');
    this.draftStatus.set('BORRADOR');
    this.onEdit();

    const raw = err.error?.message;
    const messages: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const errors: Partial<Record<FormField, string>> = {};
    const general: string[] = [];
    for (const msg of messages) {
      const field = SERVER_FIELD_MESSAGES[msg];
      if (field && !errors[field]) errors[field] = `${msg}.`;
      else if (!field) general.push(msg);
    }
    if (Object.keys(errors).length > 0) this.showFieldErrors(errors);
    if (general.length > 0 || Object.keys(errors).length === 0) {
      this.errorMessage.set(
        general.join('. ') ||
          (err.status === 403
            ? 'No tienes permiso para reportar en esa ubicación. Elige otra o pide acceso a la Dirección.'
            : 'No pudimos registrar la novedad. Revisa los datos e inténtalo de nuevo.'),
      );
    }
  }

  /** Vuelve a subir solo los archivos que fallaron, al caso ya registrado. */
  retryUploads(): void {
    const result = this.outcome();
    if (!result || this.uploadProgress()) return;
    this.uploadPending(result.issue.id).subscribe(() => this.uploadProgress.set(null));
  }

  backToEditing(): void {
    this.phase.set('editing');
    this.draftStatus.set('BORRADOR');
    this.onEdit();
  }
}
