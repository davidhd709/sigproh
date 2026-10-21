import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IssuesService } from '../../../core/services/issues.service';
import { AuthService } from '../../../core/services/auth.service';
import { Issue, IssuePriority, IssueScope, IssueStatus } from '../../../core/models/issue.model';

@Component({
  selector: 'app-issues-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './issues-list.component.html',
  styleUrls: ['./issues-list.component.css'],
})
export class IssuesListComponent {
  private readonly issuesService = inject(IssuesService);
  readonly authService = inject(AuthService);

  readonly issues = signal<Issue[]>([]);
  readonly loading = signal<boolean>(true);
  readonly errorMessage = signal<string | null>(null);

  // Filtros interactivos
  readonly selectedScope = signal<IssueScope | 'ALL'>('ALL');
  readonly selectedPriority = signal<IssuePriority | 'ALL'>('ALL');
  readonly selectedStatus = signal<IssueStatus | 'ALL'>('ALL');
  readonly searchQuery = signal<string>('');
  readonly onlyCritical = signal<boolean>(false);

  // Estadísticas computadas
  readonly stats = computed(() => {
    const all = this.issues();
    return {
      total: all.length,
      critical: all.filter((i) => i.priority === 'CRITICA').length,
      inReview: all.filter((i) => i.status === 'EN_REVISION').length,
      assigned: all.filter((i) => i.status === 'ASIGNADA').length,
    };
  });

  // Lista filtrada
  readonly filteredIssues = computed(() => {
    let list = this.issues();
    const scope = this.selectedScope();
    const priority = this.selectedPriority();
    const status = this.selectedStatus();
    const query = this.searchQuery().trim().toLowerCase();
    const criticalOnly = this.onlyCritical();

    if (scope !== 'ALL') {
      list = list.filter((i) => i.scope === scope);
    }
    if (priority !== 'ALL') {
      list = list.filter((i) => i.priority === priority);
    }
    if (criticalOnly) {
      list = list.filter((i) => i.priority === 'CRITICA');
    }
    if (status !== 'ALL') {
      list = list.filter((i) => i.status === status);
    }
    if (query) {
      list = list.filter(
        (i) =>
          i.code.toLowerCase().includes(query) ||
          i.title.toLowerCase().includes(query) ||
          i.property?.name.toLowerCase().includes(query) ||
          i.internalArea?.name.toLowerCase().includes(query),
      );
    }

    return list;
  });

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      // Limpiar inmediatamente la información de la sesión anterior para evitar retención de datos
      this.issues.set([]);
      if (user) {
        this.loadIssues();
      } else {
        this.loading.set(false);
      }
    });
  }

  loadIssues(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.issuesService.getIssues().subscribe({
      next: (data) => {
        this.issues.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.issues.set([]);
        if (err.status === 403) {
          this.errorMessage.set(
            'Acceso restringido (403): Su rol actual no tiene autorización operativa para consultar la bandeja de novedades (RN-001 / RN-002).',
          );
        } else {
          this.errorMessage.set(
            err.error?.message || 'No se pudo conectar con el servidor API.',
          );
        }
      },
    });
  }

  getPriorityClass(priority: IssuePriority): string {
    switch (priority) {
      case 'CRITICA':
        return 'badge-critical';
      case 'ALTA':
        return 'badge-high';
      case 'MEDIA':
        return 'badge-medium';
      case 'BAJA':
        return 'badge-low';
    }
  }

  getStatusClass(status: IssueStatus): string {
    switch (status) {
      case 'EN_REVISION':
        return 'badge-review';
      case 'ASIGNADA':
        return 'badge-assigned';
      case 'EN_PROCESO':
        return 'badge-in-progress';
      case 'ATENDIDA':
      case 'VERIFICADA':
      case 'CERRADA':
        return 'badge-success';
      default:
        return 'badge-neutral';
    }
  }
}
