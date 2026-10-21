import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { IssueDetailComponent } from './issue-detail.component';
import { IssuesService } from '../../../core/services/issues.service';
import { AuthService } from '../../../core/services/auth.service';

describe('IssueDetailComponent', () => {
  let component: IssueDetailComponent;
  let fixture: ComponentFixture<IssueDetailComponent>;
  let mockIssuesService: any;
  let mockAuthService: any;

  beforeEach(async () => {
    mockIssuesService = {
      getIssueById: vi.fn(),
      getCandidates: vi.fn().mockReturnValue(of([])),
      assignPrincipal: vi.fn(),
      updatePriority: vi.fn(),
      addUrgentMeasure: vi.fn(),
      createActivity: vi.fn(),
      updateActivity: vi.fn(),
      assignActivity: vi.fn(),
      createComment: vi.fn(),
    };

    mockAuthService = {
      currentUser: vi.fn().mockReturnValue({
        id: 'dir-1',
        email: 'director@sigproh.local',
        role: 'DIRECTOR_OPERATIVO',
      }),
      isDirector: vi.fn().mockReturnValue(true),
      isCoordinator: vi.fn().mockReturnValue(false),
      isAuxiliar: vi.fn().mockReturnValue(false),
      isManager: vi.fn().mockReturnValue(false),
      isAdmin: vi.fn().mockReturnValue(false),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [IssueDetailComponent],
      providers: [
        provideRouter([]),
        { provide: IssuesService, useValue: mockIssuesService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IssueDetailComponent);
    component = fixture.componentInstance;
  });

  it('debe crearse correctamente', () => {
    expect(component).toBeTruthy();
  });

  it('ante un 403 Forbidden, muestra estado de error auténtico y NO inyecta datos ficticios', () => {
    const error403 = new HttpErrorResponse({
      status: 403,
      statusText: 'Forbidden',
      error: { message: 'Acceso denegado: no tiene asignación activa' },
    });
    mockIssuesService.getIssueById.mockReturnValue(throwError(() => error403));

    component.loadIssue('issue-forbidden-123');
    fixture.detectChanges();

    expect(component.issue()).toBeNull();
    expect(component.errorMessage()).toContain('Acceso denegado (403)');
    expect(component.loading()).toBe(false);

    // Comprobar que en el DOM aparece el panel de error auténtico
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.error-panel')).toBeTruthy();
    expect(compiled.textContent).toContain('Acceso Restringido o Registro No Encontrado');
    expect(compiled.textContent).not.toContain('NOV-2026-0001'); // No debe haber datos de muestra
  });

  it('debe cargar candidatos reales autorizados al consultar la novedad como Director', () => {
    const mockIssue: any = {
      id: 'issue-100',
      code: 'NOV-2026-0050',
      scope: 'PROPIEDAD',
      title: 'Falla eléctrica',
      priority: 'ALTA',
      initialPriority: 'ALTA',
      status: 'EN_REVISION',
      propertyId: 'prop-1',
      property: { name: 'Torres del Parque' },
    };
    mockIssuesService.getIssueById.mockReturnValue(of(mockIssue));
    mockIssuesService.getCandidates.mockReturnValue(
      of([
        {
          id: 'coord-1',
          firstName: 'Juan',
          lastName: 'Coordinador Norte',
          role: 'COORDINADOR_OPERATIVO',
          isLead: true,
          scopeAuthorized: true,
        },
        {
          id: 'dir-1',
          firstName: 'Carlos',
          lastName: 'Director Operativo',
          role: 'DIRECTOR_OPERATIVO',
          isLead: false,
          scopeAuthorized: true,
        },
      ]),
    );

    component.loadIssue('issue-100');
    fixture.detectChanges();

    expect(component.issue()).toEqual(mockIssue);
    expect(mockIssuesService.getCandidates).toHaveBeenCalledWith('issue-100');
    expect(component.candidates()).toHaveLength(2);
    expect(component.candidates()[0].id).toBe('coord-1');
    expect(component.candidates()[0].isLead).toBe(true);
  });

  it('F4: permite crear actividad y refresca la novedad', () => {
    const mockIssue: any = {
      id: 'issue-100',
      code: 'NOV-2026-0050',
      title: 'Falla eléctrica',
      activities: [],
    };
    component.issue.set(mockIssue);

    mockIssuesService.createActivity.mockReturnValue(
      of({
        id: 'act-1',
        title: 'Inspeccionar tablero',
        version: 1,
        status: 'PENDIENTE',
      }),
    );
    mockIssuesService.getIssueById.mockReturnValue(of(mockIssue));

    component.newActivityTitle = 'Inspeccionar tablero';
    component.newActivityDescription = 'Revisar disyuntores';
    component.submitCreateActivity();

    expect(mockIssuesService.createActivity).toHaveBeenCalledWith('issue-100', {
      title: 'Inspeccionar tablero',
      description: 'Revisar disyuntores',
      assignedUserId: undefined,
      dueDate: undefined,
    });
    expect(component.successMessage()).toContain('Actividad creada exitosamente');
  });

  it('F4 Concurrencia (409): muestra mensaje explicativo y recarga la novedad ante colisión', () => {
    const mockIssue: any = {
      id: 'issue-100',
      code: 'NOV-2026-0050',
      title: 'Falla eléctrica',
      activities: [],
    };
    component.issue.set(mockIssue);

    const activity: any = {
      id: 'act-1',
      title: 'Inspeccionar tablero',
      version: 1,
      status: 'PENDIENTE',
    };
    component.selectedActivity.set(activity);
    component.targetActivityStatus = 'BLOQUEADA';
    component.activityStatusReason = 'Falta repuesto';

    const error409 = new HttpErrorResponse({
      status: 409,
      statusText: 'Conflict',
      error: { message: 'Conflicto de concurrencia (409)' },
    });
    mockIssuesService.updateActivity.mockReturnValue(throwError(() => error409));
    mockIssuesService.getIssueById.mockReturnValue(of(mockIssue));

    component.submitUpdateStatus();

    expect(component.errorMessage()).toContain('Conflicto de concurrencia (409)');
    expect(mockIssuesService.getIssueById).toHaveBeenCalledWith('issue-100');
  });

  it('RF-020: debe cargar candidatos para Coordinador al consultar la novedad y permitir seleccionar menciones en Comentarios', () => {
    mockAuthService.isDirector.mockReturnValue(false);
    mockAuthService.isCoordinator.mockReturnValue(true);
    mockAuthService.isAdmin.mockReturnValue(false);

    const mockIssue: any = {
      id: 'issue-200',
      code: 'NOV-2026-0060',
      scope: 'PROPIEDAD',
      title: 'Avería de bomba',
      priority: 'MEDIA',
      initialPriority: 'MEDIA',
      status: 'EN_REVISION',
      propertyId: 'prop-1',
    };
    mockIssuesService.getIssueById.mockReturnValue(of(mockIssue));
    mockIssuesService.getCandidates.mockReturnValue(
      of([
        {
          id: 'coord-1',
          firstName: 'Juan',
          lastName: 'Coordinador',
          role: 'COORDINADOR_OPERATIVO',
          isLead: true,
          scopeAuthorized: true,
        },
      ]),
    );

    component.loadIssue('issue-200');
    fixture.detectChanges();

    // Comprobar que los candidatos se cargaron aunque el usuario sea Coordinador
    expect(mockIssuesService.getCandidates).toHaveBeenCalledWith('issue-200');
    expect(component.candidates()).toHaveLength(1);
    expect(component.candidates()[0].id).toBe('coord-1');

    // Cambiar a la pestaña de comentarios
    component.selectTab('comentarios');
    fixture.detectChanges();

    expect(component.activeTab()).toBe('comentarios');
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('@Juan Coordinador (COORDINADOR_OPERATIVO)');
  });

  it('RF-020: selectTab("comentarios") carga candidatos si aún no estaban disponibles', () => {
    mockAuthService.isAdmin.mockReturnValue(false);
    const mockIssue: any = {
      id: 'issue-300',
      code: 'NOV-2026-0070',
      title: 'Fuga de agua',
    };
    component.issue.set(mockIssue);
    component.candidates.set([]);

    mockIssuesService.getCandidates.mockReturnValue(
      of([
        {
          id: 'dir-1',
          firstName: 'Carlos',
          lastName: 'Director',
          role: 'DIRECTOR_OPERATIVO',
        },
      ]),
    );

    component.selectTab('comentarios');

    expect(mockIssuesService.getCandidates).toHaveBeenCalledWith('issue-300');
    expect(component.candidates()).toHaveLength(1);
    expect(component.activeTab()).toBe('comentarios');
  });
});

