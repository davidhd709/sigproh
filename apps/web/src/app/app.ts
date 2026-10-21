import { Component, inject, signal } from '@angular/core';
import { RouterModule, RouterOutlet, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, AvailableAccount } from './core/services/auth.service';

@Component({
  imports: [CommonModule, RouterModule, RouterOutlet, FormsModule],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Formulario de credenciales auténticas
  loginEmail = '';
  loginPassword = '';
  readonly loginSubmitting = signal<boolean>(false);
  readonly loginError = signal<string | null>(null);

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
