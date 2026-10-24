import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { IssueScope, Role } from '../../generated/prisma/client';
import { CategoriesService } from './categories.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';

describe('CategoriesService', () => {
  const organizationId = 'org-1';
  const admin: AuthenticatedUser = { id: 'admin-1', organizationId, email: 'admin@sigproh.local', role: Role.ADMINISTRADOR };

  it('crea la categoría exigiendo evidencia final por defecto', async () => {
    const prisma: any = {
      category: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
    };
    const service = new CategoriesService(prisma);

    const created = await service.create(admin, { scope: IssueScope.PROPIEDAD, name: '  Ascensores ' });

    expect(created).toEqual(expect.objectContaining({ name: 'Ascensores', requiresEvidence: true, organizationId }));
  });

  it('rechaza un nombre repetido dentro del mismo ámbito', async () => {
    const prisma: any = { category: { findUnique: vi.fn().mockResolvedValue({ id: 'c1' }), create: vi.fn() } };
    const service = new CategoriesService(prisma);

    await expect(service.create(admin, { scope: IssueScope.INTERNA, name: 'Sistemas' })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('no permite editar categorías de otra organización', async () => {
    const prisma: any = { category: { findUnique: vi.fn().mockResolvedValue({ id: 'c1', organizationId: 'otra' }), update: vi.fn() } };
    const service = new CategoriesService(prisma);

    await expect(service.update(admin, 'c1', { isActive: false })).rejects.toBeInstanceOf(NotFoundException);
  });
});
