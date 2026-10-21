import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { ReportDetailComponent } from './report-detail.component';
import { ReportService } from '../../../core/services/report.service';
import { AuthService } from '../../../core/services/auth.service';
import { ReportDetail } from '../../../core/models/report.model';

describe('ReportDetailComponent', () => {
  let component: ReportDetailComponent;
  let fixture: ComponentFixture<ReportDetailComponent>;
  let mockReportService: any;
  let mockAuthService: any;

  const mockReportDetail: ReportDetail = {
    id: 'rep-uuid-1',
    code: 'INF-2026-0001',
    scope: 'PROPIEDAD',
    title: 'Informe Operativo Mayo — Torres del Parque',
    propertyId: 'prop-1',
    propertyName: 'Torres del Parque',
    internalAreaId: null,
    periodStart: '2026-05-01',
    periodEnd: '2026-05-31',
    cutoffDate: '2026-05-31',
    status: 'BORRADOR',
    version: 1,
    introduction: 'Intro original',
    observations: 'Obs original',
    recommendations: 'Rec original',
    finalComments: null,
    selectedAttachmentIds: ['att-1'],
    showIntroduction: true,
    showKpis: true,
    showIssuesList: true,
    showActivities: true,
    showEvidences: true,
    showPendingIssues: true,
    showObservations: true,
    showRecommendations: true,
    showFinalComments: true,
    operationalData: {
      period: {
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        cutoffDate: '2026-05-31',
        timezone: 'America/Bogota (UTC-5)',
      },
      kpis: {
        totalRegisteredInPeriod: 10,
        totalClosedInPeriod: 7,
        totalOpenAtCutoff: 3,
        totalDiscardedInPeriod: 0,
        totalCriticalInPeriod: 1,
        averageResolutionHours: 24,
        averageResolutionDays: 1,
      },
      activities: {
        totalActivities: 15,
        completed: 12,
        inProgress: 2,
        pending: 1,
        blocked: 0,
        canceled: 0,
        completionRatePercent: 80,
      },
      byStatus: [],
      byPriority: [],
      byCategory: [],
      issuesList: [],
      activitiesList: [],
      availableEvidences: [
        {
          id: 'att-1',
          issueId: 'iss-1',
          issueCode: 'NOV-2026-0001',
          stage: 'FINAL',
          fileName: 'foto_final.jpg',
          fileSize: 204800,
          mimeType: 'image/jpeg',
          storageKey: 'key-1',
          createdAt: '2026-05-10T12:00:00Z',
          uploadedByName: 'Juan Pérez',
        },
      ],
    },
    createdById: 'user-1',
    createdByName: 'Carlos Director',
    approvedById: null,
    approvedByName: null,
    approvedAt: null,
    approvalNotes: null,
    createdAt: '2026-05-15T10:00:00.000Z',
    updatedAt: '2026-05-15T10:00:00.000Z',
  };

  beforeEach(async () => {
    mockReportService = {
      getReportById: vi.fn().mockReturnValue(of(mockReportDetail)),
      updateDraft: vi.fn().mockReturnValue(of(mockReportDetail)),
      refreshSourceData: vi.fn().mockReturnValue(of(mockReportDetail)),
      downloadPdf: vi.fn().mockReturnValue(of(new Blob(['fake pdf'], { type: 'application/pdf' }))),
      downloadExcel: vi.fn().mockReturnValue(of(new Blob(['fake xlsx'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))),
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
      imports: [ReportDetailComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? 'rep-uuid-1' : null),
              },
            },
          },
        },
        { provide: ReportService, useValue: mockReportService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('debe inicializarse y cargar los detalles del informe', () => {
    expect(component).toBeTruthy();
    expect(mockReportService.getReportById).toHaveBeenCalledWith('rep-uuid-1');
    expect(component.report()?.code).toBe('INF-2026-0001');
    expect(component.editTitle).toBe('Informe Operativo Mayo — Torres del Parque');
  });

  it('debe permitir cambiar de pestaña', () => {
    component.setTab('EDIT_TEXTS');
    expect(component.activeTab).toBe('EDIT_TEXTS');

    component.setTab('EVIDENCES');
    expect(component.activeTab).toBe('EVIDENCES');
  });

  it('debe guardar cambios en el borrador (RF-033, CP-19)', () => {
    component.editObservations = 'Nuevas observaciones editadas';
    component.saveDraft();
    expect(mockReportService.updateDraft).toHaveBeenCalledWith(
      'rep-uuid-1',
      expect.objectContaining({
        observations: 'Nuevas observaciones editadas',
      }),
    );
  });

  it('debe permitir seleccionar y deseleccionar evidencias (RF-034)', () => {
    expect(component.isEvidenceSelected('att-1')).toBe(true);
    component.toggleEvidence('att-1');
    expect(component.isEvidenceSelected('att-1')).toBe(false);
    component.toggleEvidence('att-1');
    expect(component.isEvidenceSelected('att-1')).toBe(true);
  });

  it('debe llamar a downloadPdf al presionar descargar PDF (RF-036, CP-33)', () => {
    component.downloadPdf();
    expect(mockReportService.downloadPdf).toHaveBeenCalledWith('rep-uuid-1');
  });

  it('debe llamar a downloadExcel al presionar exportar Excel (RF-043, RN-098)', () => {
    component.downloadExcel();
    expect(mockReportService.downloadExcel).toHaveBeenCalledWith('rep-uuid-1');
  });
});
