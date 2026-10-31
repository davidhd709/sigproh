import { Component, inject, signal, effect, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterModule, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, AvailableAccount } from './core/services/auth.service';
import { NotificationsService } from './core/services/notifications.service';
import { PwaService } from './core/services/pwa.service';
import { AppNotification } from './core/models/issue.model';
import { IconComponent, IconName } from './shared/icon/icon.component';
import { initialsOf, roleLabel } from './shared/presentation';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
}

@Component({
  imports: [CommonModule, RouterModule, RouterOutlet, FormsModule, IconComponent],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
  host: {
    '(document:keydown.escape)': 'closeSheets()',
  },
})
export class App {
  readonly authService = inject(AuthService);
  readonly notificationsService = inject(NotificationsService);
  readonly pwa = inject(PwaService);
  private readonly router = inject(Router);

  // Formulario de credenciales auténticas
  loginEmail = '';
  loginPassword = '';
  readonly loginSubmitting = signal<boolean>(false);
  readonly loginError = signal<string | null>(null);

  // In-app Notifications State
  readonly unreadNotificationsCount = signal<number>(0);
  readonly notifications = signal<AppNotification[]>([]);
  readonly showNotificationsDropdown = signal<boolean>(false);
  readonly notificationsLoading = signal<boolean>(false);

