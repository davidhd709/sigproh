import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { UsersService } from './users.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';

describe('UsersService (administración de cuentas)', () => {
  const organizationId = 'org-1';
  const admin: AuthenticatedUser = { id: 'admin-1', organizationId, email: 'admin@sigproh.local', role: Role.ADMINISTRADOR };
  const hasher = { hash: vi.fn().mockResolvedValue('hashed'), verify: vi.fn() };

  const buildPrisma = (overrides: Record<string, any> = {}) => {
    const prisma: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data })),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'u', ...data })),
        count: vi.fn().mockResolvedValue(1),
      },
      refreshSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      ...overrides,
    };
    prisma.$transaction = vi.fn().mockImplementation((arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
    return prisma;
  };

  it('crea el usuario con el correo normalizado y la contraseña cifrada', async () => {
    const prisma = buildPrisma();
    const service = new UsersService(prisma, hasher as any);

    await service.create(admin, {
      email: '  Nuevo.Coord@SIGPROH.local ',
      firstName: 'Ana',
      lastName: 'Ruiz',
      role: Role.COORDINADOR_OPERATIVO,
      password: 'ClaveSegura2026',
    });

    expect(hasher.hash).toHaveBeenCalledWith('ClaveSegura2026');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'nuevo.coord@sigproh.local', passwordHash: 'hashed', organizationId }),
      }),
    );
  });

  it('rechaza un correo que ya existe en la organización', async () => {
    const prisma = buildPrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'otro' });
    const service = new UsersService(prisma, hasher as any);

    await expect(
      service.create(admin, { email: 'dup@sigproh.local', firstName: 'A', lastName: 'B', role: Role.GERENTE, password: 'ClaveSegura2026' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('impide que un administrador cambie su propio rol', async () => {
    const prisma = buildPrisma();
    prisma.user.findUnique.mockResolvedValue({ id: admin.id, organizationId, role: Role.ADMINISTRADOR, email: admin.email, isActive: true });
    const service = new UsersService(prisma, hasher as any);

    await expect(service.update(admin, admin.id, { role: Role.GERENTE })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('impide dejar la organización sin administradores activos', async () => {
    const prisma = buildPrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-2', organizationId, role: Role.ADMINISTRADOR, email: 'a2@x', isActive: true });
    prisma.user.count.mockResolvedValue(0);
    const service = new UsersService(prisma, hasher as any);

    await expect(service.update(admin, 'admin-2', { role: Role.GERENTE })).rejects.toThrow('al menos un administrador');
  });

  it('al cambiar el rol revoca las sesiones abiertas del usuario', async () => {
    const prisma = buildPrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u-1', organizationId, role: Role.COORDINADOR_OPERATIVO, email: 'c@x', isActive: true });
    const service = new UsersService(prisma, hasher as any);

    await service.update(admin, 'u-1', { role: Role.DIRECTOR_OPERATIVO });

    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u-1', revokedAt: null } }));
  });

  it('restablecer contraseña cifra la nueva clave y cierra las sesiones', async () => {
    const prisma = buildPrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'u-1', organizationId });
    const service = new UsersService(prisma, hasher as any);

    await service.resetPassword(admin, 'u-1', 'OtraClave2026!');

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-1' }, data: { passwordHash: 'hashed' } });
    expect(prisma.refreshSession.updateMany).toHaveBeenCalled();
  });
});
