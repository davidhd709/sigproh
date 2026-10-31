import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { PropertiesService } from './properties.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';

describe('PropertiesService', () => {
  const organizationId = 'org-1';
  const director: AuthenticatedUser = { id: 'dir-1', organizationId, email: 'director@sigproh.local', role: Role.DIRECTOR_OPERATIVO };

  const usersById: Record<string, { role: Role }> = {
    'coord-1': { role: Role.COORDINADOR_OPERATIVO },
    'coord-2': { role: Role.COORDINADOR_OPERATIVO },
    'dir-1': { role: Role.DIRECTOR_OPERATIVO },
    'dir-2': { role: Role.DIRECTOR_OPERATIVO },
    'ger-1': { role: Role.GERENTE },
  };

  const buildPrisma = (extra: any = {}) => {
    const tx: any = {
      property: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'prop-1', ...data })) },
      propertyAssignment: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve(create)),
      },
    };
    const prisma: any = {
      property: {
        findUnique: vi.fn().mockImplementation(({ where }) =>
          Promise.resolve(where.organizationId_code ? null : { id: 'prop-1', organizationId }),
        ),
      },
      user: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          const u = usersById[where.id];
          return Promise.resolve(u ? { id: where.id, organizationId, isActive: true, ...u } : null);
        }),
      },
      propertyAssignment: {
        findUnique: vi.fn().mockResolvedValue({ id: 'asg-1', isActive: true }),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      ...extra,
    };
    return { prisma, tx, service: new PropertiesService(prisma, {} as any) };
  };

  it('crea la propiedad con su coordinador principal y su director responsable', async () => {
    const { tx, service } = buildPrisma();

    await service.create(director, { name: 'Torre Norte', code: 'tn', coordinatorId: 'coord-1', directorId: 'dir-1' });

    expect(tx.property.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: 'TN' }) }));
    expect(tx.propertyAssignment.createMany).toHaveBeenCalledWith({
      data: [
        { propertyId: 'prop-1', userId: 'coord-1', isLead: true, isActive: true },
        { propertyId: 'prop-1', userId: 'dir-1', isLead: true, isActive: true },
      ],
    });
  });

  it('rechaza crear la propiedad si el "director" elegido no tiene ese rol', async () => {
    const { tx, service } = buildPrisma();

    await expect(
      service.create(director, { name: 'Torre Sur', code: 'TS', coordinatorId: 'coord-1', directorId: 'ger-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.property.create).not.toHaveBeenCalled();
  });

  it('al asignar un nuevo director, el anterior deja de ser el responsable', async () => {
    const { tx, service } = buildPrisma();

    await service.assignCoordinator(director, 'prop-1', { userId: 'dir-2' });

    expect(tx.propertyAssignment.updateMany).toHaveBeenCalledWith({
      where: { propertyId: 'prop-1', isActive: true, userId: { not: 'dir-2' }, user: { role: Role.DIRECTOR_OPERATIVO } },
      data: { isActive: false, isLead: false },
    });
    expect(tx.propertyAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ userId: 'dir-2', isLead: true }) }),
    );
  });

  it('no permite asignar a la Gerencia a una propiedad', async () => {
    const { service } = buildPrisma();

    await expect(service.assignCoordinator(director, 'prop-1', { userId: 'ger-1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no permite retirar al único coordinador o al único director', async () => {
    const { prisma, service } = buildPrisma();

    await expect(service.removeAssignment(director, 'prop-1', 'coord-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.removeAssignment(director, 'prop-1', 'dir-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.propertyAssignment.update).not.toHaveBeenCalled();
  });

  it('permite retirar un coordinador si queda otro', async () => {
    const { prisma, service } = buildPrisma();
    prisma.propertyAssignment.count.mockResolvedValue(1);

    await service.removeAssignment(director, 'prop-1', 'coord-2');

    expect(prisma.propertyAssignment.update).toHaveBeenCalled();
  });
});
