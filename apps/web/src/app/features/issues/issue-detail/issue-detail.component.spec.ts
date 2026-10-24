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
      uploadAttachment: vi.fn(),
      listAttachments: vi.fn().mockReturnValue(of([])),
      downloadAttachment: vi.fn(),
      requestClosure: vi.fn(),
      closeIssue: vi.fn(),
      returnIssue: vi.fn(),
      reopenIssue: vi.fn(),
      discardIssue: vi.fn(),
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
    expect(compiled.textContent).toContain('No pudimos abrir esta novedad');
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
    expect(compiled.textContent).toContain('@Juan Coordinador (Coordinador operativo)');
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

  describe('F4: Evidencias y Adjuntos (RF-021, RF-022)', () => {
    it('debe rechazar la subida si no hay un archivo seleccionado', () => {
      const mockIssue: any = { id: 'issue-400', code: 'NOV-2026-0080' };
      component.issue.set(mockIssue);
      component.selectedFile = null;

      component.submitUploadEvidence();

      expect(component.errorMessage()).toContain('Debe seleccionar un archivo válido');
      expect(mockIssuesService.uploadAttachment).not.toHaveBeenCalled();
    });

    it('debe subir la evidencia con la etapa seleccionada y recargar la novedad', () => {
      const mockIssue: any = { id: 'issue-400', code: 'NOV-2026-0080' };
      component.issue.set(mockIssue);
      const testFile = new File(['dummy content'], 'reporte.pdf', { type: 'application/pdf' });
      component.selectedFile = testFile;
      component.selectedEvidenceStage = 'FINAL';
      component.selectedEvidenceActivityId = 'act-1';

      mockIssuesService.uploadAttachment.mockReturnValue(
        of({ id: 'att-1', fileName: 'reporte.pdf', stage: 'FINAL' }),
      );
      mockIssuesService.getIssueById.mockReturnValue(of(mockIssue));

      component.submitUploadEvidence();

      expect(mockIssuesService.uploadAttachment).toHaveBeenCalledWith(
        'issue-400',
        testFile,
        'FINAL',
        'act-1',
      );
      expect(component.successMessage()).toContain('Evidencia adjuntada exitosamente');
      expect(component.selectedFile).toBeNull();
      expect(mockIssuesService.getIssueById).toHaveBeenCalledWith('issue-400');
    });

    it('debe invocar downloadAttachment al solicitar descarga', () => {
      const mockIssue: any = { id: 'issue-400', code: 'NOV-2026-0080' };
      component.issue.set(mockIssue);
      const att: any = { id: 'att-10', fileName: 'foto.jpg', stage: 'INICIAL', fileSize: 1024 };

      const blob = new Blob(['image data'], { type: 'image/jpeg' });
      mockIssuesService.downloadAttachment.mockReturnValue(of(blob));

      // Mock DOM methods used in downloadEvidence
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test');
      const mockRevokeObjectURL = vi.fn();
      window.URL.createObjectURL = mockCreateObjectURL;
      window.URL.revokeObjectURL = mockRevokeObjectURL;

      component.downloadEvidence(att);

      expect(mockIssuesService.downloadAttachment).toHaveBeenCalledWith('issue-400', 'att-10');
      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
    });
  });

  describe('F5: Cierre Operativo, Verificación, Devolución, Reapertura y Descarte', () => {
    it('hasMissingFinalEvidence retorna true si la categoría exige evidencia y no hay FINAL', () => {
      const mockIssue: any = {
        id: 'issue-500',
        category: { name: 'Mantenimiento Correctivo', requiresEvidence: true },
        attachments: [
          { id: 'att-1', stage: 'INICIAL' },
          { id: 'att-2', stage: 'EJECUCION' },
        ],
      };
      component.issue.set(mockIssue);

      expect(component.hasMissingFinalEvidence()).toBe(true);

      // Si se agrega una evidencia FINAL
      mockIssue.attachments.push({ id: 'att-3', stage: 'FINAL' });
      component.issue.set({ ...mockIssue });
      expect(component.hasMissingFinalEvidence()).toBe(false);
    });

    it('hasMissingFinalEvidence retorna false si la categoría NO exige evidencia', () => {
      const mockIssue: any = {
        id: 'issue-501',
        category: { name: 'Gestión Administrativa', requiresEvidence: false },
        attachments: [],
      };
      component.issue.set(mockIssue);

      expect(component.hasMissingFinalEvidence()).toBe(false);
    });

    it('solicitar cierre invoca requestClosure y actualiza la novedad', () => {
      const mockIssue: any = { id: 'issue-502', status: 'EN_ATENCION' };
      component.issue.set(mockIssue);
      component.closureNotes = 'Trabajo terminado satisfactoriamente';

      mockIssuesService.requestClosure.mockReturnValue(
        of({ id: 'issue-502', status: 'PENDIENTE_CIERRE' }),
      );
      mockIssuesService.getIssueById.mockReturnValue(of(mockIssue));

      component.submitRequestClosure();

      expect(mockIssuesService.requestClosure).toHaveBeenCalledWith('issue-502', {
        notes: 'Trabajo terminado satisfactoriamente',
      });
      expect(component.successMessage()).toContain('Solicitud de cierre enviada a la Dirección');
      expect(component.showRequestClosureModal()).toBe(false);
    });

    it('aprobar cierre definitivo como Director invoca closeIssue', () => {
      const mockIssue: any = { id: 'issue-503', status: 'PENDIENTE_CIERRE' };
      component.issue.set(mockIssue);
      component.closureObservations = 'Verificado en campo a conformidad';

      mockIssuesService.closeIssue.mockReturnValue(
        of({ id: 'issue-503', status: 'CERRADA' }),
      );
      mockIssuesService.getIssueById.mockReturnValue(of(mockIssue));

      component.submitClose();

      expect(mockIssuesService.closeIssue).toHaveBeenCalledWith('issue-503', {
        closureObservations: 'Verificado en campo a conformidad',
      });
      expect(component.successMessage()).toContain('Novedad cerrada definitivamente');
    });

    it('devolver novedad exige motivo obligatorio e invoca returnIssue', () => {
      const mockIssue: any = { id: 'issue-504', status: 'PENDIENTE_CIERRE' };
      component.issue.set(mockIssue);

      // Sin motivo
      component.returnReason = '   ';
      component.submitReturn();
      expect(component.errorMessage()).toContain('El motivo de devolución es obligatorio');
      expect(mockIssuesService.returnIssue).not.toHaveBeenCalled();

      // Con motivo
      component.returnReason = 'Falta ajustar la tornillería';
      mockIssuesService.returnIssue.mockReturnValue(
        of({ id: 'issue-504', status: 'EN_ATENCION' }),
      );
      mockIssuesService.getIssueById.mockReturnValue(of(mockIssue));

      component.submitReturn();

      expect(mockIssuesService.returnIssue).toHaveBeenCalledWith('issue-504', {
        reason: 'Falta ajustar la tornillería',
      });
      expect(component.successMessage()).toContain('Solicitud devuelta al responsable');
    });

    it('reabrir novedad cerrada exige motivo obligatorio e invoca reopenIssue', () => {
      const mockIssue: any = { id: 'issue-505', status: 'CERRADA' };
      component.issue.set(mockIssue);

      component.reopenReason = ' ';
      component.submitReopen();
      expect(component.errorMessage()).toContain('El motivo de reapertura es obligatorio');
      expect(mockIssuesService.reopenIssue).not.toHaveBeenCalled();

      component.reopenReason = 'Reincidencia de fuga de agua';
      mockIssuesService.reopenIssue.mockReturnValue(
        of({ id: 'issue-505', status: 'EN_ATENCION' }),
      );
      mockIssuesService.getIssueById.mockReturnValue(of(mockIssue));

      component.submitReopen();

      expect(mockIssuesService.reopenIssue).toHaveBeenCalledWith('issue-505', {
        reason: 'Reincidencia de fuga de agua',
      });
      expect(component.successMessage()).toContain('Novedad reabierta formalmente');
    });

    it('descartar novedad exige motivo obligatorio e invoca discardIssue', () => {
      const mockIssue: any = { id: 'issue-506', status: 'REGISTRADA' };
      component.issue.set(mockIssue);

      component.discardReason = '';
      component.submitDiscard();
      expect(component.errorMessage()).toContain('El motivo de descarte es obligatorio');
      expect(mockIssuesService.discardIssue).not.toHaveBeenCalled();

      component.discardReason = 'Reporte duplicado de la novedad NOV-2026-0001';
      mockIssuesService.discardIssue.mockReturnValue(
        of({ id: 'issue-506', status: 'DESCARTADA' }),
      );
      mockIssuesService.getIssueById.mockReturnValue(of(mockIssue));

      component.submitDiscard();

      expect(mockIssuesService.discardIssue).toHaveBeenCalledWith('issue-506', {
        reason: 'Reporte duplicado de la novedad NOV-2026-0001',
      });
      expect(component.successMessage()).toContain('Novedad descartada formalmente');
    });
  });
  describe('Ficha: siguiente paso, progreso y fotos', () => {
    const baseIssue: any = {
      id: 'issue-900',
      priority: 'MEDIA',
      initialPriority: 'MEDIA',
      assignedUserId: 'coord-1',
      category: { name: 'Equipos', requiresEvidence: false },
      attachments: [],
    };

    it('para el Director con la novedad pendiente de cierre, la acción principal es aprobar el cierre', () => {
      component.issue.set({ ...baseIssue, status: 'PENDIENTE_CIERRE' });

      expect(component.primaryAction()?.key).toBe('approve-closure');
      expect(component.moreActions().map((a) => a.key)).toContain('return');
    });

    it('para el Director sin responsable confirmado, la acción principal es confirmar responsable', () => {
      component.issue.set({ ...baseIssue, status: 'EN_REVISION', assignedUserId: null });

      expect(component.primaryAction()?.key).toBe('confirm-responsible');
    });

    it('un rol de consulta (Gerencia) no tiene acciones disponibles', () => {
      mockAuthService.isDirector.mockReturnValue(false);
      mockAuthService.currentUser.mockReturnValue({ id: 'ger-1', role: 'GERENTE' });
      component.issue.set({ ...baseIssue, status: 'CERRADA' });

      expect(component.primaryAction()).toBeNull();
    });

    it('ubica cada estado en su etapa del flujo', () => {
      component.issue.set({ ...baseIssue, status: 'EN_REVISION' });
      expect(component.currentStep()).toBe(0);
      component.issue.set({ ...baseIssue, status: 'EN_ATENCION' });
      expect(component.currentStep()).toBe(2);
      component.issue.set({ ...baseIssue, status: 'CERRADA' });
      expect(component.currentStep()).toBe(4);
    });

    it('separa las fotos de los demás documentos', () => {
      mockIssuesService.downloadAttachment.mockReturnValue(of(new Blob()));
      component.issue.set({
        ...baseIssue,
        status: 'ASIGNADA',
        attachments: [
          { id: 'a1', mimeType: 'image/jpeg', stage: 'INICIAL', fileName: 'foto.jpg' },
          { id: 'a2', mimeType: 'application/pdf', stage: 'SOPORTE', fileName: 'cotizacion.pdf' },
        ],
      });

      expect(component.photoAttachments().map((a) => a.id)).toEqual(['a1']);
      expect(component.documentAttachments().map((a) => a.id)).toEqual(['a2']);
    });
  });
});

