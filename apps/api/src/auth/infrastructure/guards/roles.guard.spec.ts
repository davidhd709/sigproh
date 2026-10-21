import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../generated/prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const createMockContext = (user?: any): ExecutionContext => {
    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  it('debe permitir acceso si la ruta no requiere roles específicos', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);
    const context = createMockContext({ role: Role.COORDINADOR_OPERATIVO });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('debe permitir acceso si el usuario tiene el rol requerido', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([Role.DIRECTOR_OPERATIVO]),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);
    const context = createMockContext({ role: Role.DIRECTOR_OPERATIVO });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('debe denegar acceso con ForbiddenException si el usuario no tiene el rol requerido', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([Role.DIRECTOR_OPERATIVO]),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);
    const context = createMockContext({ role: Role.COORDINADOR_OPERATIVO });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('debe denegar acceso si el usuario no está en la petición', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([Role.ADMINISTRADOR]),
    } as unknown as Reflector;

    const guard = new RolesGuard(reflector);
    const context = createMockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
