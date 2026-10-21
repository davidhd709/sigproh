import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IssuesService } from '../../../core/services/issues.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  Category,
  CreateIssuePayload,
  IssuePriority,
  IssueScope,
} from '../../../core/models/issue.model';

@Component({
  selector: 'app-issue-create',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './issue-create.component.html',
  styleUrls: ['./issue-create.component.css'],
})
export class IssueCreateComponent implements OnInit {
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

  onSubmit(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    // PEN-03: Bloqueo explícito de Auxiliar de Gerencia (ordinarias y críticas)
    if (this.authService.isAuxiliar()) {
      this.errorMessage.set(
        'El rol Auxiliar de Gerencia no tiene autorización para registrar novedades (PEN-03 pendiente de definición).',
      );
      return;
    }

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
        this.loading.set(false);
        this.successMessage.set(`Novedad registrada exitosamente con código ${created.code}.`);
        setTimeout(() => {
          this.router.navigate(['/issues', created.id]);
        }, 1200);
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
