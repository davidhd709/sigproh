import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AdminService, apiErrorMessage } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ManagedUser, UserRole } from '../../../core/models/admin.model';
import { IconComponent } from '../../../shared/icon/icon.component';
import { initialsOf, roleLabel, timeAgo } from '../../../shared/presentation';
import { SettingsNavComponent, canManageUsers } from '../settings-nav.component';

type UserForm = { email: string; firstName: string; lastName: string; role: UserRole; password: string };

const ROLES: UserRole[] = ['DIRECTOR_OPERATIVO', 'COORDINADOR_OPERATIVO', 'GERENTE', 'AUXILIAR_GERENCIA', 'ADMINISTRADOR'];

/** Contraseña inicial legible: sin caracteres ambiguos (0/O, 1/l/I). */
export function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  const body = Array.from(values, (v) => chars[v % chars.length]).join('');
  // Garantiza al menos un dígito
  return /\d/.test(body) ? body : body.slice(0, -1) + '7';
}

@Component({
  selector: 'app-settings-users',
  imports: [FormsModule, RouterModule, IconComponent, SettingsNavComponent],
  templateUrl: './settings-users.component.html',
  styleUrls: ['../settings.css', './settings-users.component.css'],
})
export class SettingsUsersComponent {
  private readonly admin = inject(AdminService);
  readonly auth = inject(AuthService);

  readonly roles = ROLES;
  readonly roleLabel = roleLabel;
  readonly initials = initialsOf;
  readonly timeAgo = timeAgo;
  readonly canManage = computed(() => canManageUsers(this.auth.currentUser()?.role));

  readonly users = signal<ManagedUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  readonly search = signal('');
  readonly roleFilter = signal<'' | UserRole>('');
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    return this.users().filter(
      (u) =>
        (!role || u.role === role) &&
        (!q || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q)),
    );
  });

  // Modal crear / editar
  readonly editing = signal<ManagedUser | 'new' | null>(null);
  form: UserForm = this.emptyForm();
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  /** Contraseña recién asignada, para mostrarla una sola vez al administrador. */
  readonly revealedPassword = signal<{ user: string; password: string } | null>(null);

  // Modal restablecer contraseña
  readonly resetting = signal<ManagedUser | null>(null);
  resetPasswordValue = '';

  constructor() {
    this.load();
  }

  load(): void {
    if (!this.canManage()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.admin.listUsers().subscribe({
      next: (list) => {
        this.users.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorMessage(err, 'No se pudieron cargar los usuarios.'));
        this.loading.set(false);
      },
    });
  }

  openNew(): void {
    this.form = this.emptyForm();
    this.form.password = generatePassword();
    this.formError.set(null);
    this.editing.set('new');
  }

  openEdit(user: ManagedUser): void {
    this.form = { email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, password: '' };
    this.formError.set(null);
    this.editing.set(user);
  }

  isNew(): boolean {
    return this.editing() === 'new';
  }

  isSelf(user: ManagedUser): boolean {
    return user.id === this.auth.currentUser()?.id;
  }

  save(): void {
    const target = this.editing();
    if (!target) return;
    const f = this.form;
    if (!f.email.trim() || !f.firstName.trim() || !f.lastName.trim()) {
      this.formError.set('Completa nombre, apellido y correo.');
      return;
    }
    if (target === 'new' && f.password.length < 10) {
      this.formError.set('La contraseña inicial debe tener al menos 10 caracteres.');
      return;
    }

    this.saving.set(true);
    const request =
      target === 'new'
        ? this.admin.createUser({ ...f, email: f.email.trim() })
        : this.admin.updateUser(target.id, { email: f.email.trim(), firstName: f.firstName, lastName: f.lastName, role: f.role });

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(null);
        if (target === 'new') {
          this.revealedPassword.set({ user: `${f.firstName} ${f.lastName}`, password: f.password });
        } else {
          this.notice.set('Cambios guardados.');
        }
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(apiErrorMessage(err, 'No se pudo guardar el usuario.'));
      },
    });
  }

  toggleActive(user: ManagedUser): void {
    const action = user.isActive ? 'desactivar' : 'activar';
    if (!confirm(`¿Seguro que quieres ${action} a ${user.firstName} ${user.lastName}?`)) return;
    this.admin.setUserActive(user.id, !user.isActive).subscribe({
      next: () => {
        this.notice.set(user.isActive ? 'Usuario desactivado. Sus sesiones se cerraron.' : 'Usuario activado.');
        this.load();
      },
      error: (err) => this.error.set(apiErrorMessage(err, 'No se pudo cambiar el estado.')),
    });
  }

  openReset(user: ManagedUser): void {
    this.resetPasswordValue = generatePassword();
    this.formError.set(null);
    this.resetting.set(user);
  }

  confirmReset(): void {
    const user = this.resetting();
    if (!user) return;
    if (this.resetPasswordValue.length < 10) {
      this.formError.set('La contraseña debe tener al menos 10 caracteres.');
      return;
    }
    this.saving.set(true);
    const password = this.resetPasswordValue;
    this.admin.resetPassword(user.id, password).subscribe({
      next: () => {
        this.saving.set(false);
        this.resetting.set(null);
        this.revealedPassword.set({ user: `${user.firstName} ${user.lastName}`, password });
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(apiErrorMessage(err, 'No se pudo restablecer la contraseña.'));
      },
    });
  }

  regenerate(target: 'form' | 'reset'): void {
    if (target === 'form') this.form.password = generatePassword();
    else this.resetPasswordValue = generatePassword();
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.notice.set('Contraseña copiada.');
    } catch {
      this.notice.set('No se pudo copiar; selecciónala y cópiala manualmente.');
    }
  }

  assignmentsSummary(user: ManagedUser): string[] {
    return [
      ...(user.propertyAssignments ?? []).map((a) => a.property.name + (a.isLead ? ' · principal' : '')),
      ...(user.areaAssignments ?? []).map((a) => a.internalArea.name + (a.isLead ? ' · principal' : '')),
    ];
  }

  private emptyForm(): UserForm {
    return { email: '', firstName: '', lastName: '', role: 'COORDINADOR_OPERATIVO', password: '' };
  }
}
