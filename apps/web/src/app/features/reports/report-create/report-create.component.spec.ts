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

  describe('título sugerido', () => {
    const typeInto = (selector: string, value: string, event = 'input') => {
      const el = (fixture.nativeElement as HTMLElement).querySelector(selector) as HTMLInputElement;
      el.value = value;
      el.dispatchEvent(new Event('input'));
      if (event !== 'input') el.dispatchEvent(new Event(event));
      fixture.detectChanges();
    };

    afterEach(() => vi.useRealTimers());

    it('sigue las fechas elegidas: octubre de 2026 dice «Octubre 2026»', async () => {
      await fixture.whenStable();
      typeInto('#periodStart', '2026-10-01', 'change');
      typeInto('#periodEnd', '2026-10-31', 'change');
      expect(component.title).toBe('Informe Operativo — Torres del Parque (Octubre 2026)');
    });

    it('«Mes anterior» en noviembre propone octubre, no el mes actual', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-13T15:00:00Z'));
      component.applyPreset('LAST_MONTH');
      expect([component.periodStart, component.periodEnd, component.cutoffDate]).toEqual([
        '2026-10-01',
        '2026-10-31',
        '2026-10-31',
      ]);
      expect(component.title).toContain('(Octubre 2026)');
      expect(component.title).not.toContain('Noviembre');
    });

    it('al cambiar la ubicación se actualiza el nombre', () => {
      component.properties.set([
        { id: 'prop-1', name: 'Torres del Parque' },
        { id: 'prop-2', name: 'Reserva de la Plaza' },
      ]);
      component.propertyId = 'prop-2';
      component.updateDefaultTitle();
      expect(component.title).toContain('Reserva de la Plaza');

      component.scope = 'INTERNA';
      component.onScopeChange();
      expect(component.title).toContain('Mantenimiento General');
    });

    it('un título escrito a mano se conserva al cambiar período y ubicación, y es el que se envía', async () => {
      await fixture.whenStable();
      typeInto('#title', 'Informe para la asamblea');
      expect(component.titleEdited).toBe(true);

      component.applyPreset('LAST_MONTH');
      component.scope = 'INTERNA';
      component.onScopeChange();
      expect(component.title).toBe('Informe para la asamblea');

      component.onSubmit();
      expect(mockReportService.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Informe para la asamblea' }),
      );
    });

    it('si se borra el título a mano, vuelve el sugerido', async () => {
      await fixture.whenStable();
      typeInto('#title', 'Mi título');
      typeInto('#title', '');
      expect(component.titleEdited).toBe(false);
      expect(component.title).toContain('Torres del Parque');
    });

    it('describe el rango del período', () => {
      const label = ReportCreateComponent.periodLabel;
      expect(label('2026-10-01', '2026-10-31')).toBe('Octubre 2026');
      expect(label('2026-10-15', '2026-11-13')).toBe('Octubre – Noviembre 2026');
      expect(label('2025-12-15', '2026-01-13')).toBe('Diciembre 2025 – Enero 2026');
      expect(label('2026-01-01', '2026-12-31')).toBe('2026');
      expect(label('', '')).toBe('');
    });
  });
});
