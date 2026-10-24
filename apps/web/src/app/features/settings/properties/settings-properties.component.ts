import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { AdminService, apiErrorMessage } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ManagedProperty, ManagedUser } from '../../../core/models/admin.model';
import { IconComponent } from '../../../shared/icon/icon.component';
import { initialsOf } from '../../../shared/presentation';
import { SettingsNavComponent, canManageCatalogs } from '../settings-nav.component';

type PropertyForm = { name: string; code: string; address: string; nit: string };

@Component({
  selector: 'app-settings-properties',
  imports: [FormsModule, IconComponent, SettingsNavComponent],
  templateUrl: './settings-properties.component.html',
  styleUrls: ['../settings.css'],
})
export class SettingsPropertiesComponent {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);

  readonly initials = initialsOf;
  readonly canManage = computed(() => canManageCatalogs(this.auth.currentUser()?.role));

  readonly properties = signal<ManagedProperty[]>([]);
  readonly users = signal<ManagedUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly search = signal('');
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.properties().filter((p) => !q || `${p.name} ${p.code}`.toLowerCase().includes(q));
  });

  /** Solo los coordinadores operativos activos pueden asignarse a propiedades (regla del backend). */
  readonly assignableUsers = computed(() =>
    this.users().filter((u) => u.isActive && u.role === 'COORDINADOR_OPERATIVO'),
  );

  // Editor
  readonly editingId = signal<string | 'new' | null>(null);
  readonly editing = computed(() => {
    const id = this.editingId();
    return id && id !== 'new' ? (this.properties().find((p) => p.id === id) ?? null) : null;
  });
  form: PropertyForm = { name: '', code: '', address: '', nit: '' };
  newZone = '';
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
    this.admin.listProperties().subscribe({
      next: (list) => {
        this.properties.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorMessage(err, 'No se pudieron cargar las propiedades.'));
        this.loading.set(false);
      },
    });
    this.admin.listUsers().subscribe({ next: (u) => this.users.set(u), error: () => {} });
  }

  openNew(): void {
    this.form = { name: '', code: '', address: '', nit: '' };
    this.formError.set(null);
    this.notice.set(null);
    this.editingId.set('new');
  }

  openEdit(p: ManagedProperty): void {
    this.form = { name: p.name, code: p.code, address: p.address ?? '', nit: p.nit ?? '' };
    this.newZone = '';
    this.newAssigneeId = '';
    this.newAssigneeLead = p.assignments.length === 0;
    this.formError.set(null);
    this.notice.set(null);
    this.editingId.set(p.id);
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
    const payload = { name: this.form.name.trim(), address: this.form.address.trim(), nit: this.form.nit.trim() };
    const request: Observable<ManagedProperty> =
      id === 'new'
        ? this.admin.createProperty({ ...payload, code: this.form.code.trim() })
        : this.admin.updateProperty(id, payload);
    this.run(request, id === 'new' ? 'Propiedad creada. Ahora agrega zonas y coordinadores.' : 'Datos guardados.', (created) => {
      // Tras crear, el editor sigue abierto sobre la nueva propiedad
      if (id === 'new' && created?.id) this.editingId.set(created.id);
    });
  }

  addZone(p: ManagedProperty): void {
    const name = this.newZone.trim();
    if (!name) return;
    this.run(this.admin.addZone(p.id, { name }), 'Zona agregada.', () => (this.newZone = ''));
  }

  removeZone(p: ManagedProperty, zoneId: string, zoneName: string): void {
    if (!confirm(`¿Quitar la zona «${zoneName}»? Las novedades que ya la usan la conservan.`)) return;
    this.run(this.admin.updateZone(p.id, zoneId, { isActive: false }), 'Zona retirada.');
  }

  assign(p: ManagedProperty): void {
    if (!this.newAssigneeId) return;
    this.run(this.admin.assignToProperty(p.id, this.newAssigneeId, this.newAssigneeLead), 'Coordinador asignado.', () => {
      this.newAssigneeId = '';
      this.newAssigneeLead = false;
    });
  }

  makeLead(p: ManagedProperty, userId: string): void {
    this.run(this.admin.assignToProperty(p.id, userId, true), 'Coordinador principal actualizado.');
  }

  unassign(p: ManagedProperty, userId: string, name: string): void {
    if (!confirm(`¿Retirar a ${name} de ${p.name}? Dejará de ver sus novedades.`)) return;
    this.run(this.admin.removeFromProperty(p.id, userId), 'Coordinador retirado.');
  }

  toggleActive(p: ManagedProperty): void {
    const msg = p.isActive
      ? `¿Desactivar ${p.name}? No se podrán registrar novedades nuevas; el historial se conserva.`
      : `¿Activar ${p.name}?`;
    if (!confirm(msg)) return;
    this.run(this.admin.updateProperty(p.id, { isActive: !p.isActive }), p.isActive ? 'Propiedad desactivada.' : 'Propiedad activada.');
  }

  /** Coordinadores aún no asignados a la propiedad. */
  candidatesFor(p: ManagedProperty): ManagedUser[] {
    const assigned = new Set(p.assignments.map((a) => a.user.id));
    return this.assignableUsers().filter((u) => !assigned.has(u.id));
  }

  leadName(p: ManagedProperty): string | null {
    const lead = p.assignments.find((a) => a.isLead);
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
        this.admin.listProperties().subscribe((list) => this.properties.set(list));
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
