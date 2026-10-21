import { Component, inject, signal, effect } from '@angular/core';
import { RouterModule, RouterOutlet, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, AvailableAccount } from './core/services/auth.service';
import { NotificationsService } from './core/services/notifications.service';
import { AppNotification } from './core/models/issue.model';

@Component({
  imports: [CommonModule, RouterModule, RouterOutlet, FormsModule],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  readonly authService = inject(AuthService);
  readonly notificationsService = inject(NotificationsService);
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

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.refreshNotifications();
      } else {
        this.notifications.set([]);
        this.unreadNotificationsCount.set(0);
        this.showNotificationsDropdown.set(false);
      }
    });
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
        this.router.navigate(['/issues']);
      },
      error: (err) => {
        this.loginSubmitting.set(false);
        const msg = err.error?.message || 'Credenciales inválidas o fallo en el servidor.';
        this.loginError.set(Array.isArray(msg) ? msg.join(', ') : msg);
      },
    });
  }

  fillDevCredentials(acc: AvailableAccount): void {
    if (!acc.password) return;
    this.loginEmail = acc.email;
    this.loginPassword = acc.password;
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
