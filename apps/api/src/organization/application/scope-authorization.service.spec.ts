import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { ScopeAuthorizationService } from './scope-authorization.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';

describe('ScopeAuthorizationService', () => {
  const organizationId = 'org-1';

  const directorUser: AuthenticatedUser = {
    id: 'user-dir',
    organizationId,
    email: 'director@sigproh.local',
    role: Role.DIRECTOR_OPERATIVO,
  };

  const gerenteUser: AuthenticatedUser = {
    id: 'user-ger',
    organizationId,
    email: 'gerencia@sigproh.local',
    role: Role.GERENTE,
  };

  const coordinadorUser: AuthenticatedUser = {
    id: 'user-coord',
    organizationId,
    email: 'coord@sigproh.local',
    role: Role.COORDINADOR_OPERATIVO,
  };

  it('debe permitir acceso global a cualquier propiedad para el Director Operativo', async () => {
    const mockPrisma = {
      property: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'prop-1',
          organizationId,
          isActive: true,
        }),
      },
      propertyAssignment: {
        findUnique: vi.fn(),
      },
    };

    const service = new ScopeAuthorizationService(mockPrisma as any);

    const hasAccess = await service.validatePropertyAccess(directorUser, 'prop-1');
    expect(hasAccess).toBe(true);
    expect(mockPrisma.propertyAssignment.findUnique).not.toHaveBeenCalled();
  });

  it('debe permitir acceso global para Gerencia', async () => {
    const mockPrisma = {
      property: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'prop-2',
          organizationId,
          isActive: true,
        }),
      },
    };

    const service = new ScopeAuthorizationService(mockPrisma as any);

    const hasAccess = await service.validatePropertyAccess(gerenteUser, 'prop-2');
    expect(hasAccess).toBe(true);
  });

  it('debe permitir acceso a un coordinador si tiene asignación activa en la propiedad', async () => {
    const mockPrisma = {
      property: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'prop-1',
          organizationId,
          isActive: true,
        }),
      },
      propertyAssignment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'assign-1',
          propertyId: 'prop-1',
          userId: coordinadorUser.id,
          isActive: true,
        }),
      },
    };

    const service = new ScopeAuthorizationService(mockPrisma as any);

    const hasAccess = await service.validatePropertyAccess(coordinadorUser, 'prop-1');
    expect(hasAccess).toBe(true);
    expect(mockPrisma.propertyAssignment.findUnique).toHaveBeenCalledWith({
      where: {
        propertyId_userId: {
          propertyId: 'prop-1',
          userId: coordinadorUser.id,
        },
      },
    });
  });

  it('CP-02: debe denegar acceso con ForbiddenException si el coordinador no tiene asignación', async () => {
    const mockPrisma = {
      property: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'prop-ajena',
          organizationId,
          isActive: true,
        }),
      },
      propertyAssignment: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const service = new ScopeAuthorizationService(mockPrisma as any);

    await expect(
      service.validatePropertyAccess(coordinadorUser, 'prop-ajena'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('CP-02: debe denegar acceso si la asignación del coordinador está inactiva', async () => {
    const mockPrisma = {
      property: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'prop-1',
          organizationId,
          isActive: true,
        }),
      },
      propertyAssignment: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'assign-1',
          propertyId: 'prop-1',
          userId: coordinadorUser.id,
          isActive: false,
        }),
      },
    };

    const service = new ScopeAuthorizationService(mockPrisma as any);

    await expect(
      service.validatePropertyAccess(coordinadorUser, 'prop-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('debe lanzar NotFoundException si la propiedad pertenece a otra organización', async () => {
    const mockPrisma = {
      property: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'prop-otra-org',
          organizationId: 'org-ajena',
          isActive: true,
        }),
      },
    };

    const service = new ScopeAuthorizationService(mockPrisma as any);

    await expect(
      service.validatePropertyAccess(directorUser, 'prop-otra-org'),
    ).rejects.toThrow(NotFoundException);
  });

  it('RF-049: getAccessiblePropertyIds debe retornar null para Director y Gerente, y lista de IDs para Coordinador', async () => {
    const mockPrisma = {
      propertyAssignment: {
        findMany: vi.fn().mockResolvedValue([
          { propertyId: 'prop-1' },
          { propertyId: 'prop-3' },
        ]),
      },
    };

    const service = new ScopeAuthorizationService(mockPrisma as any);

    const dirIds = await service.getAccessiblePropertyIds(directorUser);
    expect(dirIds).toBeNull();

    const gerIds = await service.getAccessiblePropertyIds(gerenteUser);
    expect(gerIds).toBeNull();

    const coordIds = await service.getAccessiblePropertyIds(coordinadorUser);
    expect(coordIds).toEqual(['prop-1', 'prop-3']);
  });
});
