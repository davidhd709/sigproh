import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { SettingsUsersComponent, generatePassword } from './settings-users.component';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';

describe('SettingsUsersComponent', () => {
  const users = [
    { id: 'u1', email: 'ana@x.co', firstName: 'Ana', lastName: 'Ruiz', role: 'COORDINADOR_OPERATIVO', isActive: true },
    { id: 'u2', email: 'luis@x.co', firstName: 'Luis', lastName: 'Gómez', role: 'GERENTE', isActive: true },
  ];

  const setup = (role: string) => {
    const admin = { listUsers: vi.fn().mockReturnValue(of(users)) };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SettingsUsersComponent],
      providers: [
        provideRouter([]),
        { provide: AdminService, useValue: admin },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'me', role }) } },
      ],
    });
    const fixture = TestBed.createComponent(SettingsUsersComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, admin, fixture };
  };

  it('genera contraseñas de 12 caracteres, con un dígito y sin caracteres ambiguos', () => {
    for (let i = 0; i < 50; i++) {
      const pwd = generatePassword();
      expect(pwd).toHaveLength(12);
      expect(pwd).toMatch(/\d/);
      expect(pwd).not.toMatch(/[0O1lI]/);
    }
  });

  it('un rol distinto de administrador ve el aviso y no consulta usuarios', () => {
    const { admin, fixture } = setup('DIRECTOR_OPERATIVO');
    expect(admin.listUsers).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Solo el administrador gestiona usuarios');
  });

  it('filtra por texto y por rol', () => {
    const { component } = setup('ADMINISTRADOR');
    expect(component.filtered().length).toBe(2);

    component.search.set('gómez');
    expect(component.filtered().map((u) => u.id)).toEqual(['u2']);

    component.search.set('');
    component.roleFilter.set('COORDINADOR_OPERATIVO');
    expect(component.filtered().map((u) => u.id)).toEqual(['u1']);
  });

  it('al abrir "Nuevo usuario" propone una contraseña inicial válida', () => {
    const { component } = setup('ADMINISTRADOR');
    component.openNew();
    expect(component.form.password.length).toBeGreaterThanOrEqual(10);
    expect(component.isNew()).toBe(true);
  });
});
