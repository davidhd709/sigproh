import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { AdminService, apiErrorMessage } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ManagedCategory } from '../../../core/models/admin.model';
import { IssueScope } from '../../../core/models/issue.model';
import { IconComponent } from '../../../shared/icon/icon.component';
import { SettingsNavComponent, canManageCatalogs } from '../settings-nav.component';

type CategoryForm = { scope: IssueScope; name: string; description: string; requiresEvidence: boolean };

@Component({
  selector: 'app-settings-categories',
  imports: [FormsModule, IconComponent, SettingsNavComponent],
  templateUrl: './settings-categories.component.html',
  styleUrls: ['../settings.css', './settings-categories.component.css'],
})
export class SettingsCategoriesComponent {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);

  readonly canManage = computed(() => canManageCatalogs(this.auth.currentUser()?.role));
  readonly categories = signal<ManagedCategory[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  readonly groups = computed(() => [
    { scope: 'PROPIEDAD' as IssueScope, label: 'Propiedades', icon: 'building' as const, items: this.categories().filter((c) => c.scope === 'PROPIEDAD') },
    { scope: 'INTERNA' as IssueScope, label: 'Áreas internas', icon: 'landmark' as const, items: this.categories().filter((c) => c.scope === 'INTERNA') },
  ]);

  readonly editing = signal<ManagedCategory | 'new' | null>(null);
  form: CategoryForm = this.emptyForm('PROPIEDAD');
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    if (!this.canManage()) {
      this.loading.set(false);
      return;
    }
    this.admin.listCategories().subscribe({
      next: (list) => {
        this.categories.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorMessage(err, 'No se pudieron cargar las categorías.'));
        this.loading.set(false);
      },
    });
  }

  openNew(scope: IssueScope): void {
    this.form = this.emptyForm(scope);
    this.formError.set(null);
    this.editing.set('new');
  }

  openEdit(c: ManagedCategory): void {
    this.form = { scope: c.scope, name: c.name, description: c.description ?? '', requiresEvidence: c.requiresEvidence };
    this.formError.set(null);
    this.editing.set(c);
  }

  save(): void {
    const target = this.editing();
    if (!target) return;
    if (!this.form.name.trim()) {
      this.formError.set('El nombre es obligatorio.');
      return;
    }
    const payload = {
      name: this.form.name.trim(),
      description: this.form.description.trim(),
      requiresEvidence: this.form.requiresEvidence,
    };
    const request: Observable<ManagedCategory> =
      target === 'new' ? this.admin.createCategory({ ...payload, scope: this.form.scope }) : this.admin.updateCategory(target.id, payload);
    this.run(request, target === 'new' ? 'Categoría creada.' : 'Categoría actualizada.', () => this.editing.set(null));
  }

  toggleEvidence(c: ManagedCategory): void {
    this.run(
      this.admin.updateCategory(c.id, { requiresEvidence: !c.requiresEvidence }),
      !c.requiresEvidence ? `«${c.name}» ahora exige evidencia final para cerrar.` : `«${c.name}» ya no exige evidencia final.`,
    );
  }

  toggleActive(c: ManagedCategory): void {
    if (c.isActive && !confirm(`¿Desactivar «${c.name}»? No aparecerá al registrar novedades; las existentes la conservan.`)) return;
    this.run(this.admin.updateCategory(c.id, { isActive: !c.isActive }), c.isActive ? 'Categoría desactivada.' : 'Categoría activada.');
  }

  private run<T>(request: Observable<T>, success: string, after?: () => void): void {
    this.saving.set(true);
    this.formError.set(null);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.notice.set(success);
        after?.();
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        const msg = apiErrorMessage(err, 'No se pudo guardar.');
        if (this.editing()) this.formError.set(msg);
        else this.error.set(msg);
      },
    });
  }

  private emptyForm(scope: IssueScope): CategoryForm {
    return { scope, name: '', description: '', requiresEvidence: true };
  }
}
