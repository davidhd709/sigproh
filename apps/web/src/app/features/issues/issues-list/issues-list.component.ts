import { IconComponent } from '../../../shared/icon/icon.component';
import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Params, Router, RouterModule } from '@angular/router';
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
} from '../../../shared/presentation';
import { attentionState, fullName, humanDate } from '../../../shared/issue-attention';
import { bogotaDaysBetween, daysOpenLabel } from '../../../shared/bogota-time';
import { INBOX_VIEWS, InboxView, isInboxView, viewsForRole } from '../inbox-views';
import { rememberList, takeScroll } from './list-return';

export type IssueSort = 'priority' | 'oldest' | 'updated';

export const SORT_OPTIONS: { value: IssueSort; label: string }[] = [
  { value: 'priority', label: 'Prioridad' },
  { value: 'oldest', label: 'Antigüedad' },
  { value: 'updated', label: 'Última actualización' },
];

const PRIORITY_RANK: Record<IssuePriority, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
const SCOPES: IssueScope[] = ['PROPIEDAD', 'INTERNA'];
const PRIORITIES: IssuePriority[] = ['CRITICA', 'ALTA', 'MEDIA', 'BAJA'];
const STATUSES: IssueStatus[] = ['ASIGNADA', 'EN_ATENCION', 'CERRADA', 'DESCARTADA'];

const isOpen = (i: Issue) => i.status !== 'CERRADA' && i.status !== 'DESCARTADA';

/**
 * Orden operativo: primero las críticas abiertas, luego por prioridad y, a igual prioridad,
 * la más antigua (lleva más tiempo esperando). Las cerradas van al final.
 */
export function sortIssues(list: Issue[], sort: IssueSort): Issue[] {
  const created = (i: Issue) => Date.parse(i.createdAt) || 0;
  const updated = (i: Issue) => Date.parse(i.updatedAt ?? i.createdAt) || 0;
  const copy = [...list];
  switch (sort) {
    case 'oldest':
      return copy.sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || created(a) - created(b));
    case 'updated':
      return copy.sort((a, b) => updated(b) - updated(a));
    default:
      return copy.sort(
        (a, b) =>
          Number(isOpen(b)) - Number(isOpen(a)) ||
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          created(a) - created(b),
      );
  }
}

