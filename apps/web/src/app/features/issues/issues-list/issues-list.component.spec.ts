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
        provideRouter([]),
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

    it('el coordinador ve sus vistas: a su cargo, por cerrar, actividades y vencidas', async () => {
      currentUserSignal.set({ id: 'coord-1', email: 'c@x', role: 'COORDINADOR_OPERATIVO' });
      fixture.detectChanges();
      component.issues.set(sample as any);

      expect(component.views().map((v) => v.key)).toEqual(['ALL', 'MINE', 'TO_CLOSE', 'MY_ACTIVITIES', 'OVERDUE']);
      const counts = component.viewCounts();
      // La novedad cerrada no cuenta como asignada pendiente
      expect(counts.MINE).toBe(1);
      expect(counts.OVERDUE).toBe(1);
      expect(component.followUps(sample[1] as any).map((f) => f.label)).toEqual(['1 vencida', '1 para ti']);
    });
  });
});
