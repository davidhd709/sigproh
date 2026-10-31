import { IconComponent } from '../../../shared/icon/icon.component';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { concatMap, from, map, of, catchError, toArray } from 'rxjs';
import { IssuesService } from '../../../core/services/issues.service';
import {
  ACCEPT_ANY,
  ACCEPT_IMAGES,
  ALLOWED_FORMATS_LABEL,
  FILE_POLICY,
  MAX_SIZE_LABEL,
  fileRejection,
  formatBytes,
} from '../../../shared/file-policy';
import { AuthService } from '../../../core/services/auth.service';
import {
  Category,
  CreateIssuePayload,
  EvidenceStage,
  Issue,
  IssuePriority,
  IssueScope,
} from '../../../core/models/issue.model';

/** Archivo elegido en el formulario, pendiente de subir cuando exista la novedad. */
interface PendingFile {
  id: string;
  file: File;
  kind: 'PHOTO' | 'QUOTE';
  previewUrl: string | null;
}

@Component({
  selector: 'app-issue-create',
  standalone: true,
  imports: [IconComponent, CommonModule, RouterModule, FormsModule],
  templateUrl: './issue-create.component.html',
  styleUrls: ['./issue-create.component.css'],
})
export class IssueCreateComponent implements OnInit, OnDestroy {
  private readonly issuesService = inject(IssuesService);
  private readonly router = inject(Router);
  readonly authService = inject(AuthService);

  // Form Model
  scope: IssueScope = 'PROPIEDAD';
  title = '';
  description = '';
  priority: IssuePriority = 'MEDIA';
  categoryId = '';
  propertyId = '';
  propertyZoneId = '';
  internalAreaId = '';
  urgentMeasures = '';

  // Catalog data
  readonly categories = signal<Category[]>([]);
  readonly properties = signal<any[]>([]);
  readonly internalAreas = signal<any[]>([]);
  readonly loading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

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
  readonly fileWarning = signal<string | null>(null);
  readonly uploadProgress = signal<{ done: number; total: number } | null>(null);

  ngOnInit(): void {
    this.loadCatalogs();
  }

  loadCatalogs(): void {
    this.issuesService.getCategories(this.scope).subscribe({
      next: (data) => this.categories.set(data),
      error: (err) => {
        this.categories.set([]);
        this.errorMessage.set('Error al cargar las categorías desde el catálogo.');
        console.warn('Error al cargar categorías desde API:', err);
      },
    });

    this.issuesService.getProperties().subscribe({
      next: (data) => this.properties.set(data),
      error: (err) => {
        this.errorMessage.set('Error al cargar las propiedades asignadas.');
        console.warn('Error al cargar propiedades desde API:', err);
      },
    });

    this.issuesService.getInternalAreas().subscribe({
      next: (data) => this.internalAreas.set(data),
      error: (err) => {
        this.errorMessage.set('Error al cargar las áreas internas.');
        console.warn('Error al cargar áreas internas desde API:', err);
      },
    });
  }

  onScopeChange(newScope: IssueScope): void {
    this.scope = newScope;
    this.categoryId = '';
    this.propertyId = '';
    this.propertyZoneId = '';
    this.internalAreaId = '';
    this.categories.set([]);
    this.errorMessage.set(null);

    this.issuesService.getCategories(newScope).subscribe({
      next: (data) => this.categories.set(data),
      error: (err) => {
        this.categories.set([]);
        this.errorMessage.set('Error al cargar las categorías del ámbito seleccionado.');
        console.warn('Error al cargar categorías para ámbito:', err);
      },
    });
  }

