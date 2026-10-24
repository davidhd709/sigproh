import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { AdminService, apiErrorMessage } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ManagedArea, ManagedUser } from '../../../core/models/admin.model';
import { IconComponent } from '../../../shared/icon/icon.component';
import { roleLabel } from '../../../shared/presentation';
import { SettingsNavComponent, canManageCatalogs } from '../settings-nav.component';

type AreaForm = { name: string; code: string; description: string };

@Component({
  selector: 'app-settings-areas',
  imports: [FormsModule, IconComponent, SettingsNavComponent],
  templateUrl: './settings-areas.component.html',
  styleUrls: ['../settings.css'],
})
export class SettingsAreasComponent {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);

  readonly roleLabel = roleLabel;
  readonly canManage = computed(() => canManageCatalogs(this.auth.currentUser()?.role));

  readonly areas = signal<ManagedArea[]>([]);
  readonly users = signal<ManagedUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  readonly editingId = signal<string | 'new' | null>(null);
  readonly editing = computed(() => {
    const id = this.editingId();
    return id && id !== 'new' ? (this.areas().find((a) => a.id === id) ?? null) : null;
  });
  form: AreaForm = { name: '', code: '', description: '' };
  newAssigneeId = '';
  newAssigneeLead = false;
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
    this.admin.listAreas().subscribe({
      next: (list) => {
        this.areas.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorMessage(err, 'No se pudieron cargar las áreas.'));
        this.loading.set(false);
      },
    });
    this.admin.listUsers().subscribe({ next: (u) => this.users.set(u), error: () => {} });
  }

  openNew(): void {
    this.form = { name: '', code: '', description: '' };
    this.formError.set(null);
    this.notice.set(null);
    this.editingId.set('new');
  }

  openEdit(a: ManagedArea): void {
    this.form = { name: a.name, code: a.code, description: a.description ?? '' };
    this.newAssigneeId = '';
    this.newAssigneeLead = a.assignments.length === 0;
    this.formError.set(null);
    this.notice.set(null);
    this.editingId.set(a.id);
  }

  close(): void {
    this.editingId.set(null);
  }

  saveData(): void {
    const id = this.editingId();
    if (!id) return;
    if (!this.form.name.trim() || (id === 'new' && !this.form.code.trim())) {
      this.formError.set('El nombre y el código son obligatorios.');
      return;
    }
    const payload = { name: this.form.name.trim(), description: this.form.description.trim() };
    const request: Observable<ManagedArea> =
      id === 'new' ? this.admin.createArea({ ...payload, code: this.form.code.trim() }) : this.admin.updateArea(id, payload);
    this.run(request, id === 'new' ? 'Área creada. Ahora asigna a sus responsables.' : 'Datos guardados.', (created) => {
      if (id === 'new' && created?.id) this.editingId.set(created.id);
    });
  }

  assign(a: ManagedArea): void {
    if (!this.newAssigneeId) return;
    this.run(this.admin.assignToArea(a.id, this.newAssigneeId, this.newAssigneeLead), 'Persona asignada.', () => {
      this.newAssigneeId = '';
      this.newAssigneeLead = false;
    });
  }

  makeLead(a: ManagedArea, userId: string): void {
    this.run(this.admin.assignToArea(a.id, userId, true), 'Responsable principal actualizado.');
  }

  unassign(a: ManagedArea, userId: string, name: string): void {
    if (!confirm(`¿Retirar a ${name} de ${a.name}?`)) return;
    this.run(this.admin.removeFromArea(a.id, userId), 'Persona retirada.');
  }

  toggleActive(a: ManagedArea): void {
    const msg = a.isActive
      ? `¿Desactivar ${a.name}? No se podrán registrar novedades nuevas; el historial se conserva.`
      : `¿Activar ${a.name}?`;
    if (!confirm(msg)) return;
    this.run(this.admin.updateArea(a.id, { isActive: !a.isActive }), a.isActive ? 'Área desactivada.' : 'Área activada.');
  }

  candidatesFor(a: ManagedArea): ManagedUser[] {
    const assigned = new Set(a.assignments.map((x) => x.user.id));
    return this.users().filter((u) => u.isActive && u.role !== 'ADMINISTRADOR' && !assigned.has(u.id));
  }

  leadName(a: ManagedArea): string | null {
    const lead = a.assignments.find((x) => x.isLead);
    return lead ? `${lead.user.firstName} ${lead.user.lastName}` : null;
  }

  private run<T>(request: Observable<T>, success: string, after?: (result: T) => void): void {
    this.saving.set(true);
    this.formError.set(null);
    request.subscribe({
      next: (result) => {
        this.saving.set(false);
        this.notice.set(success);
        after?.(result);
        this.admin.listAreas().subscribe((list) => this.areas.set(list));
      },
      error: (err) => {
        this.saving.set(false);
        const msg = apiErrorMessage(err, 'No se pudo guardar.');
        if (this.editingId()) this.formError.set(msg);
        else this.error.set(msg);
      },
    });
  }
}
