import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
});
