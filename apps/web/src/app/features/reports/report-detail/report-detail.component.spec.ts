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
      finalize: vi.fn().mockReturnValue(of({ ...mockReportDetail, status: 'APROBADO' })),
      reviewReport: vi.fn().mockImplementation((id: string, dto: any) =>
        of({ ...mockReportDetail, status: dto.decision, approvalNotes: dto.notes })
      ),
      createNewVersion: vi.fn().mockReturnValue(of({ ...mockReportDetail, version: 2, status: 'BORRADOR' })),
      distributeReport: vi.fn().mockReturnValue(of({ id: 'dist-1', recipient: 'Junta Directiva' })),
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

    component.setTab('VERSIONS');
    expect(component.activeTab).toBe('VERSIONS');

    component.setTab('DISTRIBUTIONS');
    expect(component.activeTab).toBe('DISTRIBUTIONS');
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

  describe('Gobernanza y Ciclo de Vida (Fase 8: RF-037 a RF-042, CP-21 a CP-28)', () => {
    it('debe finalizar el informe cuando el autor confirma la acción (RF-037, CP-21)', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      expect(component.canFinalize()).toBe(true);
      component.finalize();

      expect(mockReportService.finalize).toHaveBeenCalledWith('rep-uuid-1');
      expect(component.report()?.status).toBe('APROBADO');
    });

    it('no debe finalizar si el usuario cancela la confirmación', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      component.finalize();

      expect(mockReportService.finalize).not.toHaveBeenCalled();
    });

    it('un coordinador que no es el autor no puede editar ni finalizar el borrador', () => {
      mockAuthService.currentUser.set({
        id: 'user-otro',
        email: 'coord2@sigproh.local',
        role: 'COORDINADOR_OPERATIVO',
        organizationId: 'org-1',
      });

      expect(component.canEdit()).toBe(false);
      expect(component.canFinalize()).toBe(false);
    });

    it('debe abrir modal de aprobación y aprobar formalmente el informe (RF-038, CP-24)', () => {
      component.report.set({ ...mockReportDetail, status: 'EN_REVISION' });
      expect(component.canReview()).toBe(true);

      component.openApproveModal();
      expect(component.showApprovalModal()).toBe(true);

      component.approvalNotes = 'Aprobado formalmente para asamblea';
      component.submitApproval();

      expect(mockReportService.reviewReport).toHaveBeenCalledWith('rep-uuid-1', {
        decision: 'APROBADO',
        notes: 'Aprobado formalmente para asamblea',
      });
      expect(component.showApprovalModal()).toBe(false);
      expect(component.report()?.status).toBe('APROBADO');
    });

    it('debe abrir modal de devolución y devolver informe con notas obligatorias (RF-039, RN-130, CP-23)', () => {
      component.report.set({ ...mockReportDetail, status: 'EN_REVISION' });

      component.openReturnModal();
      expect(component.showReturnModal()).toBe(true);

      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      component.returnNotes = '';
      component.submitReturn();
      expect(alertSpy).toHaveBeenCalled();
      expect(mockReportService.reviewReport).not.toHaveBeenCalled();

      component.returnNotes = 'Falta adjuntar fotografía de la bomba hidroneumática.';
      component.submitReturn();

      expect(mockReportService.reviewReport).toHaveBeenCalledWith('rep-uuid-1', {
        decision: 'DEVUELTO',
        notes: 'Falta adjuntar fotografía de la bomba hidroneumática.',
      });
      expect(component.showReturnModal()).toBe(false);
      expect(component.report()?.status).toBe('DEVUELTO');
    });

    it('debe permitir crear una nueva versión de un informe aprobado (RF-040, RF-041, CP-25, CP-26)', () => {
      component.report.set({ ...mockReportDetail, status: 'APROBADO', version: 1 });
      expect(component.canCreateNewVersion()).toBe(true);

      component.openNewVersionModal();
      expect(component.showVersionModal()).toBe(true);

      component.newVersionReason = 'Actualización con datos complementarios';
      component.submitNewVersion();

      expect(mockReportService.createNewVersion).toHaveBeenCalledWith('rep-uuid-1', {
        reason: 'Actualización con datos complementarios',
      });
      expect(component.showVersionModal()).toBe(false);
      expect(component.report()?.version).toBe(2);
      expect(component.report()?.status).toBe('BORRADOR');
    });

    it('debe registrar distribución oficial con destinatario obligatorio (RF-042, CP-27, CP-28)', () => {
      component.report.set({ ...mockReportDetail, status: 'APROBADO' });
      expect(component.canDistribute()).toBe(true);

      component.openDistributionModal();
      expect(component.showDistributionModal()).toBe(true);

      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      component.distributionRecipient = '';
      component.submitDistribution();
      expect(alertSpy).toHaveBeenCalled();
      expect(mockReportService.distributeReport).not.toHaveBeenCalled();

      component.distributionRecipient = 'consejo@torresdelparque.com';
      component.distributionChannel = 'CORREO_ELECTRONICO';
      component.distributionNotes = 'Envío formal del informe mensual aprobado';
      component.submitDistribution();

      expect(mockReportService.distributeReport).toHaveBeenCalledWith('rep-uuid-1', {
        recipient: 'consejo@torresdelparque.com',
        channel: 'CORREO_ELECTRONICO',
        deliveryDate: expect.any(String),
        notes: 'Envío formal del informe mensual aprobado',
      });
      expect(component.showDistributionModal()).toBe(false);
    });
  });
});
