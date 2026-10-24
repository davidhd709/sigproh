import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { IssueCreateComponent } from './issue-create.component';
import { IssuesService } from '../../../core/services/issues.service';
import { AuthService } from '../../../core/services/auth.service';

describe('IssueCreateComponent', () => {
  let component: IssueCreateComponent;
  let fixture: ComponentFixture<IssueCreateComponent>;
  let mockIssuesService: any;
  let mockAuthService: any;

  beforeEach(async () => {
    mockIssuesService = {
      getCategories: vi.fn().mockReturnValue(of([])),
      getProperties: vi.fn().mockReturnValue(of([])),
      getInternalAreas: vi.fn().mockReturnValue(of([])),
      createIssue: vi.fn(),
    };

    mockAuthService = {
      currentUser: vi.fn().mockReturnValue({
        id: 'user-aux',
        email: 'auxiliar@sigproh.local',
        role: 'AUXILIAR_GERENCIA',
      }),
      isDirector: vi.fn().mockReturnValue(false),
      isCoordinator: vi.fn().mockReturnValue(false),
      isAuxiliar: vi.fn().mockReturnValue(true),
      isManager: vi.fn().mockReturnValue(false),
      isAdmin: vi.fn().mockReturnValue(false),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [IssueCreateComponent],
      providers: [
        provideRouter([]),
        { provide: IssuesService, useValue: mockIssuesService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IssueCreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('debe crearse correctamente', () => {
    expect(component).toBeTruthy();
  });

  it('PEN-03: Bloquea la creación de cualquier novedad para Auxiliar de Gerencia', () => {
    component.title = 'Novedad de prueba';
    component.description = 'Detalle de prueba';
    component.categoryId = 'cat-1';
    component.propertyId = 'prop-1';
    component.priority = 'MEDIA';

    component.onSubmit();

    expect(mockIssuesService.createIssue).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('PEN-03');
    expect(component.errorMessage()).toContain('Auxiliar de Gerencia');
  });

  it('RN-001: Bloquea la creación de novedades para Administrador de Sistema', () => {
    mockAuthService.isAuxiliar.mockReturnValue(false);
    mockAuthService.isAdmin.mockReturnValue(true);

    component.title = 'Novedad de prueba';
    component.description = 'Detalle de prueba';
    component.categoryId = 'cat-1';
    component.propertyId = 'prop-1';

    component.onSubmit();

    expect(mockIssuesService.createIssue).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('Administrador del Sistema tiene aislamiento operativo');
  });

  it('permite registrar novedad CRÍTICA sin medidas urgentes previas para reportar de inmediato', () => {
    mockAuthService.isAuxiliar.mockReturnValue(false);
    mockAuthService.isAdmin.mockReturnValue(false);
    mockIssuesService.createIssue.mockReturnValue(of({ id: 'new-issue-1' }));

    component.title = 'Inundación sala de máquinas';
    component.description = 'Fuga severa de tubería principal';
    component.scope = 'PROPIEDAD';
    component.propertyId = 'prop-1';
    component.categoryId = 'cat-1';
    component.priority = 'CRITICA';
    component.urgentMeasures = ''; // Sin medidas previas

    component.onSubmit();

    expect(mockIssuesService.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Inundación sala de máquinas',
        priority: 'CRITICA',
        urgentMeasures: undefined,
      }),
    );
    expect(component.errorMessage()).toBeNull();
  });

  it('vacía las categorías y muestra mensaje de error si falla la carga de categorías al cambiar de ámbito', () => {
    component.categories.set([{ id: 'cat-prop-1', name: 'Fachadas' }] as any);
    mockIssuesService.getCategories.mockReturnValue(throwError(() => new Error('Network error')));

    component.onScopeChange('INTERNA');

    expect(component.categories()).toEqual([]);
    expect(component.errorMessage()).toContain('Error al cargar las categorías');
  });
  describe('fotos y cotización opcionales', () => {
    const fileEvent = (...files: File[]) => ({ target: { files, value: 'x' } }) as unknown as Event;
    const photo = new File(['img'], 'fuga.jpg', { type: 'image/jpeg' });
    const quote = new File(['pdf'], 'cotizacion.pdf', { type: 'application/pdf' });

    beforeEach(() => {
      vi.useFakeTimers();
      URL.createObjectURL = vi.fn().mockReturnValue('blob:preview');
      URL.revokeObjectURL = vi.fn();
      mockAuthService.isAuxiliar.mockReturnValue(false);
      component.title = 'Fuga en bombas';
      component.description = 'Filtración en sótano';
      component.propertyId = 'prop-1';
      component.categoryId = 'cat-1';
    });

    afterEach(() => vi.useRealTimers());

    it('sube las fotos como INICIAL y la cotización como SOPORTE después de crear la novedad', () => {
      mockIssuesService.createIssue.mockReturnValue(of({ id: 'new-1', code: 'NOV-2026-0001' }));
      mockIssuesService.uploadAttachment = vi.fn().mockReturnValue(of({}));

      component.onFilesSelected(fileEvent(photo), 'PHOTO');
      component.onFilesSelected(fileEvent(quote), 'QUOTE');
      component.onSubmit();

      expect(mockIssuesService.uploadAttachment).toHaveBeenCalledWith('new-1', photo, 'INICIAL');
      expect(mockIssuesService.uploadAttachment).toHaveBeenCalledWith('new-1', quote, 'SOPORTE');
      expect(component.successMessage()).toContain('NOV-2026-0001');
    });

    it('rechaza en el campo de fotos los archivos que no son imagen', () => {
      component.onFilesSelected(fileEvent(quote), 'PHOTO');

      expect(component.photos().length).toBe(0);
      expect(component.fileWarning()).toContain('cotizacion.pdf');
    });

    it('si una subida falla, conserva la novedad creada e informa qué archivo faltó', () => {
      mockIssuesService.createIssue.mockReturnValue(of({ id: 'new-2', code: 'NOV-2026-0002' }));
      mockIssuesService.uploadAttachment = vi
        .fn()
        .mockReturnValueOnce(of({}))
        .mockReturnValueOnce(throwError(() => ({ status: 400 })));

      component.onFilesSelected(fileEvent(photo, new File(['img'], 'otra.png', { type: 'image/png' })), 'PHOTO');
      component.onSubmit();

      expect(mockIssuesService.uploadAttachment).toHaveBeenCalledTimes(2);
      expect(component.errorMessage()).toContain('NOV-2026-0002');
      expect(component.errorMessage()).toContain('otra.png');
    });
  });
});
