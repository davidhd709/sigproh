import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthSessionService } from './auth-session.service';
import { RefreshTokenService } from './refresh-token.service';

describe('AuthSessionService', () => {
  const user = { id: 'u1', organizationId: 'o1', email: 'a@x', firstName: 'A', lastName: 'B', role: 'GERENTE', isActive: true, passwordHash: 'h' };
  const refreshTokens = new RefreshTokenService();
  const accessTokens = { generate: vi.fn().mockResolvedValue('access-jwt') };
  const hasher = { hash: vi.fn().mockResolvedValue('new-hash'), verify: vi.fn() };

  const build = (session: any) => {
    const prisma: any = {
      refreshSession: {
        findUnique: vi.fn().mockResolvedValue(session),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findUnique: vi.fn().mockResolvedValue(user), update: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockImplementation((ops) => Promise.all(ops)),
    };
    return { prisma, service: new AuthSessionService(prisma, refreshTokens, accessTokens as any, hasher as any) };
  };

  const future = () => new Date(Date.now() + 86_400_000);

  it('rota el token: revoca el anterior, crea uno nuevo y entrega un token de acceso', async () => {
    const { prisma, service } = build({ id: 's1', userId: 'u1', revokedAt: null, expiresAt: future(), user });

    const issued = await service.rotate('token-viejo');

    expect(issued.accessToken).toBe('access-jwt');
    expect(issued.refreshToken).not.toBe('token-viejo');
    expect(prisma.refreshSession.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' } }));
    expect(prisma.refreshSession.create).toHaveBeenCalled();
  });

  it('un token recién rotado (otra pestaña) responde 409 sin cerrar las sesiones', async () => {
    const { prisma, service } = build({ id: 's1', userId: 'u1', revokedAt: new Date(Date.now() - 2_000), expiresAt: future(), user });

    await expect(service.rotate('t')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.refreshSession.updateMany).not.toHaveBeenCalled();
  });

  it('reutilizar un token viejo se trata como robo: cierra todas las sesiones del usuario', async () => {
    const { prisma, service } = build({ id: 's1', userId: 'u1', revokedAt: new Date(Date.now() - 600_000), expiresAt: future(), user });

    await expect(service.rotate('t')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }));
  });

  it('rechaza sesiones expiradas, de usuarios desactivados o sin cookie', async () => {
    await expect(build({ id: 's', userId: 'u1', revokedAt: null, expiresAt: new Date(Date.now() - 1), user }).service.rotate('t')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(build({ id: 's', userId: 'u1', revokedAt: null, expiresAt: future(), user: { ...user, isActive: false } }).service.rotate('t')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(build(null).service.rotate(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('cambiar contraseña exige la actual, cierra las demás sesiones y abre una nueva', async () => {
    const { prisma, service } = build(null);
    hasher.verify.mockResolvedValueOnce(false);
    await expect(service.changePassword({ id: 'u1' } as any, 'mala', 'NuevaClave2026')).rejects.toBeInstanceOf(BadRequestException);

    hasher.verify.mockResolvedValueOnce(true);
    const issued = await service.changePassword({ id: 'u1' } as any, 'Actual2026!!', 'NuevaClave2026');

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { passwordHash: 'new-hash' } });
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }));
    expect(prisma.refreshSession.create).toHaveBeenCalled();
    expect(issued.accessToken).toBe('access-jwt');
  });

  it('no acepta una contraseña nueva igual a la actual', async () => {
    const { service } = build(null);
    hasher.verify.mockResolvedValueOnce(true);
    await expect(service.changePassword({ id: 'u1' } as any, 'MismaClave2026', 'MismaClave2026')).rejects.toThrow('distinta');
  });
});