interface ActiveFilter {
  key: string;
  label: string;
  /** Parámetros de URL que se quitan al eliminar el filtro. */
  clear: Params;
}

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
  readonly showFilters = signal<boolean>(false);

  // Catálogos para el filtro de ubicación
  readonly properties = signal<{ id: string; name: string }[]>([]);
  readonly internalAreas = signal<{ id: string; name: string }[]>([]);

  // Presentación
  readonly statusLabel = statusLabel;
  readonly statusTone = statusTone;
  readonly priorityLabel = priorityLabel;
  readonly priorityTone = priorityTone;
  readonly initials = initialsOf;
  readonly fullName = fullName;
  readonly humanDate = humanDate;
  readonly daysOpenLabel = daysOpenLabel;
  readonly sortOptions = SORT_OPTIONS;

  // ---------- Estado de la bandeja: vive en la URL para que Atrás y «Volver» lo restauren ----------
  private param(name: string): string | null {
    return this.queryParams().get(name);
  }

  readonly views = computed(() => viewsForRole(this.authService.currentUser()?.role).map((k) => INBOX_VIEWS[k]));
  readonly view = computed<InboxView>(() => {
    const v = this.param('view');
    return isInboxView(v) && this.views().some((d) => d.key === v) ? v : 'ALL';
  });
  readonly searchQuery = computed(() => this.param('q') ?? '');
  readonly selectedScope = computed<IssueScope | 'ALL'>(() => {
    const v = this.param('scope') as IssueScope;
    return SCOPES.includes(v) ? v : 'ALL';
  });
  readonly selectedPriority = computed<IssuePriority | 'ALL'>(() => {
    const v = this.param('priority') as IssuePriority;
    return PRIORITIES.includes(v) ? v : 'ALL';
  });
  readonly selectedStatus = computed<IssueStatus | 'ALL'>(() => {
    const v = this.param('status') as IssueStatus;
    return STATUSES.includes(v) ? v : 'ALL';
  });
  readonly sort = computed<IssueSort>(() => {
    const v = this.param('sort') as IssueSort;
    return SORT_OPTIONS.some((o) => o.value === v) ? v : 'priority';
  });
  /** Valor del selector de ubicación: «p:<id>» o «a:<id>». */
  readonly locationValue = computed(() => {
    const p = this.param('propertyId');
    const a = this.param('internalAreaId');
    return p ? `p:${p}` : a ? `a:${a}` : '';
  });

  readonly locationFilter = computed(() => {
    const propertyId = this.param('propertyId');
    const internalAreaId = this.param('internalAreaId');
    if (!propertyId && !internalAreaId) return null;
    const catalog = propertyId ? this.properties() : this.internalAreas();
    const id = (propertyId ?? internalAreaId)!;
    const match = this.issues().find((i) => (propertyId ? i.propertyId === propertyId : i.internalAreaId === internalAreaId));
    const name =
      catalog.find((x) => x.id === id)?.name ??
      (propertyId ? match?.property?.name : match?.internalArea?.name) ??
      'Ubicación seleccionada';
    return { propertyId, internalAreaId, name };
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

  /** Filtros aplicados, visibles como etiquetas que se pueden quitar una por una. */
  readonly activeFilters = computed<ActiveFilter[]>(() => {
    const list: ActiveFilter[] = [];
    const q = this.searchQuery().trim();
    if (q) list.push({ key: 'q', label: `Búsqueda: «${q}»`, clear: { q: null } });
    const loc = this.locationFilter();
    if (loc) list.push({ key: 'loc', label: loc.name, clear: { propertyId: null, internalAreaId: null } });
    const scope = this.selectedScope();
    if (scope !== 'ALL')
      list.push({ key: 'scope', label: scope === 'PROPIEDAD' ? 'Conjuntos o edificios' : 'Áreas de la empresa', clear: { scope: null } });
    const priority = this.selectedPriority();
    if (priority !== 'ALL') list.push({ key: 'priority', label: `Prioridad ${priorityLabel(priority).toLowerCase()}`, clear: { priority: null } });
    const status = this.selectedStatus();
    if (status !== 'ALL') list.push({ key: 'status', label: `Estado: ${statusLabel(status).toLowerCase()}`, clear: { status: null } });
    return list;
  });
  /** Filtros del panel (sin contar búsqueda ni ubicación, que se ven aparte). */
  readonly activeFilterCount = computed(
    () =>
      Number(this.selectedScope() !== 'ALL') +
      Number(this.selectedPriority() !== 'ALL') +
      Number(this.selectedStatus() !== 'ALL') +
      Number(Boolean(this.locationFilter())),
  );

  readonly stats = computed(() => {
    const all = this.issues();
    return {
      total: all.length,
      critical: all.filter((i) => i.priority === 'CRITICA' && isOpen(i)).length,
    };
  });

  // Lista filtrada y ordenada: el conteo de resultados es exactamente su largo
  readonly filteredIssues = computed(() => {
    const userId = this.authService.currentUser()?.id ?? '';
    const now = new Date();
    const viewDef = INBOX_VIEWS[this.view()];
    let list = this.byLocation(this.issues()).filter((i) => viewDef.match(i, userId, now));
    const scope = this.selectedScope();
    const priority = this.selectedPriority();
    const status = this.selectedStatus();
    const query = this.searchQuery().trim().toLowerCase();

    if (scope !== 'ALL') list = list.filter((i) => i.scope === scope);
    if (priority !== 'ALL') list = list.filter((i) => i.priority === priority);
    if (status !== 'ALL') {
      // Varios códigos se muestran como un mismo estado (p. ej. Pendiente)
      list = list.filter((i) => statusLabel(i.status) === statusLabel(status));
    }
    if (query) {
      list = list.filter(
        (i) =>
          i.code?.toLowerCase().includes(query) ||
          i.title?.toLowerCase().includes(query) ||
          i.property?.name?.toLowerCase().includes(query) ||
          i.internalArea?.name?.toLowerCase().includes(query) ||
          i.propertyZone?.name?.toLowerCase().includes(query),
      );
    }
    return sortIssues(list, this.sort());
  });

  /** Datos de cada tarjeta: misma situación de atención que el detalle y misma antigüedad que Inicio. */
  cardInfo(issue: Issue) {
    const now = new Date();
    return {
      attention: attentionState(issue, this.authService.currentUser()?.id, now),
      open: isOpen(issue),
      daysOpen: bogotaDaysBetween(issue.createdAt, now),
    };
  }

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      // Limpiar inmediatamente la información de la sesión anterior para evitar retención de datos
      untracked(() => {
        this.issues.set([]);
        this.properties.set([]);
        this.internalAreas.set([]);
        if (user) {
          this.loadIssues();
          this.loadCatalogs();
        } else {
          this.loading.set(false);
        }
      });
    });
  }

  private loadCatalogs(): void {
    const pick = (items: any[]) => items.map((x) => ({ id: x.id, name: x.name }));
    this.issuesService.getProperties?.().subscribe({ next: (x) => this.properties.set(pick(x)), error: () => {} });
    this.issuesService.getInternalAreas?.().subscribe({ next: (x) => this.internalAreas.set(pick(x)), error: () => {} });
  }

  /** Cambia parámetros de la bandeja sin crear una entrada nueva en el historial. */
  private setParams(params: Params): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  setView(view: InboxView): void {
    this.setParams({ view: view === 'ALL' ? null : view });
  }

  setSearch(q: string): void {
    this.setParams({ q: q.trim() ? q : null });
  }

  setScope(scope: IssueScope | 'ALL'): void {
    // Una ubicación concreta de otro tipo deja de tener sentido
    const loc = this.locationValue();
    const clearLoc =
      (scope === 'PROPIEDAD' && loc.startsWith('a:')) || (scope === 'INTERNA' && loc.startsWith('p:'))
        ? { propertyId: null, internalAreaId: null }
        : {};
    this.setParams({ scope: scope === 'ALL' ? null : scope, ...clearLoc });
  }

  setPriority(priority: IssuePriority | 'ALL'): void {
    this.setParams({ priority: priority === 'ALL' ? null : priority });
  }

  setStatus(status: IssueStatus | 'ALL'): void {
    this.setParams({ status: status === 'ALL' ? null : status });
  }

  setSort(sort: IssueSort): void {
    this.setParams({ sort: sort === 'priority' ? null : sort });
  }

  setLocation(value: string): void {
    const [kind, id] = value.split(':');
    this.setParams({ propertyId: kind === 'p' ? id : null, internalAreaId: kind === 'a' ? id : null });
  }

  removeFilter(filter: ActiveFilter): void {
    this.setParams(filter.clear);
  }

  clearLocation(): void {
    this.setParams({ propertyId: null, internalAreaId: null });
  }

  clearFilters(): void {
    this.setParams({ q: null, scope: null, priority: null, status: null, propertyId: null, internalAreaId: null });
  }

  /** Antes de abrir un caso se recuerda la bandeja y la posición para poder volver igual. */
  onOpenIssue(): void {
    rememberList(this.router.url, typeof window !== 'undefined' ? window.scrollY : 0);
  }

  private byLocation(list: Issue[]): Issue[] {
    const propertyId = this.param('propertyId');
    const internalAreaId = this.param('internalAreaId');
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
        this.restoreScroll();
      },
      error: (err) => {
        this.loading.set(false);
        this.issues.set([]);
        if (err.status === 403) {
          this.errorMessage.set(
            'Acceso restringido (403): Su rol actual no tiene autorización operativa para consultar la bandeja de novedades (RN-001 / RN-002).',
          );
        } else {
          this.errorMessage.set(err.error?.message || 'No se pudo conectar con el servidor. Revisa la conexión y reintenta.');
        }
      },
    });
  }

  /** Al volver de un caso, deja la lista en la posición en que estaba. */
  private restoreScroll(): void {
    if (typeof window === 'undefined') return;
    const y = takeScroll(this.router.url);
    if (y === null) return;
    // Espera a que se pinte la lista antes de desplazar
    requestAnimationFrame(() => setTimeout(() => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior })));
  }
}
