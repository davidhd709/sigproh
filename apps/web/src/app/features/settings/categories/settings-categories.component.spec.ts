import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { SettingsCategoriesComponent } from './settings-categories.component';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';

describe('SettingsCategoriesComponent', () => {
  const categories = [
    { id: 'c1', scope: 'PROPIEDAD', name: 'Ascensores', description: null, requiresEvidence: true, isActive: true },
    { id: 'c2', scope: 'INTERNA', name: 'Sistemas', description: null, requiresEvidence: false, isActive: true },
  ];

  it('agrupa por ámbito y el interruptor invierte la exigencia de evidencia', () => {
    const admin = {
      listCategories: vi.fn().mockReturnValue(of(categories)),
      updateCategory: vi.fn().mockReturnValue(of({})),
    };
    TestBed.configureTestingModule({
      imports: [SettingsCategoriesComponent],
      providers: [
        provideRouter([]),
        { provide: AdminService, useValue: admin },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'd', role: 'DIRECTOR_OPERATIVO' }) } },
      ],
    });
    const fixture = TestBed.createComponent(SettingsCategoriesComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    const [props, internal] = component.groups();
    expect(props.items.map((c) => c.id)).toEqual(['c1']);
    expect(internal.items.map((c) => c.id)).toEqual(['c2']);

    component.toggleEvidence(categories[0] as any);
    expect(admin.updateCategory).toHaveBeenCalledWith('c1', { requiresEvidence: false });
  });
});
