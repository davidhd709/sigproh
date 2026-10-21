import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { ReportsListComponent } from './reports-list.component';
import { ReportService } from '../../../core/services/report.service';
import { AuthService } from '../../../core/services/auth.service';
import { ReportListItem } from '../../../core/models/report.model';

describe('ReportsListComponent', () => {
  let component: ReportsListComponent;
  let fixture: ComponentFixture<ReportsListComponent>;
  let mockReportService: any;
  let mockAuthService: any;

  const mockReportsData: ReportListItem[] = [
    {
      id: 'rep-1',
      code: 'INF-2026-0001',
      scope: 'PROPIEDAD',
      title: 'Informe Mayo — Torres del Parque',
      propertyName: 'Torres del Parque',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
      cutoffDate: '2026-05-31',
      status: 'BORRADOR',
      version: 1,
      createdByName: 'Carlos Director',
      createdAt: '2026-05-15T10:00:00.000Z',
      updatedAt: '2026-05-15T10:00:00.000Z',
    },
    {
      id: 'rep-2',
      code: 'INF-2026-0002',
      scope: 'INTERNA',
      title: 'Informe Mantenimiento Preventivo',
      internalAreaName: 'Mantenimiento General',
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
      cutoffDate: '2026-05-31',
      status: 'APROBADO',
      version: 1,
      createdByName: 'Carlos Director',
      createdAt: '2026-05-16T10:00:00.000Z',
      updatedAt: '2026-05-16T10:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    mockReportService = {
      getReports: vi.fn().mockReturnValue(of(mockReportsData)),
      downloadPdf: vi.fn().mockReturnValue(of(new Blob(['fake pdf'], { type: 'application/pdf' }))),
      downloadExcel: vi.fn().mockReturnValue(of(new Blob(['fake xlsx'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))),
      deleteDraft: vi.fn().mockReturnValue(of({ success: true, message: 'Borrador eliminado' })),
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
      imports: [ReportsListComponent],
      providers: [
        provideRouter([]),
        { provide: ReportService, useValue: mockReportService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('debe inicializarse y cargar la lista de informes', () => {
    expect(component).toBeTruthy();
    expect(mockReportService.getReports).toHaveBeenCalled();
    expect(component.reports().length).toBe(2);
    expect(component.isLoading()).toBe(false);
  });

  it('debe filtrar los informes al cambiar el ámbito o estado', () => {
    component.selectedScope = 'PROPIEDAD';
    component.onFilterChange();
    expect(mockReportService.getReports).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'PROPIEDAD' }),
    );
  });

  it('debe llamar a downloadPdf cuando se presiona descargar PDF', () => {
    const fakeEvent = { stopPropagation: vi.fn() } as any;
    component.downloadPdf(fakeEvent, mockReportsData[0]);
    expect(mockReportService.downloadPdf).toHaveBeenCalledWith('rep-1');
  });

  it('debe llamar a downloadExcel cuando se presiona exportar Excel', () => {
    const fakeEvent = { stopPropagation: vi.fn() } as any;
    component.downloadExcel(fakeEvent, mockReportsData[0]);
    expect(mockReportService.downloadExcel).toHaveBeenCalledWith('rep-1');
  });

  it('debe manejar errores de carga adecuadamente', () => {
    mockReportService.getReports.mockReturnValue(
      throwError(() => ({ error: { message: 'Fallo al consultar reportes' } })),
    );
    component.loadReports();
    expect(component.errorMessage()).toBe('Fallo al consultar reportes');
    expect(component.isLoading()).toBe(false);
  });
});
