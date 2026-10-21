import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';

describe('App', () => {
  let authService: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        AuthService,
      ],
    }).compileComponents();
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('debe mostrar la pantalla de inicio de sesión cuando no hay usuario autenticado', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.login-title')?.textContent).toContain('EG S.A.S.');
    expect(compiled.querySelector('#loginEmail')).toBeTruthy();
    expect(compiled.querySelector('#loginPassword')).toBeTruthy();
  });

  it('debe mostrar el navbar con la marca al estar autenticado', async () => {
    authService.currentUser.set({
      id: 'dir-1',
      email: 'director@sigproh.local',
      firstName: 'Carlos',
      lastName: 'Director Operativo',
      role: 'DIRECTOR_OPERATIVO',
    });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand-name')?.textContent).toContain('EG S.A.S.');
    expect(compiled.querySelector('.user-name')?.textContent).toContain('Carlos Director Operativo');
  });
});
