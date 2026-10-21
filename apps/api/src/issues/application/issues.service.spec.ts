import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  IssuePriority,
  IssueScope,
  Role,
} from '../../generated/prisma/client';
import { IssuesService } from './issues.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';

describe('IssuesService', () => {
  const organizationId = 'org-1';

  const directorUser: AuthenticatedUser = {
    id: 'user-dir',
    organizationId,
    email: 'director@sigproh.local',
    role: Role.DIRECTOR_OPERATIVO,
  };

  const coordinadorUser: AuthenticatedUser = {
    id: 'user-coord1',
    organizationId,
    email: 'coord1@sigproh.local',
    role: Role.COORDINADOR_OPERATIVO,
  };

  const auxiliarUser: AuthenticatedUser = {
    id: 'user-aux',
    organizationId,
    email: 'auxiliar@sigproh.local',
    role: Role.AUXILIAR_GERENCIA,
  };

  const adminUser: AuthenticatedUser = {
    id: 'user-admin',
    organizationId,
    email: 'admin@sigproh.local',
    role: Role.ADMINISTRADOR,
  };

  it('debe rechazar registro de novedades si el rol es Administrador por defecto', async () => {
    const service = new IssuesService({} as any, {} as any);

    await expect(
      service.create(adminUser, {
        scope: IssueScope.PROPIEDAD,
        title: 'Fuga de agua',
        description: 'En sótano',
        priority: IssuePriority.MEDIA,
        categoryId: 'cat-1',
        propertyId: 'prop-1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('PEN-03: debe rechazar creación de novedad crítica por parte del Auxiliar de Gerencia', async () => {
    const service = new IssuesService({} as any, {} as any);

    await expect(
      service.create(auxiliarUser, {
        scope: IssueScope.PROPIEDAD,
        title: 'Inundación masiva',
        description: 'Urgente',
        priority: IssuePriority.CRITICA,
        categoryId: 'cat-1',
        propertyId: 'prop-1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('debe rechazar novedad de propiedad si se envía un internalAreaId (incompatibilidad de ámbitos)', async () => {
    const service = new IssuesService({} as any, {} as any);

    await expect(
      service.create(coordinadorUser, {
        scope: IssueScope.PROPIEDAD,
        title: 'Fuga de agua',
        description: 'En sótano',
        priority: IssuePriority.MEDIA,
        categoryId: 'cat-1',
        propertyId: 'prop-1',
        internalAreaId: 'area-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('debe rechazar novedad interna si se envía un propertyId (incompatibilidad de ámbitos)', async () => {
    const service = new IssuesService({} as any, {} as any);

    await expect(
      service.create(coordinadorUser, {
        scope: IssueScope.INTERNA,
        title: 'Fallo de internet',
        description: 'Oficina principal',
        priority: IssuePriority.MEDIA,
        categoryId: 'cat-1',
        internalAreaId: 'area-1',
        propertyId: 'prop-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('debe rechazar si la categoría no coincide con el ámbito', async () => {
    const mockScopeAuth = {
      validatePropertyAccess: vi.fn().mockResolvedValue(true),
    };

    const mockPrisma = {
      category: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'cat-1',
          organizationId,
          scope: IssueScope.INTERNA, // Categoría interna intentada en propiedad
          isActive: true,
        }),
      },
    };

    const service = new IssuesService(mockPrisma as any, mockScopeAuth as any);

    await expect(
      service.create(coordinadorUser, {
        scope: IssueScope.PROPIEDAD,
        title: 'Mantenimiento',
        description: 'Detalle',
        priority: IssuePriority.MEDIA,
        categoryId: 'cat-1',
        propertyId: 'prop-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('debe generar código correlativo atómico e incluir sugerencia automática de responsable líder', async () => {
    const mockScopeAuth = {
      validatePropertyAccess: vi.fn().mockResolvedValue(true),
    };

    const mockPrisma = {
      category: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'cat-1',
          organizationId,
          scope: IssueScope.PROPIEDAD,
          isActive: true,
        }),
      },
      propertyAssignment: {
        findFirst: vi.fn().mockResolvedValue({
          userId: 'user-coord1',
          isLead: true,
        }),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        const tx = {
          issueSequence: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ lastValue: 6 }),
          },
          $queryRaw: vi.fn().mockResolvedValue([{ lastValue: 6 }]),
          issue: {
            count: vi.fn().mockResolvedValue(5),
            create: vi.fn().mockImplementation((args) => args.data),
          },
          issueEvent: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      }),
    };

    const service = new IssuesService(mockPrisma as any, mockScopeAuth as any);

    const issue = await service.create(coordinadorUser, {
      scope: IssueScope.PROPIEDAD,
      title: 'Ascensor detenido',
      description: 'Piso 4',
      priority: IssuePriority.ALTA,
      categoryId: 'cat-1',
      propertyId: 'prop-1',
    });

    expect(issue.code).toBe(`NOV-${new Date().getFullYear()}-0006`);
    expect(issue.suggestedUserId).toBe('user-coord1');
  });

  it('CP-06: Asignación principal solo permitida para el Director Operativo', async () => {
    const service = new IssuesService({} as any, {} as any);

    await expect(
      service.assignPrincipal(coordinadorUser, 'issue-1', {
        assignedUserId: 'user-coord2',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('RF-011: Debe rechazar candidato sin asignación activa en el ámbito de la novedad', async () => {
    const mockPrisma = {
      issue: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'issue-1',
          organizationId,
          scope: IssueScope.PROPIEDAD,
          propertyId: 'prop-1',
          assignedUserId: null,
        }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-coord2',
          organizationId,
          role: Role.COORDINADOR_OPERATIVO,
          isActive: true,
        }),
      },
    };

    const mockScopeAuth = {
      hasPropertyAccess: vi.fn().mockResolvedValue(false), // Sin asignación
    };

    const service = new IssuesService(mockPrisma as any, mockScopeAuth as any);

    await expect(
      service.assignPrincipal(directorUser, 'issue-1', {
        assignedUserId: 'user-coord2',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(mockScopeAuth.hasPropertyAccess).toHaveBeenCalled();
  });

  it('Reasignación de responsable exige motivo obligatorio', async () => {
    const mockPrisma = {
      issue: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'issue-1',
          organizationId,
          scope: IssueScope.PROPIEDAD,
          propertyId: 'prop-1',
          assignedUserId: 'user-coord1', // Ya tenía asignado
        }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-coord2',
          organizationId,
          role: Role.COORDINADOR_OPERATIVO,
          isActive: true,
        }),
      },
    };

    const mockScopeAuth = {
      hasPropertyAccess: vi.fn().mockResolvedValue(true),
    };

    const service = new IssuesService(mockPrisma as any, mockScopeAuth as any);

    await expect(
      service.assignPrincipal(directorUser, 'issue-1', {
        assignedUserId: 'user-coord2',
        reason: '', // Motivo vacío
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('RF-014: Reclasificar a CRITICA genera evento y alerta al Director en la misma transacción', async () => {
    const createNotificationMock = vi.fn().mockResolvedValue({});
    const mockPrisma = {
      issue: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'issue-1',
          organizationId,
          priority: IssuePriority.MEDIA,
          code: 'NOV-2026-0001',
          title: 'Fuga leve',
        }),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        const tx = {
          issue: {
            update: vi.fn().mockResolvedValue({
              id: 'issue-1',
              priority: IssuePriority.CRITICA,
            }),
          },
          issueEvent: {
            create: vi.fn().mockResolvedValue({}),
          },
          user: {
            findMany: vi.fn().mockResolvedValue([{ id: 'user-dir' }]),
          },
          notification: {
            create: createNotificationMock,
          },
        };
        return callback(tx);
      }),
    };

    const service = new IssuesService(mockPrisma as any, {} as any);

    const updated = await service.updatePriority(directorUser, 'issue-1', {
      priority: IssuePriority.CRITICA,
      reason: 'El agua ha alcanzado el transformador eléctrico principal',
    });

    expect(updated.priority).toBe(IssuePriority.CRITICA);
    expect(createNotificationMock).toHaveBeenCalled();
  });

  it('Aislamiento del Administrador: no puede listar ni ver novedades operativas', async () => {
    const service = new IssuesService({} as any, {} as any);

    await expect(service.list(adminUser, {})).rejects.toThrow(ForbiddenException);
    await expect(service.findById(adminUser, 'issue-1')).rejects.toThrow(ForbiddenException);
  });

  it('Concurrencia: debe lanzar ConflictException (409) si la versión de la actividad no coincide', async () => {
    const mockPrisma = {
      issue: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'issue-1',
          organizationId,
          assignedUserId: 'user-coord1',
        }),
      },
      issueActivity: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'act-1',
          issueId: 'issue-1',
          version: 3, // En base de datos está en versión 3
          assignedUserId: 'user-coord1',
        }),
      },
    };

    const service = new IssuesService(mockPrisma as any, {} as any);

    await expect(
      service.updateActivity(coordinadorUser, 'issue-1', 'act-1', {
        status: 'EN_CURSO' as any,
        version: 1, // El cliente envía versión 1 obsoleta
      }),
    ).rejects.toThrow('Conflicto de concurrencia (409)');
  });

  it('CP-11: debe exigir statusReason al marcar la actividad como BLOQUEADA o CANCELADA', async () => {
    const mockPrisma = {
      issue: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'issue-1',
          organizationId,
          assignedUserId: 'user-coord1',
        }),
      },
      issueActivity: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'act-1',
          issueId: 'issue-1',
          version: 1,
          assignedUserId: 'user-coord1',
        }),
      },
    };

    const service = new IssuesService(mockPrisma as any, {} as any);

    await expect(
      service.updateActivity(coordinadorUser, 'issue-1', 'act-1', {
        status: 'BLOQUEADA' as any,
        version: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('Integridad: debe rechazar comentarios si activityId no pertenece a la novedad', async () => {
    const mockPrisma = {
      issue: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'issue-1',
          organizationId,
          scope: IssueScope.PROPIEDAD,
          propertyId: 'prop-1',
        }),
      },
      issueActivity: {
        findFirst: vi.fn().mockResolvedValue(null), // No existe o pertenece a otra novedad
      },
    };
    const mockScopeAuth = {
      validatePropertyAccess: vi.fn().mockResolvedValue(true),
    };

    const service = new IssuesService(mockPrisma as any, mockScopeAuth as any);

    await expect(
      service.createComment(coordinadorUser, 'issue-1', {
        content: 'Comentario de prueba',
        activityId: 'foreign-act-id',
      }),
    ).rejects.toThrow('La actividad especificada no pertenece a esta novedad');
  });

  it('Finding 1: updateActivity debe rechazar con ConflictException (409) si la concurrencia atómica falla', async () => {
    const mockPrisma = {
      issue: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'issue-1',
          organizationId,
          assignedUserId: 'user-coord1',
        }),
      },
      issueActivity: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'act-1',
          issueId: 'issue-1',
          version: 1,
          assignedUserId: 'user-coord1',
        }),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        const tx = {
          issueActivity: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return callback(tx);
      }),
    };

    const service = new IssuesService(mockPrisma as any, {} as any);

    await expect(
      service.updateActivity(coordinadorUser, 'issue-1', 'act-1', {
        version: 1,
        status: 'EN_CURSO' as any,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('Finding 2: createActivity, updateActivity y assignActivity deben validar acceso vigente al ámbito', async () => {
    const mockPrisma = {
      issue: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'issue-1',
          organizationId,
          propertyId: 'prop-1',
          assignedUserId: 'user-coord1',
        }),
      },
      issueActivity: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'act-1',
          issueId: 'issue-1',
          version: 1,
          assignedUserId: 'user-coord1',
        }),
      },
    };
    const mockScopeAuth = {
      validatePropertyAccess: vi.fn().mockRejectedValue(new ForbiddenException('Sin acceso a propiedad')),
    };

    const service = new IssuesService(mockPrisma as any, mockScopeAuth as any);

    await expect(
      service.createActivity(coordinadorUser, 'issue-1', {
        title: 'Nueva',
        description: 'Desc',
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.updateActivity(coordinadorUser, 'issue-1', 'act-1', {
        version: 1,
        status: 'EN_CURSO' as any,
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.assignActivity(coordinadorUser, 'issue-1', 'act-1', {
        version: 1,
        assignedUserId: 'user-coord1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('Finding 3: getCandidates debe permitir a Coordinador con ámbito vigente y rechazar a Administrador', async () => {
    const mockPrisma = {
      issue: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'issue-1',
          organizationId,
          scope: IssueScope.PROPIEDAD,
          propertyId: 'prop-1',
        }),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      propertyAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const mockScopeAuth = {
      validatePropertyAccess: vi.fn().mockResolvedValue(true),
    };

    const service = new IssuesService(mockPrisma as any, mockScopeAuth as any);

    // Administrador rechazado
    await expect(service.getCandidates(adminUser, 'issue-1')).rejects.toThrow(ForbiddenException);

    // Coordinador con acceso al ámbito aceptado
    const candidates = await service.getCandidates(coordinadorUser, 'issue-1');
    expect(Array.isArray(candidates)).toBe(true);
    expect(mockScopeAuth.validatePropertyAccess).toHaveBeenCalledWith(coordinadorUser, 'prop-1');
  });

  it('Finding 4: updateActivity debe rechazar borrar statusReason en actividad ya BLOQUEADA', async () => {
    const mockPrisma = {
      issue: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'issue-1',
          organizationId,
          assignedUserId: 'user-coord1',
        }),
      },
      issueActivity: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'act-1',
          issueId: 'issue-1',
          status: 'BLOQUEADA',
          statusReason: 'Motivo existente',
          version: 1,
          assignedUserId: 'user-coord1',
        }),
      },
    };

    const service = new IssuesService(mockPrisma as any, {} as any);

    await expect(
      service.updateActivity(coordinadorUser, 'issue-1', 'act-1', {
        version: 1,
        statusReason: '',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.updateActivity(coordinadorUser, 'issue-1', 'act-1', {
        version: 1,
        statusReason: '   ',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('Finding 5: updateActivity debe conservar completedAt al guardar nuevamente COMPLETADA', async () => {
    const originalCompletedAt = new Date('2026-10-15T10:00:00.000Z');
    let capturedUpdateData: any = null;

    const mockPrisma = {
      issue: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'issue-1',
          organizationId,
          assignedUserId: 'user-coord1',
        }),
      },
      issueActivity: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'act-1',
          issueId: 'issue-1',
          status: 'COMPLETADA',
          completedAt: originalCompletedAt,
          version: 2,
          assignedUserId: 'user-coord1',
        }),
      },
      issueEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        const tx = {
          issueActivity: {
            updateMany: vi.fn().mockImplementation(async ({ data }) => {
              capturedUpdateData = data;
              return { count: 1 };
            }),
            findUniqueOrThrow: vi.fn().mockResolvedValue({
              id: 'act-1',
              status: 'COMPLETADA',
              completedAt: originalCompletedAt,
              version: 3,
            }),
          },
          issueEvent: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      }),
    };

    const service = new IssuesService(mockPrisma as any, {} as any);

    await service.updateActivity(coordinadorUser, 'issue-1', 'act-1', {
      version: 2,
      status: 'COMPLETADA' as any,
    });

    // completedAt no debe estar presente en updateData (no se sobrescribe)
    expect(capturedUpdateData.completedAt).toBeUndefined();
  });
});

