import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

/** Quién puede entrar a Configuración y a qué secciones (el backend aplica las mismas reglas). */
export function canManageCatalogs(role?: string | null): boolean {
  return role === 'ADMINISTRADOR' || role === 'DIRECTOR_OPERATIVO';
}

export function canManageUsers(role?: string | null): boolean {
  return role === 'ADMINISTRADOR';
}

@Component({
  selector: 'app-settings-nav',
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./settings.css'],
  template: `
    <nav class="settings-tabs" aria-label="Secciones de configuración">
      @if (showUsers()) {
        <a routerLink="/settings/users" routerLinkActive="active">Usuarios</a>
      }
      <a routerLink="/settings/properties" routerLinkActive="active">Propiedades</a>
      <a routerLink="/settings/areas" routerLinkActive="active">Áreas internas</a>
      <a routerLink="/settings/categories" routerLinkActive="active">Categorías</a>
    </nav>
  `,
})
export class SettingsNavComponent {
  private readonly auth = inject(AuthService);
  readonly showUsers = computed(() => canManageUsers(this.auth.currentUser()?.role));
}
