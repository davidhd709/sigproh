import { IconComponent } from '../../../shared/icon/icon.component';
import { Component, inject, signal, computed, effect } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IssuesService } from '../../../core/services/issues.service';
import { AuthService } from '../../../core/services/auth.service';
import { Issue, IssuePriority, IssueScope, IssueStatus } from '../../../core/models/issue.model';
import {
  initialsOf,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  timeAgo,
} from '../../../shared/presentation';
import { INBOX_VIEWS, InboxView, isInboxView, viewsForRole } from '../inbox-views';

@Component({
  selector: 'app-issues-list',
  standalone: true,
  imports: [IconComponent, CommonModule, RouterModule, FormsModule],
  templateUrl: './issues-list.component.html',
  styleUrls: ['./issues-list.component.css'],
})
export class IssuesListComponent {
  private readonly issuesService = inject(IssuesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly authService = inject(AuthService);
  private readonly queryParams = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  readonly issues = signal<Issue[]>([]);
  readonly loading = signal<boolean>(true);
  readonly errorMessage = signal<string | null>(null);

  // Filtros interactivos
  readonly selectedScope = signal<IssueScope | 'ALL'>('ALL');
  readonly selectedPriority = signal<IssuePriority | 'ALL'>('ALL');
  readonly selectedStatus = signal<IssueStatus | 'ALL'>('ALL');
  readonly searchQuery = signal<string>('');
  readonly showFilters = signal<boolean>(false);

  // Presentación
  readonly statusLabel = statusLabel;
  readonly statusTone = statusTone;
  readonly priorityLabel = priorityLabel;
  readonly priorityTone = priorityTone;
  readonly timeAgo = timeAgo;
  readonly initials = initialsOf;

  // ---------- Bandejas por rol (la vista y la ubicación viven en la URL) ----------
  readonly views = computed(() => viewsForRole(this.authService.currentUser()?.role).map((k) => INBOX_VIEWS[k]));
  readonly view = computed<InboxView>(() => {
    const v = this.queryParams().get('view');
    return isInboxView(v) && this.views().some((d) => d.key === v) ? v : 'ALL';
  });
  /** Nombres de propiedades y áreas, para rotular el filtro aunque la ubicación no tenga novedades. */
  private readonly locationNames = signal<Record<string, string>>({});
  readonly locationFilter = computed(() => {
    const params = this.queryParams();
    const propertyId = params.get('propertyId');
    const internalAreaId = params.get('internalAreaId');
    if (!propertyId && !internalAreaId) return null;
    const id = (propertyId ?? internalAreaId)!;
    const match = this.issues().find((i) => (propertyId ? i.propertyId === propertyId : i.internalAreaId === internalAreaId));
    const name = (propertyId ? match?.property?.name : match?.internalArea?.name) ?? this.locationNames()[id];
    return { propertyId, internalAreaId, name: name ?? 'Ubicación seleccionada' };
  });

  /** Número de novedades en cada vista, respetando el filtro de ubicación. */
  readonly viewCounts = computed(() => {
    const userId = this.authService.currentUser()?.id ?? '';
    const now = new Date();
    const base = this.byLocation(this.issues());
    const counts: Partial<Record<InboxView, number>> = {};
    for (const def of this.views()) counts[def.key] = base.filter((i) => def.match(i, userId, now)).length;
    return counts;
  });

  readonly currentViewLabel = computed(() => INBOX_VIEWS[this.view()].label);

  readonly activeFilterCount = computed(
    () =>
      Number(this.selectedScope() !== 'ALL') +
      Number(this.selectedPriority() !== 'ALL') +
      Number(this.selectedStatus() !== 'ALL'),
  );

  readonly stats = computed(() => {
    const all = this.issues();
    return {
      total: all.length,
      critical: all.filter((i) => i.priority === 'CRITICA' && i.status !== 'CERRADA' && i.status !== 'DESCARTADA').length,
    };
  });

  // Lista filtrada
  readonly filteredIssues = computed(() => {
    const userId = this.authService.currentUser()?.id ?? '';
    const now = new Date();
    const viewDef = INBOX_VIEWS[this.view()];
    let list = this.byLocation(this.issues()).filter((i) => viewDef.match(i, userId, now));
    const scope = this.selectedScope();
    const priority = this.selectedPriority();
    const status = this.selectedStatus();
    const query = this.searchQuery().trim().toLowerCase();

    if (scope !== 'ALL') {
      list = list.filter((i) => i.scope === scope);
    }
    if (priority !== 'ALL') {
      list = list.filter((i) => i.priority === priority);
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
    // Si llega un filtro de ubicación, carga una vez los catálogos para mostrar su nombre
    effect(() => {
      const params = this.queryParams();
      if (!params.get('propertyId') && !params.get('internalAreaId')) return;
      if (Object.keys(this.locationNames()).length > 0 || !this.authService.currentUser()) return;
      const add = (items: { id: string; name: string }[]) =>
        this.locationNames.update((m) => ({ ...m, ...Object.fromEntries(items.map((x) => [x.id, x.name])) }));
      this.issuesService.getProperties?.().subscribe({ next: add, error: () => {} });
      this.issuesService.getInternalAreas?.().subscribe({ next: add, error: () => {} });
    });
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

  setView(view: InboxView): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: view === 'ALL' ? null : view },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  clearLocation(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { propertyId: null, internalAreaId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  clearFilters(): void {
    this.selectedScope.set('ALL');
    this.selectedPriority.set('ALL');
    this.selectedStatus.set('ALL');
    this.searchQuery.set('');
  }

  /** Avisos breves de seguimiento para la tarjeta de cada novedad. */
  followUps(issue: Issue): { label: string; tone: 'danger' | 'warning' | 'info' }[] {
    const s = issue.inbox;
    if (!s) return [];
    const out: { label: string; tone: 'danger' | 'warning' | 'info' }[] = [];
    if (s.overdueActivities) out.push({ label: `${s.overdueActivities} ${s.overdueActivities === 1 ? 'vencida' : 'vencidas'}`, tone: 'danger' });
    if (s.blockedActivities) out.push({ label: s.blockedActivities === 1 ? 'Bloqueada' : `${s.blockedActivities} bloqueadas`, tone: 'danger' });
    if (s.myOpenActivities) out.push({ label: `${s.myOpenActivities} para ti`, tone: 'info' });
    return out;
  }

  private byLocation(list: Issue[]): Issue[] {
    const params = this.queryParams();
    const propertyId = params.get('propertyId');
    const internalAreaId = params.get('internalAreaId');
    if (propertyId) return list.filter((i) => i.propertyId === propertyId);
    if (internalAreaId) return list.filter((i) => i.internalAreaId === internalAreaId);
    return list;
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
}
