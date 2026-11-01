import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  IssueEventType,
  IssuePriority,
  IssueScope,
  IssueStatus,
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

  describe('Asignación automática al reportar', () => {
    const gerente: AuthenticatedUser = {
      id: 'user-ger',
      organizationId,
      email: 'gerente@sigproh.local',
      role: Role.GERENTE,
    };

    const dto = {
      scope: IssueScope.PROPIEDAD,
      title: 'Ascensor detenido',
      description: 'Piso 4',
      priority: IssuePriority.ALTA,
      categoryId: 'cat-1',
      propertyId: 'prop-1',
    };

    const build = (leadUserId: string | null, directorUserId: string | null = null) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([{ lastValue: 6 }]),
        issue: { create: vi.fn().mockImplementation((args) => args.data) },
        issueEvent: { create: vi.fn().mockResolvedValue({}) },
        issueAssignment: { create: vi.fn().mockResolvedValue({}) },
        // Director responsable de la propiedad
        propertyAssignment: { findMany: vi.fn().mockResolvedValue([{ userId: 'user-dir-torre' }]) },
        // Gerencia y Auxiliar
        user: { findMany: vi.fn().mockResolvedValue([{ id: 'user-ger' }, { id: 'user-aux' }]) },
        notification: { create: vi.fn().mockResolvedValue({}) },
      };
      const prisma = {
        category: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'cat-1',
            organizationId,
            scope: IssueScope.PROPIEDAD,
            isActive: true,
          }),
        },
        propertyAssignment: {
          findFirst: vi
            .fn()
            // Primero el coordinador principal; luego, de respaldo, el director responsable
            .mockResolvedValueOnce(leadUserId ? { userId: leadUserId, isLead: true } : null)
            .mockResolvedValueOnce(directorUserId ? { userId: directorUserId, isLead: true } : null),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      };
      const scopeAuth = { validatePropertyAccess: vi.fn().mockResolvedValue(true) };
      return { tx, service: new IssuesService(prisma as any, scopeAuth as any, {} as any) };
    };

    const recipients = (tx: any) =>
      tx.notification.create.mock.calls.map((c: any) => c[0].data.recipientId);

    it('si reporta un coordinador, queda a su cargo y pendiente sin avisar a quienes asignan', async () => {
      const { tx, service } = build('user-coord-lead');

      const issue = await service.create(coordinadorUser, dto);

      expect(issue.code).toBe(`NOV-${new Date().getFullYear()}-0006`);
      expect(issue.assignedUserId).toBe(coordinadorUser.id);
      expect(issue.status).toBe(IssueStatus.ASIGNADA);
      expect(tx.issueAssignment.create).toHaveBeenCalledOnce();
      expect(tx.notification.create).not.toHaveBeenCalled();
    });

    it('si reporta Gerencia, pasa al coordinador principal y se le avisa', async () => {
      const { tx, service } = build('user-coord-lead');

      const issue = await service.create(gerente, dto);

      expect(issue.assignedUserId).toBe('user-coord-lead');
      expect(issue.status).toBe(IssueStatus.ASIGNADA);
      expect(recipients(tx)).toEqual(['user-coord-lead']);
    });

    it('sin coordinador principal pasa al director responsable y queda pendiente', async () => {
      const { tx, service } = build(null, 'user-dir-torre');

      const issue = await service.create(gerente, dto);

      expect(issue.assignedUserId).toBe('user-dir-torre');
      expect(issue.status).toBe(IssueStatus.ASIGNADA);
      expect(recipients(tx)).toEqual(['user-dir-torre']);
    });

    it('sin coordinador ni director responsable queda sin asignar y avisa al director responsable y a Gerencia', async () => {
      const { tx, service } = build(null);

      const issue = await service.create(gerente, dto);

      expect(issue.assignedUserId).toBeNull();
      expect(issue.status).toBe(IssueStatus.EN_REVISION);
      expect(tx.issueAssignment.create).not.toHaveBeenCalled();
      expect(tx.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: { in: [Role.GERENTE, Role.AUXILIAR_GERENCIA] },
          }),
        }),
      );
      // Gerencia reportó: no se avisa a sí misma
      expect(recipients(tx)).toEqual(['user-dir-torre', 'user-aux']);
    });

    it('una novedad crítica alerta a Dirección y Gerencia aunque ya tenga responsable', async () => {
      const { tx, service } = build(null);

      await service.create(coordinadorUser, { ...dto, priority: IssuePriority.CRITICA });

      expect(recipients(tx)).toEqual(['user-dir-torre', 'user-ger', 'user-aux']);
      expect(tx.notification.create.mock.calls[0][0].data.title).toContain('ALERTA');
    });
  });

  it('CP-06: el Coordinador no puede asignar el responsable principal', async () => {
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
          status: IssueStatus.EN_REVISION,
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
      validatePropertyAccess: vi.fn().mockResolvedValue(true),
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
          status: IssueStatus.EN_ATENCION,
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
      validatePropertyAccess: vi.fn().mockResolvedValue(true),
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

  describe('Flujo simplificado: asignación, cierre y descarte', () => {
    const gerenteUser: AuthenticatedUser = {
      id: 'user-ger',
      organizationId,
      email: 'gerente@sigproh.local',
      role: Role.GERENTE,
    };

    const baseIssue = {
      id: 'issue-9',
      organizationId,
      code: 'NOV-2026-0009',
      title: 'Bomba de agua',
      scope: IssueScope.PROPIEDAD,
      propertyId: 'prop-1',
      internalAreaId: null,
      assignedUserId: 'user-coord1',
      createdById: 'user-ger',
      categoryId: 'cat-1',
      closedAt: null,
    };

    const scopeAuth = {
      validatePropertyAccess: vi.fn().mockResolvedValue(true),
      hasPropertyAccess: vi.fn().mockResolvedValue(true),
    };

    const buildTx = (updateCount = 1): any => ({
      issue: {
        updateMany: vi.fn().mockResolvedValue({ count: updateCount }),
        update: vi.fn().mockImplementation((args) => ({ ...baseIssue, ...args.data })),
        findUniqueOrThrow: vi.fn().mockResolvedValue(baseIssue),
      },
      issueAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
      },
      issueEvent: { create: vi.fn().mockResolvedValue({}) },
      user: { findMany: vi.fn().mockResolvedValue([{ id: 'user-dir' }]) },
      propertyAssignment: { findMany: vi.fn().mockResolvedValue([{ userId: 'user-dir' }]) },
      notification: { create: vi.fn().mockResolvedValue({}) },
    });

    const buildPrisma = (issue: any, tx: any, extra: any = {}) => ({
      issue: { findUnique: vi.fn().mockResolvedValue(issue) },
      issueActivity: { count: vi.fn().mockResolvedValue(0) },
      category: { findUnique: vi.fn().mockResolvedValue({ requiresEvidence: false }) },
      issueAttachment: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      ...extra,
    });

    const coordinatorRecord = (id: string) => ({
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id,
          organizationId,
          firstName: 'Ana',
          lastName: 'Ruiz',
          email: `${id}@sigproh.local`,
          role: Role.COORDINADOR_OPERATIVO,
          isActive: true,
        }),
      },
    });

    it('la Gerencia asigna el responsable y la novedad queda pendiente', async () => {
      const tx = buildTx();
      const prisma = buildPrisma(
        { ...baseIssue, assignedUserId: null, status: IssueStatus.EN_REVISION },
        tx,
        coordinatorRecord('user-coord1'),
      );
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await service.assignPrincipal(gerenteUser, baseIssue.id, { assignedUserId: 'user-coord1' });

      expect(tx.issue.updateMany).toHaveBeenCalledWith({
        where: { id: baseIssue.id, status: { in: [IssueStatus.EN_REVISION] } },
        data: { status: IssueStatus.ASIGNADA },
      });
    });

    it('reasignar una novedad en atención conserva su estado', async () => {
      const tx = buildTx();
      const prisma = buildPrisma(
        { ...baseIssue, status: IssueStatus.EN_ATENCION },
        tx,
        coordinatorRecord('user-coord2'),
      );
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await service.assignPrincipal(directorUser, baseIssue.id, {
        assignedUserId: 'user-coord2',
        reason: 'Cambio de turno',
      });

      expect(tx.issue.updateMany).toHaveBeenCalledWith({
        where: { id: baseIssue.id, status: { in: [IssueStatus.EN_ATENCION] } },
        data: { status: IssueStatus.EN_ATENCION },
      });
    });

    it('no permite asignar a la Gerencia como responsable principal', async () => {
      const prisma = buildPrisma(
        { ...baseIssue, assignedUserId: null, status: IssueStatus.EN_REVISION },
        buildTx(),
        {
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'user-ger',
              organizationId,
              role: Role.GERENTE,
              isActive: true,
            }),
          },
        },
      );
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await expect(
        service.assignPrincipal(directorUser, baseIssue.id, { assignedUserId: 'user-ger' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('no permite asignar responsable a una novedad cerrada', async () => {
      const prisma = buildPrisma({ ...baseIssue, status: IssueStatus.CERRADA }, buildTx());
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await expect(
        service.assignPrincipal(directorUser, baseIssue.id, { assignedUserId: 'user-coord2' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('el coordinador responsable cierra directamente y se avisa al Director', async () => {
      const tx = buildTx();
      const prisma = buildPrisma({ ...baseIssue, status: IssueStatus.EN_ATENCION }, tx);
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await service.close(coordinadorUser, baseIssue.id, {});

      expect(tx.issue.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: IssueStatus.CERRADA }),
        }),
      );
      const recipients = tx.notification.create.mock.calls.map((c: any) => c[0].data.recipientId);
      expect(recipients).toEqual(expect.arrayContaining(['user-ger', 'user-dir']));
      expect(recipients).not.toContain('user-coord1');
    });

    it('un coordinador que no es el responsable no puede cerrar', async () => {
      const otherCoordinator: AuthenticatedUser = { ...coordinadorUser, id: 'user-coord2' };
      const prisma = buildPrisma({ ...baseIssue, status: IssueStatus.EN_ATENCION }, buildTx());
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await expect(service.close(otherCoordinator, baseIssue.id, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('la Gerencia no puede cerrar novedades', async () => {
      const prisma = buildPrisma({ ...baseIssue, status: IssueStatus.EN_ATENCION }, buildTx());
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await expect(service.close(gerenteUser, baseIssue.id, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('el responsable inicia el trabajo: pendiente pasa a en proceso y se avisa a quien reportó', async () => {
      const tx = buildTx();
      const prisma = buildPrisma({ ...baseIssue, status: IssueStatus.ASIGNADA }, tx);
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await service.startWork(coordinadorUser, baseIssue.id);

      expect(tx.issue.updateMany).toHaveBeenCalledWith({
        where: { id: baseIssue.id, status: { in: [IssueStatus.ASIGNADA] } },
        data: { status: IssueStatus.EN_ATENCION },
      });
      expect(tx.issueEvent.create.mock.calls[0][0].data.eventType).toBe(IssueEventType.INICIO_TRABAJO);
      expect(tx.notification.create.mock.calls.map((c: any) => c[0].data.recipientId)).toEqual(['user-ger']);
    });

    it('solo el responsable o el Director pueden iniciar el trabajo', async () => {
      const otherCoordinator: AuthenticatedUser = { ...coordinadorUser, id: 'user-coord2' };
      const prisma = buildPrisma({ ...baseIssue, status: IssueStatus.ASIGNADA }, buildTx());
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await expect(service.startWork(otherCoordinator, baseIssue.id)).rejects.toThrow(ForbiddenException);
      await expect(service.startWork(gerenteUser, baseIssue.id)).rejects.toThrow(ForbiddenException);
    });

    it('no permite iniciar el trabajo de una novedad que ya está en proceso', async () => {
      const prisma = buildPrisma({ ...baseIssue, status: IssueStatus.EN_ATENCION }, buildTx());
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await expect(service.startWork(directorUser, baseIssue.id)).rejects.toThrow(BadRequestException);
    });

    it('no permite finalizar una novedad pendiente sin haber iniciado el trabajo', async () => {
      const prisma = buildPrisma({ ...baseIssue, status: IssueStatus.ASIGNADA }, buildTx());
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await expect(service.close(directorUser, baseIssue.id, {})).rejects.toThrow(
        'Inicie el trabajo antes de finalizar la novedad',
      );
    });

    it('no permite cerrar sin evidencia FINAL cuando la categoría la exige', async () => {
      const prisma = buildPrisma({ ...baseIssue, status: IssueStatus.EN_ATENCION }, buildTx(), {
        category: { findUnique: vi.fn().mockResolvedValue({ requiresEvidence: true }) },
      });
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await expect(service.close(directorUser, baseIssue.id, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('responde 409 si el estado cambió durante el cierre', async () => {
      const prisma = buildPrisma({ ...baseIssue, status: IssueStatus.EN_ATENCION }, buildTx(0));
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await expect(service.close(directorUser, baseIssue.id, {})).rejects.toThrow(
        ConflictException,
      );
    });

    it('no permite crear actividades en una novedad descartada', async () => {
      const prisma = buildPrisma({ ...baseIssue, status: IssueStatus.DESCARTADA }, buildTx());
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await expect(
        service.createActivity(directorUser, baseIssue.id, {
          title: 'Revisar',
          description: 'Detalle',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('el Director puede descartar una novedad en proceso (por ejemplo, duplicada)', async () => {
      const tx = buildTx();
      const prisma = buildPrisma({ ...baseIssue, status: IssueStatus.EN_ATENCION }, tx);
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await service.discard(directorUser, baseIssue.id, { reason: 'Duplicada de NOV-2026-0001' });

      expect(tx.issue.updateMany).toHaveBeenCalledWith({
        where: { id: baseIssue.id, status: { in: [IssueStatus.EN_ATENCION] } },
        data: { status: IssueStatus.DESCARTADA },
      });
    });

    it('no se puede cerrar una novedad que aún no tiene responsable', async () => {
      const prisma = buildPrisma(
        { ...baseIssue, assignedUserId: null, status: IssueStatus.EN_REVISION },
        buildTx(),
      );
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await expect(service.close(directorUser, baseIssue.id, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('el Auxiliar de Gerencia puede asignar responsable', async () => {
      const tx = buildTx();
      const prisma = buildPrisma(
        { ...baseIssue, assignedUserId: null, status: IssueStatus.EN_REVISION },
        tx,
        coordinatorRecord('user-coord1'),
      );
      const service = new IssuesService(prisma as any, scopeAuth as any, {} as any);

      await expect(
        service.assignPrincipal(auxiliarUser, baseIssue.id, { assignedUserId: 'user-coord1' }),
      ).resolves.toBeDefined();
    });
  });
});
