import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../../generated/prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const createMockContext = (headers: Record<string, string> = {}, isPublic = false) => {
    const request: any = { headers };
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(isPublic),
    } as unknown as Reflector;

    const context = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue(request),
      }),
    } as unknown as ExecutionContext;

    return { context, reflector, request };
  };

  it('debe permitir acceso si la ruta está marcada con @Public()', async () => {
    const { context, reflector } = createMockContext({}, true);
    const jwtService = { verifyAsync: vi.fn() } as unknown as JwtService;

    const guard = new JwtAuthGuard(jwtService, reflector, {} as any);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('debe lanzar UnauthorizedException si no se envía header Authorization', async () => {
    const { context, reflector } = createMockContext({});
    const jwtService = { verifyAsync: vi.fn() } as unknown as JwtService;

    const guard = new JwtAuthGuard(jwtService, reflector, {} as any);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Token de autenticación ausente'),
    );
  });

  it('debe validar el token y asignar request.user con el rol si el usuario está activo', async () => {
    const payload = {
      sub: 'user-1',
      organizationId: 'org-1',
      email: 'director@sigproh.local',
      role: Role.DIRECTOR_OPERATIVO,
    };

    const { context, reflector, request } = createMockContext({
      authorization: 'Bearer valid.jwt.token',
    });

    const jwtService = {
      verifyAsync: vi.fn().mockResolvedValue(payload),
    } as unknown as JwtService;

    const prismaService = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          organizationId: 'org-1',
          email: 'director@sigproh.local',
          role: Role.DIRECTOR_OPERATIVO,
          isActive: true,
        }),
      },
    } as any;

    const guard = new JwtAuthGuard(jwtService, reflector, prismaService);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({
      id: 'user-1',
      organizationId: 'org-1',
      email: 'director@sigproh.local',
      role: Role.DIRECTOR_OPERATIVO,
    });
  });

  it('debe denegar con UnauthorizedException si el usuario fue desactivado aunque el token sea válido', async () => {
    const payload = {
      sub: 'user-1',
      organizationId: 'org-1',
      email: 'coord@sigproh.local',
      role: Role.COORDINADOR_OPERATIVO,
    };

    const { context, reflector } = createMockContext({
      authorization: 'Bearer valid.jwt.token',
    });

    const jwtService = {
      verifyAsync: vi.fn().mockResolvedValue(payload),
    } as unknown as JwtService;

    const prismaService = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          organizationId: 'org-1',
          email: 'coord@sigproh.local',
          role: Role.COORDINADOR_OPERATIVO,
          isActive: false, // Desactivado
        }),
      },
    } as any;

    const guard = new JwtAuthGuard(jwtService, reflector, prismaService);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Usuario inactivo o dado de baja'),
    );
  });

  it('debe lanzar UnauthorizedException si el token es inválido o expiró', async () => {
    const { context, reflector } = createMockContext({
      authorization: 'Bearer token.invalido',
    });

    const jwtService = {
      verifyAsync: vi.fn().mockRejectedValue(new Error('jwt expired')),
    } as unknown as JwtService;

    const guard = new JwtAuthGuard(jwtService, reflector, {} as any);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Token de autenticación inválido o expirado'),
    );
  });
});
