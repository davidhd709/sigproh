import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { ReportCreateComponent } from './report-create.component';
import { ReportService } from '../../../core/services/report.service';
import { IssuesService } from '../../../core/services/issues.service';
import { AuthService } from '../../../core/services/auth.service';

describe('ReportCreateComponent', () => {
  let component: ReportCreateComponent;
  let fixture: ComponentFixture<ReportCreateComponent>;
  let mockReportService: any;
  let mockIssuesService: any;
  let mockAuthService: any;
  let router: Router;

  beforeEach(async () => {
    mockReportService = {
      createDraft: vi.fn().mockReturnValue(
        of({
          id: 'rep-new-123',
          code: 'INF-2026-0001',
          status: 'BORRADOR',
        }),
      ),
    };

    mockIssuesService = {
      getProperties: vi.fn().mockReturnValue(
        of([{ id: 'prop-1', name: 'Torres del Parque', code: 'TDP' }]),
      ),
      getInternalAreas: vi.fn().mockReturnValue(
        of([{ id: 'area-1', name: 'Mantenimiento General', code: 'MG' }]),
      ),
    };

    mockAuthService = {
      currentUser: signal({
        id: 'user-1',
        email: 'director@sigproh.local',
        role: 'DIRECTOR_OPERATIVO',
        organizationId: 'org-1',
      }),
    };

    await TestBed.configureTestingModule({
      imports: [ReportCreateComponent],
      providers: [
        provideRouter([]),
        { provide: ReportService, useValue: mockReportService },
        { provide: IssuesService, useValue: mockIssuesService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate');

    fixture = TestBed.createComponent(ReportCreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('debe inicializarse con el catálogo de propiedades y títulos por defecto', () => {
    expect(component).toBeTruthy();
    expect(component.properties().length).toBe(1);
    expect(component.propertyId).toBe('prop-1');
    expect(component.title).toContain('Torres del Parque');
  });

  it('debe cambiar de ámbito y actualizar el título', () => {
    component.scope = 'INTERNA';
    component.onScopeChange();
    expect(component.internalAreaId).toBe('area-1');
    expect(component.title).toContain('Mantenimiento General');
  });

  it('debe crear el borrador exitosamente y navegar al detalle (RF-031)', () => {
    component.title = 'Informe Validado';
    component.onSubmit();
    expect(mockReportService.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'PROPIEDAD',
        title: 'Informe Validado',
      }),
    );
    expect(router.navigate).toHaveBeenCalledWith(['/reports', 'rep-new-123']);
  });

  it('debe validar campos obligatorios antes de enviar', () => {
    component.title = '';
    component.onSubmit();
    expect(component.errorMessage()).toContain('obligatorio');
    expect(mockReportService.createDraft).not.toHaveBeenCalled();
  });
});