  getSelectedPropertyZones(): any[] {
    const prop = this.properties().find((p) => p.id === this.propertyId);
    return prop?.zones || [];
  }

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
        rejected.push(`Máximo ${FILE_POLICY.maxAttachmentsPerIssue} archivos por novedad.`);
        break;
      }
      accepted.push({
        id: `f${++this.fileSeq}`,
        file,
        kind,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      });
    }

    this.pendingFiles.update((list) => [...list, ...accepted]);
    this.fileWarning.set(rejected.length ? rejected.join(' ') : null);
  }

  removeFile(id: string): void {
    const target = this.pendingFiles().find((f) => f.id === id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    this.pendingFiles.update((list) => list.filter((f) => f.id !== id));
  }

  /** Sube los archivos uno por uno; devuelve los nombres que fallaron. */
  private uploadPending(issueId: string) {
    const files = this.pendingFiles();
    this.uploadProgress.set({ done: 0, total: files.length });
    return from(files).pipe(
      concatMap((pending) => {
        // Fotos = estado al reportar; cotizaciones = soporte documental
        const stage: EvidenceStage = pending.kind === 'PHOTO' ? 'INICIAL' : 'SOPORTE';
        return this.issuesService.uploadAttachment(issueId, pending.file, stage).pipe(
          map(() => null),
          catchError(() => of(pending.file.name)),
        );
      }),
      map((failed) => {
        this.uploadProgress.update((p) => (p ? { ...p, done: p.done + 1 } : p));
        return failed;
      }),
      toArray(),
      map((results) => results.filter((name): name is string => name !== null)),
    );
  }

  /** Le dice a quien reporta quién se encargará, para que no tenga que adivinar el siguiente paso. */
  private assignmentNote(created: Issue): string {
    if (created.assignedUserId && created.assignedUserId === this.authService.currentUser()?.id) {
      return 'Quedó a tu cargo.';
    }
    if (created.assignedUser) {
      return `Quedó a cargo de ${created.assignedUser.firstName} ${created.assignedUser.lastName}.`;
    }
    return 'Quedó por asignar: Gerencia o la Dirección elegirán un responsable.';
  }

  onSubmit(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    // Aislamiento Administrador (RN-001)
    if (this.authService.isAdmin()) {
      this.errorMessage.set(
        'El rol Administrador del Sistema tiene aislamiento operativo y no puede registrar novedades (RN-001).',
      );
      return;
    }

    // Validaciones locales de negocio
    if (!this.title.trim()) {
      this.errorMessage.set('El título de la novedad es obligatorio.');
      return;
    }
    if (!this.description.trim()) {
      this.errorMessage.set('La descripción detallada es obligatoria.');
      return;
    }
    if (!this.categoryId) {
      this.errorMessage.set('Debe seleccionar una categoría válida para el ámbito.');
      return;
    }

    if (this.scope === 'PROPIEDAD' && !this.propertyId) {
      this.errorMessage.set('Para una novedad de propiedad, debe seleccionar la propiedad horizontal.');
      return;
    }

    if (this.scope === 'INTERNA' && !this.internalAreaId) {
      this.errorMessage.set('Para una novedad interna, debe seleccionar el área interna de EG S.A.S.');
      return;
    }

    // Las medidas urgentes son opcionales para permitir reportar riesgos críticos recién detectados sin bloquear la alerta
    const payload: CreateIssuePayload = {
      scope: this.scope,
      title: this.title.trim(),
      description: this.description.trim(),
      priority: this.priority,
      categoryId: this.categoryId,
      propertyId: this.scope === 'PROPIEDAD' ? this.propertyId : undefined,
      propertyZoneId:
        this.scope === 'PROPIEDAD' && this.propertyZoneId ? this.propertyZoneId : undefined,
      internalAreaId: this.scope === 'INTERNA' ? this.internalAreaId : undefined,
      urgentMeasures: this.urgentMeasures.trim() ? this.urgentMeasures.trim() : undefined,
    };

    this.loading.set(true);

    this.issuesService.createIssue(payload).subscribe({
      next: (created) => {
        const goToDetail = () => setTimeout(() => this.router.navigate(['/issues', created.id]), 1600);
        const whoHandlesIt = this.assignmentNote(created);

        if (this.pendingFiles().length === 0) {
          this.loading.set(false);
          this.successMessage.set(`Novedad ${created.code} registrada. ${whoHandlesIt}`);
          goToDetail();
          return;
        }

        // La novedad ya existe: si algún archivo falla no se pierde el registro
        this.uploadPending(created.id).subscribe((failed) => {
          this.loading.set(false);
          this.uploadProgress.set(null);
          if (failed.length === 0) {
            this.successMessage.set(`Novedad ${created.code} registrada con sus archivos. ${whoHandlesIt}`);
          } else {
            this.errorMessage.set(
              `La novedad ${created.code} se registró, pero no se pudieron subir: ${failed.join(', ')}. ` +
                'Puedes adjuntarlos desde el detalle.',
            );
          }
          goToDetail();
        });
      },
      error: (err) => {
        this.loading.set(false);
        const msg =
          err.error?.message ||
          (err.status === 403
            ? 'No tiene permisos para registrar novedades en este ámbito.'
            : 'Error al registrar novedad. Verifique los datos.');
        this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
      },
    });
  }
}
