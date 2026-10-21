import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { DashboardComponent } from './dashboard.component';
import { DashboardService } from '../../core/services/dashboard.service';
import { IssuesService } from '../../core/services/issues.service';
import { AuthService } from '../../core/services/auth.service';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let mockDashboardService: any;
  let mockIssuesService: any;
  let mockAuthService: any;

  const mockMetricsData: any = {
    period: {
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-10-31T23:59:59.999Z',
      cutoffDate: '2026-10-31T23:59:59.999Z',
      timezone: 'America/Bogota (UTC-5)',
    },
    kpis: {
      totalRegisteredInPeriod: 15,
      totalClosedInPeriod: 10,
      totalOpenAtCutoff: 5,
      totalDiscardedInPeriod: 1,
      totalCriticalInPeriod: 2,
      averageResolutionHours: 36,
      averageResolutionDays: 1.5,
    },
    activities: {
      totalActivities: 25,
      completed: 20,
      inProgress: 3,
      pending: 1,
      blocked: 1,
      canceled: 0,
      completionRatePercent: 80,
    },
    byStatus: [
      { status: 'CERRADA', count: 10, percentage: 66.7 },
      { status: 'EN_ATENCION', count: 5, percentage: 33.3 },
    ],
    byPriority: [
      { priority: 'CRITICA', count: 2, percentage: 13.3 },
      { priority: 'ALTA', count: 5, percentage: 33.3 },
      { priority: 'MEDIA', count: 8, percentage: 53.4 },
    ],
    byCategory: [
      { categoryId: 'cat-1', categoryName: 'Plomería', scope: 'PROPIEDAD', count: 7, percentage: 46.7 },
    ],
    byLocation: [
      {
        id: 'prop-1',
        name: 'Torres del Parque',
        scope: 'PROPIEDAD',
        code: 'TDP',
        totalRegistered: 10,
        openAtCutoff: 3,
        closedInPeriod: 7,
        criticalCount: 1,
      },
    ],
    attentionRequiredCases: [
      {
        id: 'issue-10',
        code: 'NOV-2026-0010',
        title: 'Fuga de agua en motobomba',
        scope: 'PROPIEDAD',
        locationName: 'Torres del Parque',
        priority: 'CRITICA',
        status: 'EN_ATENCION',
        createdAt: '2026-10-10T10:00:00.000Z',
        daysOpen: 10,
        hasBlockedActivities: true,
        assignedUserName: 'Juan Coordinador',
      },
    ],
  };

  beforeEach(async () => {
    mockDashboardService = {
      getMetrics: vi.fn().mockReturnValue(of(mockMetricsData)),
    };

    mockIssuesService = {
      getProperties: vi.fn().mockReturnValue(of([{ id: 'prop-1', name: 'Torres del Parque' }])),
      getInternalAreas: vi.fn().mockReturnValue(of([{ id: 'area-1', name: 'Operaciones' }])),
    };

    mockAuthService = {
      currentUser: vi.fn().mockReturnValue({
        id: 'dir-1',
        email: 'director@sigproh.local',
        role: 'DIRECTOR_OPERATIVO',
      }),
      isDirector: vi.fn().mockReturnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: DashboardService, useValue: mockMetricsData ? mockDashboardService : {} },
        { provide: IssuesService, useValue: mockIssuesService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  it('debe crearse y cargar métricas para el usuario autenticado', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
    expect(mockDashboardService.getMetrics).toHaveBeenCalled();
    expect(component.metrics()).toEqual(mockMetricsData);
  });

  it('renderiza tarjetas de KPIs y banner de fecha de corte en el DOM', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.dashboard-title')?.textContent).toContain('Tablero de Control');
    expect(compiled.querySelector('.period-banner')?.textContent).toContain('Fecha de Corte');

    // KPI values
    const kpiValues = compiled.querySelectorAll('.kpi-value');
    expect(kpiValues.length).toBe(6);
    expect(compiled.textContent).toContain('15'); // totalRegisteredInPeriod
    expect(compiled.textContent).toContain('10'); // totalClosedInPeriod
    expect(compiled.textContent).toContain('5'); // totalOpenAtCutoff
  });

  it('muestra la tabla de casos con atención prioritaria requerida', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.attention-box')).toBeTruthy();
    expect(compiled.textContent).toContain('NOV-2026-0010');
    expect(compiled.textContent).toContain('Fuga de agua en motobomba');
    expect(compiled.textContent).toContain('⚠️ Actividad Bloqueada');
  });

  it('aplica preajustes de período correctamente (LAST_30_DAYS, THIS_YEAR)', () => {
    component.applyPreset('LAST_30_DAYS');
    expect(component.selectedPreset).toBe('LAST_30_DAYS');
    expect(component.filterStartDate).toBeTruthy();
    expect(component.filterEndDate).toBeTruthy();

    component.applyPreset('THIS_YEAR');
    expect(component.selectedPreset).toBe('THIS_YEAR');
    expect(component.filterStartDate).toContain('-01-01');
    expect(component.filterEndDate).toContain('-12-31');
  });

  it('muestra mensaje explicativo ante un 403 Forbidden', () => {
    const error403 = new HttpErrorResponse({
      status: 403,
      statusText: 'Forbidden',
      error: { message: 'Acceso denegado' },
    });
    mockDashboardService.getMetrics.mockReturnValue(throwError(() => error403));

    component.loadMetrics();
    fixture.detectChanges();

    expect(component.metrics()).toBeNull();
    expect(component.errorMessage()).toContain('Acceso denegado (403)');
  });
});
