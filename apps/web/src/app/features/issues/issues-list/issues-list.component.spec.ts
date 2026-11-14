import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { IssuesListComponent } from './issues-list.component';
import { IssuesService } from '../../../core/services/issues.service';
import { AuthService } from '../../../core/services/auth.service';

describe('IssuesListComponent', () => {
  let component: IssuesListComponent;
  let fixture: ComponentFixture<IssuesListComponent>;
  let mockIssuesService: any;
  let mockAuthService: any;
  let currentUserSignal: any;

  beforeEach(async () => {
    currentUserSignal = signal<any>({
      id: 'dir-1',
      email: 'director@sigproh.local',
      role: 'DIRECTOR_OPERATIVO',
    });

    mockIssuesService = {
      getProperties: vi.fn().mockReturnValue(of([{ id: 'p1', name: 'Torres' }, { id: 'p2', name: 'Plaza' }])),
      getInternalAreas: vi.fn().mockReturnValue(of([{ id: 'a1', name: 'Operaciones' }])),
      getIssues: vi.fn().mockReturnValue(
        of([
          {
            id: 'issue-1',
            code: 'NOV-2026-0001',
            title: 'Fuga en sótano',
            scope: 'PROPIEDAD',
            priority: 'CRITICA',
            status: 'EN_REVISION',
          },
        ]),
      ),
    };

    mockAuthService = {
      currentUser: currentUserSignal,
      isDirector: vi.fn().mockReturnValue(true),
      isCoordinator: vi.fn().mockReturnValue(false),
      isAuxiliar: vi.fn().mockReturnValue(false),
      isManager: vi.fn().mockReturnValue(false),
      isAdmin: vi.fn().mockReturnValue(false),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [IssuesListComponent],
      providers: [
        provideRouter([{ path: 'issues', children: [] }]),
        { provide: IssuesService, useValue: mockIssuesService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IssuesListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('debe crearse y cargar novedades para el usuario autenticado', () => {
    expect(component).toBeTruthy();
    expect(mockIssuesService.getIssues).toHaveBeenCalled();
    expect(component.issues()).toHaveLength(1);
    expect(component.issues()[0].code).toBe('NOV-2026-0001');
  });

  it('al cambiar de usuario, limpia inmediatamente la lista y recarga según la nueva identidad', () => {
    mockIssuesService.getIssues.mockClear();
    mockIssuesService.getIssues.mockReturnValue(
      of([
        {
          id: 'issue-coord-2',
          code: 'NOV-2026-0002',
          title: 'Novedad de Coordinador',
          scope: 'PROPIEDAD',
          priority: 'MEDIA',
          status: 'ASIGNADA',
        },
      ]),
    );

    // Cambiar el signal del usuario simulando switchAccount
    currentUserSignal.set({
      id: 'coord-1',
      email: 'coordinador1@sigproh.local',
      role: 'COORDINADOR_OPERATIVO',
    });

    fixture.detectChanges();

    expect(mockIssuesService.getIssues).toHaveBeenCalled();
    expect(component.issues()).toHaveLength(1);
    expect(component.issues()[0].code).toBe('NOV-2026-0002');
  });

  it('si el nuevo usuario recibe 403, vacía la lista y muestra error auténtico', () => {
    mockIssuesService.getIssues.mockClear();
    const error403 = new HttpErrorResponse({
      status: 403,
      statusText: 'Forbidden',
      error: { message: 'Aislamiento operativo' },
    });
    mockIssuesService.getIssues.mockReturnValue(throwError(() => error403));

    currentUserSignal.set({
      id: 'admin-1',
      email: 'admin@sigproh.local',
      role: 'ADMINISTRADOR',
    });

    fixture.detectChanges();

    expect(component.issues()).toHaveLength(0);
    expect(component.errorMessage()).toContain('Acceso restringido (403)');
  });

  describe('bandejas por rol', () => {
    const now = new Date().toISOString();
    const sample = [
      { id: 'a', status: 'EN_REVISION', priority: 'MEDIA', assignedUserId: null, propertyId: 'p1', property: { name: 'Torres' }, createdAt: now, code: 'A', title: 'A' },
      { id: 'b', status: 'EN_ATENCION', priority: 'ALTA', assignedUserId: 'coord-1', createdById: 'coord-1', propertyId: 'p2', property: { name: 'Plaza' }, createdAt: now, code: 'B', title: 'B',
        inbox: { openActivities: 2, overdueActivities: 1, blockedActivities: 0, myOpenActivities: 1, returned: true, returnedAt: now } },
      { id: 'c', status: 'CERRADA', priority: 'CRITICA', assignedUserId: 'coord-1', propertyId: 'p1', property: { name: 'Torres' }, createdAt: now, code: 'C', title: 'C' },
    ];

    beforeEach(() => component.issues.set(sample as any));

    it('lee la vista y la propiedad desde la URL (enlaces de Inicio)', async () => {
      await TestBed.inject(Router).navigateByUrl('/?view=UNASSIGNED&propertyId=p1');
      fixture.detectChanges();

      expect(component.view()).toBe('UNASSIGNED');
      expect(component.locationFilter()?.name).toBe('Torres');
      expect(component.filteredIssues().map((i) => i.id)).toEqual(['a']);
    });

    it('ignora vistas que no corresponden al rol', async () => {
      await TestBed.inject(Router).navigateByUrl('/?view=MY_ACTIVITIES');
      expect(component.view()).toBe('ALL');
    });

    it('el coordinador ve sus vistas: a su cargo, pendientes y en proceso', async () => {
      currentUserSignal.set({ id: 'coord-1', email: 'c@x', role: 'COORDINADOR_OPERATIVO' });
      fixture.detectChanges();
      component.issues.set(sample as any);

      expect(component.views().map((v) => v.key)).toEqual(['ALL', 'MINE', 'PENDING', 'IN_PROGRESS']);
      const counts = component.viewCounts();
      // La novedad cerrada no cuenta como asignada pendiente
      expect(counts.MINE).toBe(1);
      expect(counts.PENDING).toBe(1);
      expect(counts.IN_PROGRESS).toBe(1);
    });

    it('el filtro "Pendiente" incluye también las que no tienen responsable', async () => {
      await TestBed.inject(Router).navigateByUrl('/?status=ASIGNADA');
      expect(component.filteredIssues().map((i) => i.id)).toEqual(['a']);
    });
  });

  describe('orden, búsqueda, filtros y regreso', () => {
    const day = (iso: string) => new Date(iso).toISOString();
    const list = [
      { id: 'media-vieja', code: 'NOV-1', title: 'Puerta', priority: 'MEDIA', status: 'ASIGNADA', propertyId: 'p1', property: { name: 'Torres' }, createdAt: day('2026-10-01T15:00:00Z'), updatedAt: day('2026-11-10T15:00:00Z') },
      { id: 'critica-nueva', code: 'NOV-2', title: 'Fuga de gas', priority: 'CRITICA', status: 'EN_ATENCION', propertyId: 'p2', property: { name: 'Plaza' }, createdAt: day('2026-11-12T15:00:00Z'), updatedAt: day('2026-11-12T16:00:00Z') },
      { id: 'critica-cerrada', code: 'NOV-3', title: 'Incendio', priority: 'CRITICA', status: 'CERRADA', propertyId: 'p1', property: { name: 'Torres' }, createdAt: day('2026-09-01T15:00:00Z'), updatedAt: day('2026-11-13T10:00:00Z'), closedAt: day('2026-09-02T15:00:00Z') },
      { id: 'alta', code: 'NOV-4', title: 'Ascensor', priority: 'ALTA', status: 'ASIGNADA', internalAreaId: 'a1', internalArea: { name: 'Operaciones' }, scope: 'INTERNA', createdAt: day('2026-11-01T15:00:00Z'), updatedAt: day('2026-11-01T15:00:00Z') },
    ];
    const ids = () => component.filteredIssues().map((i) => i.id);
    const go = (url: string) => TestBed.inject(Router).navigateByUrl(url);

    beforeEach(() => component.issues.set(list as any));

    it('por defecto muestra primero las críticas abiertas y deja las cerradas al final', () => {
      expect(ids()).toEqual(['critica-nueva', 'alta', 'media-vieja', 'critica-cerrada']);
    });

    it('ordena por antigüedad y por última actualización', async () => {
      await go('/?sort=oldest');
      expect(ids()).toEqual(['media-vieja', 'alta', 'critica-nueva', 'critica-cerrada']);
      await go('/?sort=updated');
      expect(ids()).toEqual(['critica-cerrada', 'critica-nueva', 'media-vieja', 'alta']);
    });

    it('una búsqueda sin coincidencias muestra cero resultados', async () => {
      await go('/?q=zzz-no-existe');
      fixture.detectChanges();
      expect(ids()).toEqual([]);
      const text = (fixture.nativeElement as HTMLElement).textContent;
      expect(text).toContain('0 resultados');
      expect(text).toContain('Sin resultados');
    });

    it('busca por código, título o ubicación', async () => {
      await go('/?q=plaza');
      expect(ids()).toEqual(['critica-nueva']);
      await go('/?q=NOV-4');
      expect(ids()).toEqual(['alta']);
    });

    it('filtra por un área de la empresa concreta y el conteo coincide con lo que se ve', async () => {
      await go('/?internalAreaId=a1');
      fixture.detectChanges();
      expect(ids()).toEqual(['alta']);
      expect((fixture.nativeElement as HTMLElement).querySelector('.results-count')?.textContent).toContain('1 resultado');
      expect(component.activeFilters().map((f) => f.label)).toEqual(['Operaciones']);
    });

    it('cada filtro aplicado se ve y se puede quitar', async () => {
      await go('/?view=CRITICAL&priority=CRITICA&q=fuga&propertyId=p2');
      fixture.detectChanges();
      expect(component.activeFilters().map((f) => f.key)).toEqual(['q', 'loc', 'priority']);

      component.removeFilter(component.activeFilters()[0]);
      await fixture.whenStable();
      expect(component.searchQuery()).toBe('');
      expect(component.view()).toBe('CRITICAL');
      expect(component.locationValue()).toBe('p:p2');
    });

    it('al abrir un caso recuerda la bandeja; al volver restaura vista, filtros, orden y posición', async () => {
      await go('/issues?view=CRITICAL&sort=oldest&q=gas');
      const router = TestBed.inject(Router);
      Object.defineProperty(window, 'scrollY', { value: 640, configurable: true });
      const scrollTo = vi.fn();
      window.scrollTo = scrollTo as any;

      component.onOpenIssue();

      const { listReturnUrl, takeScroll } = await import('./list-return');
      expect(listReturnUrl()).toEqual({ path: '/issues', queryParams: { view: 'CRITICAL', sort: 'oldest', q: 'gas' } });
      expect(router.url).toBe('/issues?view=CRITICAL&sort=oldest&q=gas');
      expect(takeScroll('/issues?view=CRITICAL&sort=oldest&q=gas')).toBe(640);
      // Se consume una sola vez
      expect(takeScroll('/issues?view=CRITICAL&sort=oldest&q=gas')).toBeNull();
    });

    it('la tarjeta usa el mismo estado de atención que el detalle', () => {
      fixture.detectChanges();
      const info = component.cardInfo({ ...list[0], assignedUserId: null, suggestedUserId: 'u', suggestedUser: { firstName: 'Pedro', lastName: 'Gómez' } } as any);
      expect(info.attention.label).toBe('Falta confirmar');
      expect(info.attention.message).toBe('Pedro Gómez fue sugerido. Falta confirmar.');
    });
  });
});