  // Navegación
  readonly showAccountMenu = signal<boolean>(false);
  readonly navItems: NavItem[] = [
    { path: '/dashboard', label: 'Inicio', icon: 'home' },
    { path: '/issues', label: 'Novedades', icon: 'inbox' },
    { path: '/reports', label: 'Informes', icon: 'file-text' },
  ];
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** En formularios de creación se ocultan las pestañas inferiores para dar espacio a sus acciones. */
  readonly isFormScreen = computed(() => /^\/(issues|reports)\/new(\?|$)/.test(this.currentUrl()));
  readonly initials = computed(() => {
    const user = this.authService.currentUser();
    return user ? initialsOf(user.firstName, user.lastName) || 'U' : '';
  });
  readonly roleLabel = computed(() => roleLabel(this.authService.currentUser()?.role));
  /** El administrador técnico no accede a expedientes (aislamiento operativo, RN-001): solo ve Configuración. */
  readonly isAdmin = computed(() => this.authService.currentUser()?.role === 'ADMINISTRADOR');
  readonly visibleNavItems = computed(() => (this.isAdmin() ? [] : this.navItems));
  /** Configuración: administrador (todo) y Director Operativo (catálogos). */
  readonly canConfigure = computed(() => {
    const role = this.authService.currentUser()?.role;
    return role === 'ADMINISTRADOR' || role === 'DIRECTOR_OPERATIVO';
  });

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.refreshNotifications();
      } else {
        this.notifications.set([]);
        this.unreadNotificationsCount.set(0);
        this.closeSheets();
      }
    });
    // El administrador no tiene acceso a novedades, tablero ni informes: se le lleva a Configuración
    effect(() => {
      const url = this.currentUrl().split('?')[0];
      if (this.isAdmin() && (url === '/' || /^\/(issues|dashboard|reports)(\/|$)/.test(url))) {
        this.router.navigate(['/settings/users']);
      }
    });
    // Al navegar se cierran los paneles abiertos
    effect(() => {
      this.currentUrl();
      this.closeSheets();
    });
  }

  /** "Novedades" queda activa en la bandeja y en el detalle, no en "Nueva novedad". */
  isActive(path: string): boolean {
    const url = this.currentUrl().split('?')[0];
    if (path === '/issues') return url === '/issues' || (url.startsWith('/issues/') && !url.startsWith('/issues/new'));
    return url === path || url.startsWith(path + '/');
  }

  toggleAccountMenu(): void {
    this.showNotificationsDropdown.set(false);
    this.showAccountMenu.update((open) => !open);
  }

  closeSheets(): void {
    this.showChangePassword.set(false);
    this.showAccountMenu.set(false);
    this.showNotificationsDropdown.set(false);
  }

  // ---------- Cambiar contraseña ----------
  readonly showChangePassword = signal(false);
  readonly passwordSaving = signal(false);
  readonly passwordError = signal<string | null>(null);
  readonly passwordChanged = signal(false);
  pwd = { current: '', next: '', confirm: '' };

  openChangePassword(): void {
    this.showAccountMenu.set(false);
    this.pwd = { current: '', next: '', confirm: '' };
    this.passwordError.set(null);
    this.passwordChanged.set(false);
    this.showChangePassword.set(true);
  }

  submitChangePassword(): void {
    const { current, next, confirm } = this.pwd;
    if (!current || !next) {
      this.passwordError.set('Completa la contraseña actual y la nueva.');
      return;
    }
    if (next.length < 10) {
      this.passwordError.set('La nueva contraseña debe tener al menos 10 caracteres.');
      return;
    }
    if (next !== confirm) {
      this.passwordError.set('Las contraseñas nuevas no coinciden.');
      return;
    }
    this.passwordSaving.set(true);
    this.passwordError.set(null);
    this.authService.changePassword(current, next).subscribe({
      next: () => {
        this.passwordSaving.set(false);
        this.passwordChanged.set(true);
      },
      error: (err) => {
        this.passwordSaving.set(false);
        const msg = err.error?.message;
        this.passwordError.set(Array.isArray(msg) ? msg.join('. ') : msg || 'No se pudo cambiar la contraseña.');
      },
    });
  }

  async installApp(): Promise<void> {
    this.showAccountMenu.set(false);
    await this.pwa.install();
  }

  refreshNotifications(): void {
    this.notificationsLoading.set(true);
    this.notificationsService.getUnreadCount().subscribe({
      next: (res) => {
        this.unreadNotificationsCount.set(res.unreadCount);
      },
      error: () => {},
    });

    this.notificationsService.getNotifications(false).subscribe({
      next: (items) => {
        this.notifications.set(items);
        this.notificationsLoading.set(false);
      },
      error: () => {
        this.notificationsLoading.set(false);
      },
    });
  }

  toggleNotificationsDropdown(): void {
    this.showAccountMenu.set(false);
    const next = !this.showNotificationsDropdown();
    this.showNotificationsDropdown.set(next);
    if (next) {
      this.refreshNotifications();
    }
  }

  onNotificationClick(notif: AppNotification): void {
    if (!notif.isRead) {
      this.notificationsService.markAsRead(notif.id).subscribe({
        next: () => {
          this.unreadNotificationsCount.update((c) => Math.max(0, c - 1));
          this.notifications.update((list) =>
            list.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)),
          );
        },
      });
    }

    this.showNotificationsDropdown.set(false);
    if (notif.issueId) {
      this.router.navigate(['/issues', notif.issueId]);
    }
  }

  markAllNotificationsAsRead(): void {
    this.notificationsService.markAllAsRead().subscribe({
      next: () => {
        this.unreadNotificationsCount.set(0);
        this.notifications.update((list) =>
          list.map((n) => ({ ...n, isRead: true })),
        );
      },
    });
  }

  onAccountChange(newEmail: string): void {
    if (!newEmail) return;
    this.authService.switchAccount(newEmail).subscribe({
      next: () => {
        const currentUrl = this.router.url;
        this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
          this.router.navigateByUrl(currentUrl);
        });
      },
      error: (err) => {
        console.error('Error al cambiar de cuenta:', err);
      },
    });
  }

  onLoginSubmit(): void {
    this.loginError.set(null);
    if (!this.loginEmail.trim() || !this.loginPassword) {
      this.loginError.set('Por favor ingrese su correo electrónico institucional y su contraseña.');
      return;
    }

    this.loginSubmitting.set(true);
    this.authService.login(this.loginEmail.trim(), this.loginPassword).subscribe({
      next: () => {
        this.loginSubmitting.set(false);
        this.loginPassword = '';
        this.router.navigate(this.isAdmin() ? ['/settings/users'] : ['/issues']);
      },
      error: (err) => {
        this.loginSubmitting.set(false);
        const msg = err.error?.message || 'Credenciales inválidas o fallo en el servidor.';
        this.loginError.set(Array.isArray(msg) ? msg.join(', ') : msg);
      },
    });
  }

  /** Un toque entra con la cuenta de prueba: en el celular el botón de ingresar queda fuera de la vista. */
  fillDevCredentials(acc: AvailableAccount): void {
    if (!acc.password || this.loginSubmitting()) return;
    this.loginEmail = acc.email;
    this.loginPassword = acc.password;
    this.onLoginSubmit();
  }

  /** Ícono, rol corto y nombre de pila: caben en dos columnas incluso a 320 px. */
  devAccountView(acc: AvailableAccount): { icon: IconName; role: string; person: string | null } {
    const views: Record<string, { icon: IconName; role: string }> = {
      DIRECTOR_OPERATIVO: { icon: 'briefcase', role: 'Director' },
      COORDINADOR_OPERATIVO: { icon: 'clipboard', role: 'Coordinador' },
      GERENTE: { icon: 'building', role: 'Gerente' },
      AUXILIAR_GERENCIA: { icon: 'file-text', role: 'Auxiliar' },
      ADMINISTRADOR: { icon: 'settings', role: 'Administrador' },
    };
    const view = views[acc.role] ?? { icon: 'user' as IconName, role: roleLabel(acc.role) };
    const firstName = acc.name.split(' ')[0];
    // El administrador no tiene nombre de persona; no se repite el rol
    return { ...view, person: firstName === view.role ? null : firstName };
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
