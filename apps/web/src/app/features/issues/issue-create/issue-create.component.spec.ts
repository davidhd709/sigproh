import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { IssueCreateComponent } from './issue-create.component';
import { IssuesService } from '../../../core/services/issues.service';
import { AuthService } from '../../../core/services/auth.service';
import { IssueDraftService } from '../../../core/services/issue-draft.service';

const aux = { id: 'user-aux', organizationId: 'org-1', email: 'auxiliar@sigproh.local', role: 'AUXILIAR_GERENCIA' };
const coord = { id: 'user-coord', organizationId: 'org-1', email: 'coordinador1@sigproh.local', role: 'COORDINADOR_OPERATIVO' };

describe('IssueCreateComponent', () => {
  let component: IssueCreateComponent;
  let fixture: ComponentFixture<IssueCreateComponent>;
  let mockIssuesService: any;
  let mockAuthService: any;
  let activeUser: any;

  const mount = async () => {
    fixture = TestBed.createComponent(IssueCreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const fillValidForm = (c: IssueCreateComponent) => {
    c.scope = 'PROPIEDAD';
    c.propertyId = 'prop-1';
    c.categoryId = 'cat-1';
    c.title = 'Fuga en el sótano';
    c.description = 'Torre B, sótano: sale agua de la pared';
    c.priority = 'ALTA';
  };

  beforeEach(async () => {
    localStorage.clear();
    activeUser = aux;
    mockIssuesService = {
      getCategories: vi.fn().mockReturnValue(of([])),
      getProperties: vi.fn().mockReturnValue(of([])),
      getInternalAreas: vi.fn().mockReturnValue(of([])),
      createIssue: vi.fn(),
      uploadAttachment: vi.fn().mockReturnValue(of({})),
    };

    mockAuthService = {
      currentUser: vi.fn(() => activeUser),
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

    await mount();
  });

  it('debe crearse correctamente', () => {
    expect(component).toBeTruthy();
  });

  it('PEN-03: el Auxiliar de Gerencia puede registrar novedades', () => {
    mockIssuesService.createIssue.mockReturnValue(of({ id: 'new-issue-aux', code: 'NOV-2026-0001' }));
    fillValidForm(component);

    component.onSubmit();

    expect(mockIssuesService.createIssue).toHaveBeenCalled();
    expect(component.phase()).toBe('done');
  });

  it('RN-001: Bloquea la creación de novedades para Administrador de Sistema', () => {
    mockAuthService.isAdmin.mockReturnValue(true);
    fillValidForm(component);

    component.onSubmit();

    expect(mockIssuesService.createIssue).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('Administrador del Sistema tiene aislamiento operativo');
  });

  describe('ubicación', () => {
    it('elige sola la única propiedad disponible y no pregunta el tipo de ubicación', async () => {
      mockIssuesService.getProperties.mockReturnValue(of([{ id: 'prop-unica', name: 'Torres del Parque', zones: [] }]));
      await mount();

      expect(component.propertyId).toBe('prop-unica');
      expect(component.showScopeChoice()).toBe(false);
    });

    it('si solo tiene áreas de la empresa, cambia a ese tipo y elige la única', async () => {
      mockIssuesService.getInternalAreas.mockReturnValue(of([{ id: 'area-1', name: 'Operaciones' }]));
      await mount();

      expect(component.scope).toBe('INTERNA');
      expect(component.internalAreaId).toBe('area-1');
      expect(mockIssuesService.getCategories).toHaveBeenCalledWith('INTERNA');
    });

    it('con varias ubicaciones ofrece «Conjunto o edificio» y «Área de la empresa»', async () => {
      mockIssuesService.getProperties.mockReturnValue(of([{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }]));
      mockIssuesService.getInternalAreas.mockReturnValue(of([{ id: 'a1', name: 'Operaciones' }]));
      await mount();

      const text = (fixture.nativeElement as HTMLElement).textContent;
      expect(text).toContain('Conjunto o edificio');
      expect(text).toContain('Área de la empresa');
      expect(text).toContain('Primero elige el conjunto o edificio para ver sus zonas.');
      expect(component.propertyId).toBe('');
    });
  });

  describe('errores', () => {
    it('marca todos los campos que faltan en español y lleva el foco al primero', async () => {
      Element.prototype.scrollIntoView = vi.fn();
      component.scope = 'PROPIEDAD';
      component.propertyId = 'prop-1';
      component.categoryId = '';
      component.title = '';
      component.description = 'Fuga en la tubería';

      component.onSubmit();
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));

      expect(mockIssuesService.createIssue).not.toHaveBeenCalled();
      expect(component.fieldErrors()).toEqual({ categoryId: 'Elige una categoría.', title: 'Escribe un título corto.' });
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('#title-error')?.textContent).toContain('Escribe un título corto.');
      expect(document.activeElement?.id).toBe('categoryId');

      // Lo escrito se conserva y al corregir desaparece la marca
      expect(component.description).toBe('Fuga en la tubería');
      component.clearFieldError('title');
      expect(component.errorFor('title')).toBeNull();
    });

    it('ubica junto al campo los mensajes del servidor', () => {
      fillValidForm(component);
      mockIssuesService.createIssue.mockReturnValue(
        throwError(() => ({ status: 400, error: { message: ['Escribe un título corto'] } })),
      );

      component.onSubmit();

      expect(component.errorFor('title')).toBe('Escribe un título corto.');
      expect(component.phase()).toBe('editing');
    });

    it('explica qué archivo se rechazó y cómo corregirlo, sin perder lo escrito', () => {
      component.title = 'Fuga';
      const heic = new File(['img'], 'IMG_0001.heic', { type: 'image/heic' });
      component.onFilesSelected({ target: { files: [heic], value: 'x' } } as unknown as Event, 'PHOTO');

      expect(component.photos()).toHaveLength(0);
      expect(component.fileWarning()[0]).toContain('IMG_0001.heic');
      expect(component.fileWarning()[0]).toContain('JPG, PNG o WEBP');
      expect(component.title).toBe('Fuga');
    });
  });

  describe('borrador por usuario y organización', () => {
    it('sobrevive a salir y volver: ofrece Continuar y recupera lo escrito', async () => {
      fillValidForm(component);
      component.onEdit();
      fixture.destroy();

      await mount();

      expect(component.draftOffer()?.fields.title).toBe('Fuga en el sótano');
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Continuar borrador');
      component.continueDraft();
      expect(component.title).toBe('Fuga en el sótano');
      expect(component.description).toBe('Torre B, sótano: sale agua de la pared');
      expect(component.propertyId).toBe('prop-1');
    });

    it('otra cuenta en el mismo equipo no ve el borrador; al volver la primera, sigue ahí', async () => {
      fillValidForm(component);
      component.onEdit();
      fixture.destroy();

      activeUser = coord;
      await mount();
      expect(component.draftOffer()).toBeNull();
      expect(component.title).toBe('');

      fixture.destroy();
      activeUser = aux;
      await mount();
      expect(component.draftOffer()?.fields.title).toBe('Fuga en el sótano');
      expect(localStorage.getItem(IssueDraftService.storageKey(aux))).not.toBeNull();
    });

    it('Descartar borrador lo elimina', async () => {
      fillValidForm(component);
      component.onEdit();
      fixture.destroy();
      await mount();

      component.discardDraft();

      expect(localStorage.getItem(IssueDraftService.storageKey(aux))).toBeNull();
      expect(component.title).toBe('');
    });

    it('avisa qué archivos hay que volver a elegir al recuperar el borrador', async () => {
      URL.createObjectURL = vi.fn().mockReturnValue('blob:preview');
      fillValidForm(component);
      const photo = new File(['img'], 'fuga.jpg', { type: 'image/jpeg' });
      component.onFilesSelected({ target: { files: [photo], value: 'x' } } as unknown as Event, 'PHOTO');
      fixture.destroy();
      await mount();

      component.continueDraft();

      expect(component.filesToReselect()).toEqual(['fuga.jpg']);
    });
  });

  describe('envío y reintentos', () => {
    it('envía un identificador de operación y evita el doble toque', () => {
      const pending = new Subject<any>();
      mockIssuesService.createIssue.mockReturnValue(pending);
      fillValidForm(component);

      component.onSubmit();
      component.onSubmit();

      expect(mockIssuesService.createIssue).toHaveBeenCalledTimes(1);
      expect(mockIssuesService.createIssue.mock.calls[0][0].clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(component.loading()).toBe(true);
    });

    it('sin respuesta del servidor queda «Pendiente de envío» y Reintentar usa el mismo identificador', async () => {
      fillValidForm(component);
      mockIssuesService.createIssue.mockReturnValueOnce(throwError(() => ({ status: 0 })));

      component.onSubmit();

      expect(component.phase()).toBe('unconfirmed');
      expect(component.title).toBe('Fuga en el sótano');
      const firstId = mockIssuesService.createIssue.mock.calls[0][0].clientRequestId;

      // Recargar la página: el borrador conserva el estado y el identificador
      fixture.destroy();
      await mount();
      expect(component.draftOffer()?.status).toBe('PENDIENTE_ENVIO');
      component.continueDraft();
      expect(component.phase()).toBe('unconfirmed');

      // El servidor ya lo había guardado: responde con el mismo caso
      mockIssuesService.createIssue.mockReturnValueOnce(
        of({ id: 'issue-1', code: 'NOV-2026-0042', title: 'Fuga en el sótano', replayed: true }),
      );
      component.onSubmit();

      expect(mockIssuesService.createIssue.mock.calls[1][0].clientRequestId).toBe(firstId);
      expect(component.phase()).toBe('done');
      expect(component.outcome()?.issue.code).toBe('NOV-2026-0042');
      expect(localStorage.getItem(IssueDraftService.storageKey(aux))).toBeNull();
    });

    it('muestra «Novedad registrada» con el código real y los enlaces a la novedad y a la lista', () => {
      fillValidForm(component);
      mockIssuesService.createIssue.mockReturnValue(
        of({ id: 'issue-9', code: 'NOV-2026-0009', title: 'Fuga', assignedUser: { firstName: 'Juan', lastName: 'Pérez' }, assignedUserId: 'u-juan' }),
      );

      component.onSubmit();
      fixture.detectChanges();

      const text = (fixture.nativeElement as HTMLElement).textContent;
      expect(text).toContain('Novedad registrada');
      expect(text).toContain('NOV-2026-0009');
      expect(text).toContain('Juan Pérez');
      expect(text).toContain('Ver novedad');
      expect(text).toContain('Volver a la lista');
    });

    it('sube fotos como INICIAL y cotización como SOPORTE, cada una con su identificador', () => {
      URL.createObjectURL = vi.fn().mockReturnValue('blob:preview');
      const photo = new File(['img'], 'fuga.jpg', { type: 'image/jpeg' });
      const quote = new File(['pdf'], 'cotizacion.pdf', { type: 'application/pdf' });
      mockIssuesService.createIssue.mockReturnValue(of({ id: 'new-1', code: 'NOV-2026-0001' }));
      fillValidForm(component);

      component.onFilesSelected({ target: { files: [photo], value: 'x' } } as unknown as Event, 'PHOTO');
      component.onFilesSelected({ target: { files: [quote], value: 'x' } } as unknown as Event, 'QUOTE');
      component.onSubmit();

      const calls = mockIssuesService.uploadAttachment.mock.calls;
      expect(calls[0].slice(0, 3)).toEqual(['new-1', photo, 'INICIAL']);
      expect(calls[1].slice(0, 3)).toEqual(['new-1', quote, 'SOPORTE']);
      expect(calls[0][4]).not.toBe(calls[1][4]);
    });

    it('si falla una foto informa ambos resultados y el reintento solo repite esa foto, con el mismo identificador', () => {
      URL.createObjectURL = vi.fn().mockReturnValue('blob:preview');
      const ok = new File(['img'], 'fuga.jpg', { type: 'image/jpeg' });
      const bad = new File(['img'], 'otra.png', { type: 'image/png' });
      mockIssuesService.createIssue.mockReturnValue(of({ id: 'new-2', code: 'NOV-2026-0002' }));
      mockIssuesService.uploadAttachment
        .mockReturnValueOnce(of({}))
        .mockReturnValueOnce(throwError(() => ({ status: 0 })))
        .mockReturnValueOnce(of({}));
      fillValidForm(component);

      component.onFilesSelected({ target: { files: [ok, bad], value: 'x' } } as unknown as Event, 'PHOTO');
      component.onSubmit();
      fixture.detectChanges();

      expect(component.outcome()?.issue.code).toBe('NOV-2026-0002');
      expect(component.failedFiles().map((f) => f.file.name)).toEqual(['otra.png']);
      const text = (fixture.nativeElement as HTMLElement).textContent;
      expect(text).toContain('Novedad registrada');
      expect(text).toContain('otra.png');

      const failedId = mockIssuesService.uploadAttachment.mock.calls[1][4];
      component.retryUploads();

      expect(mockIssuesService.uploadAttachment).toHaveBeenCalledTimes(3);
      expect(mockIssuesService.uploadAttachment.mock.calls[2][1]).toBe(bad);
      expect(mockIssuesService.uploadAttachment.mock.calls[2][4]).toBe(failedId);
      expect(component.failedFiles()).toHaveLength(0);
    });

    it('permite registrar una novedad CRÍTICA sin «qué se hizo de inmediato»', () => {
      mockIssuesService.createIssue.mockReturnValue(of({ id: 'new-issue-1', code: 'NOV-2026-0003' }));
      fillValidForm(component);
      component.priority = 'CRITICA';
      component.urgentMeasures = '';

      component.onSubmit();

      expect(mockIssuesService.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'CRITICA', urgentMeasures: undefined }),
      );
    });

    it('envía «qué se hizo de inmediato» como medida urgente solo si es crítica', () => {
      mockIssuesService.createIssue.mockReturnValue(of({ id: 'x', code: 'NOV-2026-0004' }));
      fillValidForm(component);
      component.priority = 'CRITICA';
      component.urgentMeasures = 'Se cerró la llave de paso';

      component.onSubmit();

      expect(mockIssuesService.createIssue.mock.calls[0][0].urgentMeasures).toBe('Se cerró la llave de paso');
    });
  });

  it('vacía las categorías y muestra mensaje de error si falla la carga al cambiar de tipo de ubicación', () => {
    component.categories.set([{ id: 'cat-prop-1', name: 'Fachadas' }] as any);
    mockIssuesService.getCategories.mockReturnValue(throwError(() => new Error('Network error')));

    component.onScopeChange('INTERNA');

    expect(component.categories()).toEqual([]);
    expect(component.errorMessage()).toContain('Error al cargar las categorías');
  });
});
