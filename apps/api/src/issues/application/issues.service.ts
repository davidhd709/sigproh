import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityStatus,
  EvidenceStage,
  IssueEventType,
  IssuePriority,
  IssueScope,
  IssueStatus,
  Role,
} from '../../generated/prisma/client';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';
import { ScopeAuthorizationService } from '../../organization/application/scope-authorization.service';
import { PrivateStorageService } from '../infrastructure/private-storage.service';
import { PROVISIONAL_FILE_POLICY } from '../infrastructure/provisional-file-policy.config';
import { CreateIssueDto } from '../presentation/dto/create-issue.dto';
import { AssignPrincipalDto } from '../presentation/dto/assign-principal.dto';
import { UpdatePriorityDto } from '../presentation/dto/update-priority.dto';
import { AddUrgentMeasureDto } from '../presentation/dto/add-urgent-measure.dto';
import { ListIssuesQueryDto } from '../presentation/dto/list-issues-query.dto';
import { CreateActivityDto } from '../presentation/dto/create-activity.dto';
import { UpdateActivityDto } from '../presentation/dto/update-activity.dto';
import { AssignActivityDto } from '../presentation/dto/assign-activity.dto';
import { CreateCommentDto } from '../presentation/dto/create-comment.dto';
import { CreateAttachmentDto } from '../presentation/dto/create-attachment.dto';
import { CloseIssueDto } from '../presentation/dto/close-issue.dto';
import { ReopenIssueDto } from '../presentation/dto/reopen-issue.dto';
import { DiscardIssueDto } from '../presentation/dto/discard-issue.dto';

/** Roles que pueden registrar novedades. */
export const ISSUE_REPORTER_ROLES: Role[] = [
  Role.DIRECTOR_OPERATIVO,
  Role.GERENTE,
  Role.AUXILIAR_GERENCIA,
  Role.COORDINADOR_OPERATIVO,
];

/** Roles que pueden asignar (y reasignar) el responsable principal. */
export const ISSUE_ASSIGNER_ROLES: Role[] = [
  Role.DIRECTOR_OPERATIVO,
  Role.GERENTE,
  Role.AUXILIAR_GERENCIA,
];

/** Roles que pueden ser responsables principales (son quienes luego cambian el estado y cierran). */
const ISSUE_RESPONSIBLE_ROLES: Role[] = [
  Role.DIRECTOR_OPERATIVO,
  Role.COORDINADOR_OPERATIVO,
];

const FINAL_STATUSES: IssueStatus[] = [IssueStatus.CERRADA, IssueStatus.DESCARTADA];

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeAuth: ScopeAuthorizationService,
    private readonly privateStorage: PrivateStorageService,
  ) {}

  /**
   * Registra una nueva novedad en el sistema con asignación mixta y gestión crítica.
   */
  async create(user: AuthenticatedUser, dto: CreateIssueDto) {
    // 1. Validar rol autorizado para reportar (PEN-03 resuelto: Director, Gerente, Auxiliar de Gerencia y Coordinadores)
    if (!ISSUE_REPORTER_ROLES.includes(user.role)) {
      throw new ForbiddenException('Su rol no tiene autorización para registrar novedades');
    }

    // 2. Validar exclusividad estricta de ámbito (RN-003, RN-021, RN-022)
    if (dto.scope === IssueScope.PROPIEDAD) {
      if (!dto.propertyId) {
        throw new BadRequestException(
          'Para una novedad de propiedad horizontal, propertyId es obligatorio',
        );
      }
      if (dto.internalAreaId) {
        throw new BadRequestException(
          'Una novedad de propiedad no puede incluir un área interna',
        );
      }

      await this.scopeAuth.validatePropertyAccess(user, dto.propertyId);

      if (dto.propertyZoneId) {
        const zone = await this.prisma.propertyZone.findFirst({
          where: {
            id: dto.propertyZoneId,
            propertyId: dto.propertyId,
            isActive: true,
          },
        });
        if (!zone) {
          throw new BadRequestException(
            'La zona indicada no pertenece a la propiedad o está inactiva',
          );
        }
      }
    } else if (dto.scope === IssueScope.INTERNA) {
      if (!dto.internalAreaId) {
        throw new BadRequestException(
          'Para una novedad interna, internalAreaId es obligatorio',
        );
      }
      if (dto.propertyId || dto.propertyZoneId) {
        throw new BadRequestException(
          'Una novedad interna no puede incluir referencias de propiedad ni zonas',
        );
      }

      await this.scopeAuth.validateInternalAreaAccess(user, dto.internalAreaId);
    } else {
      throw new BadRequestException('Ámbito de novedad inválido');
    }

    // 3. Validar categoría
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });

    if (
      !category ||
      category.organizationId !== user.organizationId ||
      !category.isActive ||
      category.scope !== dto.scope
    ) {
      throw new BadRequestException(
        'La categoría seleccionada no es válida para el ámbito de la novedad',
      );
    }

    // 4. Asignación automática del responsable principal:
    //    - Si reporta un Coordinador, la novedad queda a su cargo.
    //    - Si reporta Gerencia, Auxiliar o Director, pasa al coordinador principal del ámbito.
    //    - Si no hay a quién asignarla, queda pendiente sin responsable (EN_REVISION).
    let assignedUserId: string | null = null;

    if (user.role === Role.COORDINADOR_OPERATIVO) {
      assignedUserId = user.id;
    } else if (dto.scope === IssueScope.PROPIEDAD && dto.propertyId) {
      const leadAssignment = await this.prisma.propertyAssignment.findFirst({
        where: {
          propertyId: dto.propertyId,
          isLead: true,
          isActive: true,
          user: { isActive: true, role: Role.COORDINADOR_OPERATIVO },
        },
      });
      assignedUserId = leadAssignment?.userId ?? null;
    } else if (dto.scope === IssueScope.INTERNA && dto.internalAreaId) {
      const leadAreaAssignment = await this.prisma.areaAssignment.findFirst({
        where: {
          internalAreaId: dto.internalAreaId,
          isLead: true,
          isActive: true,
          user: { isActive: true, role: Role.COORDINADOR_OPERATIVO },
        },
      });
      assignedUserId = leadAreaAssignment?.userId ?? null;
    }

    //    - Sin coordinador principal, la recibe el director responsable del ámbito.
    if (!assignedUserId) {
      assignedUserId = await this.responsibleDirectorFor(dto.propertyId ?? null, dto.internalAreaId ?? null);
    }

    const currentYear = new Date().getFullYear();
    const isCritical = dto.priority === IssuePriority.CRITICA;

    // 5. Transacción atómica para generar código correlativo sin colisiones, crear Issue, Eventos y Alertas
    return this.prisma.$transaction(async (tx) => {
      // Contador atómico por organización y año protegido contra carreras en su primera creación e incrementos
      const seqResult = await tx.$queryRaw<{ lastValue: number }[]>`
        INSERT INTO "issue_sequences" ("id", "organizationId", "year", "lastValue", "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid()::text,
          ${user.organizationId},
          ${currentYear},
          COALESCE((SELECT COUNT(*) FROM "issues" WHERE "organizationId" = ${user.organizationId} AND EXTRACT(YEAR FROM "createdAt") = ${currentYear}), 0) + 1,
          NOW(),
          NOW()
        )
        ON CONFLICT ("organizationId", "year")
        DO UPDATE SET "lastValue" = "issue_sequences"."lastValue" + 1, "updatedAt" = NOW()
        RETURNING "lastValue";
      `;

      const nextVal = Number(seqResult[0].lastValue);
      const code = `NOV-${currentYear}-${String(nextVal).padStart(4, '0')}`;

      const issue = await tx.issue.create({
        data: {
          organizationId: user.organizationId,
          code,
          scope: dto.scope,
          title: dto.title.trim(),
          description: dto.description.trim(),
          priority: dto.priority,
          initialPriority: dto.priority,
          // Queda "pendiente" hasta que el responsable inicie el trabajo
          status: assignedUserId ? IssueStatus.ASIGNADA : IssueStatus.EN_REVISION,
          propertyId: dto.propertyId ?? null,
          propertyZoneId: dto.propertyZoneId ?? null,
          internalAreaId: dto.internalAreaId ?? null,
          categoryId: dto.categoryId,
          createdById: user.id,
          suggestedUserId: assignedUserId,
          assignedUserId,
          urgentMeasures: isCritical && dto.urgentMeasures ? dto.urgentMeasures.trim() : null,
        },
        include: {
          category: { select: { id: true, name: true } },
          property: { select: { id: true, name: true, code: true } },
          internalArea: { select: { id: true, name: true, code: true } },
          assignedUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      // Registrar evento inmutable de creación
      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.CREACION,
          summary: `Novedad creada por ${user.email} con prioridad inicial ${dto.priority}`,
          details: {
            priority: dto.priority,
            scope: dto.scope,
            assignedUserId,
          },
        },
      });

      if (assignedUserId) {
        await tx.issueAssignment.create({
          data: {
            issueId: issue.id,
            userId: assignedUserId,
            assignedById: user.id,
            reason: 'Asignación automática al reportar',
            isCurrent: true,
          },
        });

        await tx.issueEvent.create({
          data: {
            issueId: issue.id,
            userId: user.id,
            eventType: IssueEventType.CONFIRMACION_ASIGNACION,
            summary:
              assignedUserId === user.id
                ? 'Asignada automáticamente a quien la reportó'
                : 'Asignada automáticamente al responsable del ámbito',
            details: { assignedUserId, automatic: true },
          },
        });

        if (assignedUserId !== user.id) {
          await tx.notification.create({
            data: {
              organizationId: user.organizationId,
              recipientId: assignedUserId,
              issueId: issue.id,
              title: `Novedad asignada: ${code}`,
              message: `Se le asignó la novedad "${dto.title.trim()}" reportada por ${user.email}.`,
            },
          });
        }
      }

      // Si es crítica y se aportaron medidas urgentes iniciales
      if (isCritical && dto.urgentMeasures) {
        await tx.issueEvent.create({
          data: {
            issueId: issue.id,
            userId: user.id,
            eventType: IssueEventType.MEDIDA_URGENTE,
            summary: `Medidas urgentes iniciales registradas`,
            details: { measures: dto.urgentMeasures.trim() },
          },
        });
      }

      // Gerencia, Auxiliar y el director responsable se enteran si hay que asignarla o si es crítica (DEC-06 / RF-014)
      if (!assignedUserId || isCritical) {
        const management = await tx.user.findMany({
          where: {
            organizationId: user.organizationId,
            role: { in: [Role.GERENTE, Role.AUXILIAR_GERENCIA] },
            isActive: true,
          },
          select: { id: true },
        });
        const directorIds = await this.directorIdsFor(tx, user.organizationId, dto.propertyId ?? null);
        const assigners = [...new Set([...directorIds, ...management.map((m) => m.id)])]
          .filter((id) => id !== user.id)
          .map((id) => ({ id }));

        for (const assigner of assigners) {
          await tx.notification.create({
            data: {
              organizationId: user.organizationId,
              recipientId: assigner.id,
              issueId: issue.id,
              title: isCritical ? `ALERTA: Novedad crítica ${code}` : `Novedad por asignar: ${code}`,
              message: isCritical
                ? `Se ha reportado la novedad crítica "${dto.title.trim()}". Requiere atención inmediata.`
                : `Se ha reportado la novedad "${dto.title.trim()}" y no tiene responsable. Asígnela a un coordinador.`,
            },
          });
        }
      }

      return issue;
    });
  }

  /**
   * Asigna o reasigna el responsable principal de la novedad (Director Operativo, Gerente o Auxiliar de Gerencia).
   * Una novedad sin responsable pasa a "pendiente" (ASIGNADA); una reasignación conserva el estado en curso.
   */
  async assignPrincipal(
    user: AuthenticatedUser,
    issueId: string,
    dto: AssignPrincipalDto,
  ) {
    if (!ISSUE_ASSIGNER_ROLES.includes(user.role)) {
      throw new ForbiddenException(
        'Solo el Director Operativo, la Gerencia o el Auxiliar de Gerencia pueden asignar el responsable principal',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        code: true,
        title: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
        assignedUserId: true,
        status: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    await this.validateIssueScopeAccess(user, issue);

    if (FINAL_STATUSES.includes(issue.status)) {
      throw new BadRequestException(
        `No es posible asignar responsable a una novedad en estado ${issue.status}`,
      );
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.assignedUserId },
      select: {
        id: true,
        organizationId: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!targetUser || targetUser.organizationId !== user.organizationId) {
      throw new BadRequestException('El usuario asignado no pertenece a la organización');
    }

    if (!targetUser.isActive) {
      throw new BadRequestException('No se puede asignar un usuario inactivo');
    }

    if (!ISSUE_RESPONSIBLE_ROLES.includes(targetUser.role)) {
      throw new BadRequestException(
        'El responsable principal debe ser un Coordinador Operativo o el Director Operativo',
      );
    }

    // RF-011: Validar que el candidato tenga autorización activa sobre el ámbito de la novedad
    const targetUserAuth: AuthenticatedUser = {
      id: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
      organizationId: targetUser.organizationId,
    };

    if (issue.scope === IssueScope.PROPIEDAD && issue.propertyId) {
      const hasAccess = await this.scopeAuth.hasPropertyAccess(
        targetUserAuth,
        issue.propertyId,
      );
      if (!hasAccess) {
        throw new BadRequestException(
          'El usuario asignado no cuenta con asignación activa en la propiedad correspondiente (RF-011)',
        );
      }
    } else if (issue.scope === IssueScope.INTERNA && issue.internalAreaId) {
      const hasAccess = await this.scopeAuth.hasInternalAreaAccess(
        targetUserAuth,
        issue.internalAreaId,
      );
      if (!hasAccess) {
        throw new BadRequestException(
          'El usuario asignado no cuenta con asignación activa en el área interna correspondiente (RF-011)',
        );
      }
    }

    const isReassignment = Boolean(
      issue.assignedUserId && issue.assignedUserId !== dto.assignedUserId,
    );

    if (isReassignment && (!dto.reason || !dto.reason.trim())) {
      throw new BadRequestException(
        'Debe especificar un motivo obligatorio para la reasignación de responsable principal',
      );
    }

    const isFirstAssignment =
      issue.status === IssueStatus.REGISTRADA || issue.status === IssueStatus.EN_REVISION;

    return this.prisma.$transaction(async (tx) => {
      // Escritura condicionada al estado leído para no pisar una transición concurrente (409)
      await this.transitionStatus(
        tx,
        issue.id,
        [issue.status],
        isFirstAssignment ? IssueStatus.ASIGNADA : issue.status,
      );

      // Inactivar asignaciones previas
      await tx.issueAssignment.updateMany({
        where: { issueId: issue.id, isCurrent: true },
        data: { isCurrent: false },
      });

      // Crear nueva asignación en el historial
      await tx.issueAssignment.create({
        data: {
          issueId: issue.id,
          userId: targetUser.id,
          assignedById: user.id,
          reason: dto.reason?.trim() ?? null,
          isCurrent: true,
        },
      });

      // Actualizar novedad
      const updatedIssue = await tx.issue.update({
        where: { id: issue.id },
        data: {
          assignedUserId: targetUser.id,
        },
        include: {
          assignedUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      // Registrar evento de auditoría
      const eventType = isReassignment
        ? IssueEventType.REASIGNACION
        : IssueEventType.CONFIRMACION_ASIGNACION;

      const summary = isReassignment
        ? `Responsable reasignado a ${targetUser.firstName} ${targetUser.lastName}. Motivo: ${dto.reason?.trim()}`
        : `Responsable principal confirmado: ${targetUser.firstName} ${targetUser.lastName}`;

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType,
          summary,
          details: {
            previousAssignedUserId: issue.assignedUserId,
            newAssignedUserId: targetUser.id,
            reason: dto.reason?.trim() ?? null,
          },
        },
      });

      // Notificar al usuario asignado
      await tx.notification.create({
        data: {
          organizationId: user.organizationId,
          recipientId: targetUser.id,
          issueId: issue.id,
          title: `Novedad asignada: ${issue.code}`,
          message: `${user.email} le ha asignado como responsable principal de la novedad "${issue.title}".`,
        },
      });

      return updatedIssue;
    });
  }

  /**
   * Modifica la prioridad de una novedad (Exclusivo Director Operativo - DEC-07 / RF-015).
   * Exige motivo obligatorio, conserva la prioridad inicial en el historial y alerta si es crítica (RF-014).
   */
  async updatePriority(
    user: AuthenticatedUser,
    issueId: string,
    dto: UpdatePriorityDto,
  ) {
    if (user.role !== Role.DIRECTOR_OPERATIVO) {
      throw new ForbiddenException(
        'Solo el Director Operativo puede modificar formalmente la prioridad',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        priority: true,
        code: true,
        title: true,
        status: true,
        propertyId: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    this.assertIssueIsOpen(issue.status, 'cambiar la prioridad de');

    const previousPriority = issue.priority;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.issue.update({
        where: { id: issue.id },
        data: { priority: dto.priority },
      });

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.CAMBIO_PRIORIDAD,
          summary: `Prioridad cambiada de ${previousPriority} a ${dto.priority}. Motivo: ${dto.reason.trim()}`,
          details: {
            previousPriority,
            newPriority: dto.priority,
            reason: dto.reason.trim(),
          },
        },
      });

      // RF-014: Si se reclasifica a prioridad CRÍTICA, generar alerta inmediata a la Dirección Operativa dentro de la misma transacción
      if (
        dto.priority === IssuePriority.CRITICA &&
        previousPriority !== IssuePriority.CRITICA
      ) {
        const directors = (
          await this.directorIdsFor(tx, user.organizationId, issue.propertyId)
        ).map((id) => ({ id }));

        for (const dir of directors) {
          await tx.notification.create({
            data: {
              organizationId: user.organizationId,
              recipientId: dir.id,
              issueId: issue.id,
              title: `ALERTA: Novedad reclasificada a CRÍTICA ${issue.code}`,
              message: `La novedad "${issue.title}" ha sido reclasificada a CRÍTICA por ${user.email}. Motivo: ${dto.reason.trim()}. Requiere seguimiento prioritario.`,
            },
          });
        }
      }

      return updated;
    });
  }

  /**
   * Permite registrar medidas urgentes en novedades críticas antes o después de la asignación formal (DEC-06 / RF-013).
   */
  async addUrgentMeasure(
    user: AuthenticatedUser,
    issueId: string,
    dto: AddUrgentMeasureDto,
  ) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para registrar medidas urgentes',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        code: true,
        priority: true,
        initialPriority: true,
        propertyId: true,
        internalAreaId: true,
        urgentMeasures: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    if (
      issue.priority !== IssuePriority.CRITICA &&
      issue.initialPriority !== IssuePriority.CRITICA
    ) {
      throw new BadRequestException(
        'Solo se pueden registrar actuaciones urgentes sobre novedades de prioridad crítica',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const currentMeasures = issue.urgentMeasures ? `${issue.urgentMeasures}\n` : '';
      const timestamp = new Date().toISOString();
      const updatedMeasureText = `${currentMeasures}[${timestamp} - ${user.email}]: ${dto.measure.trim()}`;

      const updated = await tx.issue.update({
        where: { id: issue.id },
        data: {
          urgentMeasures: updatedMeasureText,
        },
      });

      // Registrar evento inmutable de medida urgente
      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.MEDIDA_URGENTE,
          summary: `Medida urgente registrada: ${dto.measure.trim()}`,
          details: { measure: dto.measure.trim() },
        },
      });

      // Notificar al director de la actuación urgente si el autor no es director
      if (user.role !== Role.DIRECTOR_OPERATIVO) {
        const directors = (
          await this.directorIdsFor(tx, user.organizationId, issue.propertyId)
        ).map((id) => ({ id }));

        for (const dir of directors) {
          await tx.notification.create({
            data: {
              organizationId: user.organizationId,
              recipientId: dir.id,
              issueId: issue.id,
              title: `Actuación urgente en ${issue.code}`,
              message: `${user.email} registró una medida urgente: "${dto.measure.trim()}"`,
            },
          });
        }
      }

      return updated;
    });
  }

  /**
   * Lista novedades aplicando filtrado estricto por alcance (RF-049).
   */
  async list(user: AuthenticatedUser, query: ListIssuesQueryDto) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para acceder a novedades operativas',
      );
    }

    const accessiblePropertyIds = await this.scopeAuth.getAccessiblePropertyIds(user);
    const accessibleAreaIds = await this.scopeAuth.getAccessibleInternalAreaIds(user);

    const where: any = {
      organizationId: user.organizationId,
    };

    // Aislamiento de ámbito para coordinadores / auxiliares
    if (accessiblePropertyIds !== null && accessibleAreaIds !== null) {
      where.OR = [
        { propertyId: { in: accessiblePropertyIds } },
        { internalAreaId: { in: accessibleAreaIds } },
      ];
    } else if (accessiblePropertyIds !== null) {
      where.propertyId = { in: accessiblePropertyIds };
    } else if (accessibleAreaIds !== null) {
      where.internalAreaId = { in: accessibleAreaIds };
    }

    // Filtros opcionales
    if (query.scope) where.scope = query.scope;
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.internalAreaId) where.internalAreaId = query.internalAreaId;
    if (query.priority) where.priority = query.priority;
    if (query.status) where.status = query.status;
    if (query.isCritical) where.priority = IssuePriority.CRITICA;
    if (query.mine) where.assignedUserId = user.id;
    if (query.pendingReview) where.status = IssueStatus.EN_REVISION;

    const issues = await this.prisma.issue.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, scope: true } },
        property: { select: { id: true, name: true, code: true } },
        propertyZone: { select: { id: true, name: true } },
        internalArea: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        suggestedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        // Solo actividades abiertas, con lo mínimo para el resumen de bandeja
        activities: {
          where: { status: { notIn: [ActivityStatus.COMPLETADA, ActivityStatus.CANCELADA] } },
          select: { status: true, dueDate: true, assignedUserId: true },
        },
        // Último hito del flujo de cierre, para saber si la novedad fue devuelta
        events: {
          where: { eventType: { in: IssuesService.CLOSURE_FLOW_EVENTS } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { eventType: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return issues.map(({ activities, events, ...issue }) => ({
      ...issue,
      inbox: IssuesService.inboxSummary(activities ?? [], events?.[0], user.id, now),
    }));
  }

  // La asignación posterior a una devolución deja de mostrarla como devuelta
  private static readonly CLOSURE_FLOW_EVENTS: IssueEventType[] = [
    IssueEventType.SOLICITUD_CIERRE,
    IssueEventType.CONFIRMACION_ASIGNACION,
    IssueEventType.DEVOLUCION,
    IssueEventType.CIERRE_DEFINITIVO,
    IssueEventType.REAPERTURA,
  ];

  /**
   * Resumen para las bandejas por rol (RF-027): actividades abiertas, vencidas,
   * bloqueadas, las asignadas al usuario y si la novedad quedó devuelta.
   */
  static inboxSummary(
    activities: { status: ActivityStatus; dueDate: Date | null; assignedUserId: string | null }[],
    lastClosureEvent: { eventType: IssueEventType; createdAt: Date } | undefined,
    userId: string,
    now: Date,
  ) {
    return {
      openActivities: activities.length,
      overdueActivities: activities.filter((a) => a.dueDate !== null && a.dueDate < now).length,
      blockedActivities: activities.filter((a) => a.status === ActivityStatus.BLOQUEADA).length,
      myOpenActivities: activities.filter((a) => a.assignedUserId === userId).length,
      returned: lastClosureEvent?.eventType === IssueEventType.DEVOLUCION,
      returnedAt: lastClosureEvent?.eventType === IssueEventType.DEVOLUCION ? lastClosureEvent.createdAt : null,
    };
  }

  /**
   * Obtiene el detalle completo y cronología de eventos de una novedad (RF-026).
   */
  async findById(user: AuthenticatedUser, issueId: string) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para acceder a novedades operativas',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      include: {
        category: true,
        property: { select: { id: true, name: true, code: true } },
        propertyZone: { select: { id: true, name: true } },
        internalArea: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        suggestedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignments: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            assignedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        events: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          include: {
            assignedUser: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            _count: { select: { comments: true, attachments: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        comments: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            activity: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        attachments: {
          include: {
            uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            activity: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    return issue;
  }

  /**
   * Obtiene los candidatos a responsable principal de una novedad (RF-011):
   * el Director Operativo y los coordinadores con asignación activa en el ámbito de la novedad.
   */
  async getCandidates(user: AuthenticatedUser, issueId: string) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El Administrador no cuenta con acceso operativo a novedades ni a sus candidatos',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    await this.validateIssueScopeAccess(user, issue);

    // 1. Director Operativo: puede ser responsable de cualquier novedad
    const globalUsers = await this.prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        role: Role.DIRECTOR_OPERATIVO,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
    });

    // 2. Usuarios con asignación activa en el ámbito correspondiente (RF-011)
    let scopedUsers: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      role: Role;
      isLead: boolean;
    }[] = [];

    if (issue.scope === IssueScope.PROPIEDAD && issue.propertyId) {
      const propertyAssignments = await this.prisma.propertyAssignment.findMany({
        where: {
          propertyId: issue.propertyId,
          isActive: true,
          user: { isActive: true, role: { in: ISSUE_RESPONSIBLE_ROLES } },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
      });
      scopedUsers = propertyAssignments.map((a) => ({
        ...a.user,
        isLead: a.isLead,
      }));
    } else if (issue.scope === IssueScope.INTERNA && issue.internalAreaId) {
      const areaAssignments = await this.prisma.areaAssignment.findMany({
        where: {
          internalAreaId: issue.internalAreaId,
          isActive: true,
          user: { isActive: true, role: { in: ISSUE_RESPONSIBLE_ROLES } },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
      });
      scopedUsers = areaAssignments.map((a) => ({
        ...a.user,
        isLead: a.isLead,
      }));
    }

    // Unir y estructurar candidatos únicos
    const candidatesMap = new Map<string, any>();
    for (const u of scopedUsers) {
      candidatesMap.set(u.id, {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        role: u.role,
        isLead: u.isLead,
        scopeAuthorized: true,
      });
    }
    for (const u of globalUsers) {
      if (!candidatesMap.has(u.id)) {
        candidatesMap.set(u.id, {
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          role: u.role,
          isLead: false,
          scopeAuthorized: true,
        });
      }
    }

    return Array.from(candidatesMap.values());
  }

  /**
   * Lista categorías activas por ámbito.
   */
  async listCategories(user: AuthenticatedUser, scope?: IssueScope) {
    const where: any = {
      organizationId: user.organizationId,
      isActive: true,
    };
    if (scope) where.scope = scope;

    return this.prisma.category.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Directores a avisar sobre una novedad: el director responsable de la propiedad o,
   * si no tiene (novedades internas o datos anteriores), todos los directores activos.
   */
  private async directorIdsFor(
    tx: Pick<PrismaService, 'user' | 'propertyAssignment'>,
    organizationId: string,
    propertyId: string | null,
  ): Promise<string[]> {
    if (propertyId) {
      const responsible = await tx.propertyAssignment.findMany({
        where: {
          propertyId,
          isActive: true,
          user: { role: Role.DIRECTOR_OPERATIVO, isActive: true },
        },
        select: { userId: true },
      });
      if (responsible.length > 0) return responsible.map((r) => r.userId);
    }

    const directors = await tx.user.findMany({
      where: { organizationId, role: Role.DIRECTOR_OPERATIVO, isActive: true },
      select: { id: true },
    });
    return directors.map((d) => d.id);
  }

  /**
   * Responsable de respaldo cuando el ámbito no tiene coordinador principal:
   * el director responsable de la propiedad o el director asignado al área interna.
   */
  private async responsibleDirectorFor(
    propertyId: string | null,
    internalAreaId: string | null,
  ): Promise<string | null> {
    const director = { isActive: true, role: Role.DIRECTOR_OPERATIVO };
    if (propertyId) {
      const assignment = await this.prisma.propertyAssignment.findFirst({
        where: { propertyId, isActive: true, user: director },
        orderBy: { isLead: 'desc' },
      });
      return assignment?.userId ?? null;
    }
    if (internalAreaId) {
      const assignment = await this.prisma.areaAssignment.findFirst({
        where: { internalAreaId, isActive: true, user: director },
        orderBy: { isLead: 'desc' },
      });
      return assignment?.userId ?? null;
    }
    return null;
  }

  /**
   * Una novedad cerrada o descartada no admite cambios en su trabajo operativo.
   */
  private assertIssueIsOpen(status: IssueStatus, action: string) {
    if (FINAL_STATUSES.includes(status)) {
      throw new BadRequestException(
        `No es posible ${action} una novedad en estado ${status}`,
      );
    }
  }

  /**
   * Valida que el usuario tenga acceso vigente a la propiedad o área de la novedad.
   */
  private async validateIssueScopeAccess(
    user: AuthenticatedUser,
    issue: { propertyId: string | null; internalAreaId: string | null },
  ) {
    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }
  }

  /**
   * Los cambios de estado (cerrar, reabrir) corresponden al Director Operativo
   * o al Coordinador Operativo que es responsable principal de la novedad.
   */
  private assertCanChangeState(
    user: AuthenticatedUser,
    issue: { assignedUserId: string | null },
  ) {
    const isDirector = user.role === Role.DIRECTOR_OPERATIVO;
    const isResponsibleCoordinator =
      user.role === Role.COORDINADOR_OPERATIVO && issue.assignedUserId === user.id;

    if (!isDirector && !isResponsibleCoordinator) {
      throw new ForbiddenException(
        'Solo el Director Operativo o el coordinador responsable de la novedad pueden cambiar su estado',
      );
    }
  }

  /**
   * Cambia el estado solo si la novedad sigue en uno de los estados esperados.
   * Si otra operación la modificó entre la lectura y la escritura, responde 409.
   */
  private async transitionStatus(
    tx: Pick<PrismaService, 'issue'>,
    issueId: string,
    from: IssueStatus[],
    to: IssueStatus,
    extraData: { closedAt?: Date | null } = {},
  ) {
    const result = await tx.issue.updateMany({
      where: { id: issueId, status: { in: from } },
      data: { status: to, ...extraData },
    });

    if (result.count === 0) {
      throw new ConflictException(
        'Conflicto de concurrencia (409): el estado de la novedad cambió mientras se procesaba la solicitud',
      );
    }
  }

  /**
   * Helper para validar que un usuario candidato o mencionado pertenezca a la organización,
   * esté activo, no sea Administrador y cuente con autorización activa en el ámbito (CP-10 / RF-011).
   */
  private async validateCandidateAuthorization(
    candidateId: string,
    organizationId: string,
    scope: IssueScope,
    propertyId: string | null,
    internalAreaId: string | null,
  ) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        organizationId: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!targetUser || targetUser.organizationId !== organizationId) {
      throw new BadRequestException('El usuario no pertenece a la organización');
    }

    if (!targetUser.isActive) {
      throw new BadRequestException('El usuario no está activo');
    }

    if (targetUser.role === Role.ADMINISTRADOR) {
      throw new BadRequestException(
        'El rol Administrador del Sistema no puede ser asignado operativamente (RN-001 / RN-002)',
      );
    }

    const targetUserAuth: AuthenticatedUser = {
      id: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
      organizationId: targetUser.organizationId,
    };

    if (scope === IssueScope.PROPIEDAD && propertyId) {
      const hasAccess = await this.scopeAuth.hasPropertyAccess(
        targetUserAuth,
        propertyId,
      );
      if (!hasAccess) {
        throw new BadRequestException(
          'El usuario no cuenta con autorización activa sobre la propiedad de la novedad',
        );
      }
    } else if (scope === IssueScope.INTERNA && internalAreaId) {
      const hasAccess = await this.scopeAuth.hasInternalAreaAccess(
        targetUserAuth,
        internalAreaId,
      );
      if (!hasAccess) {
        throw new BadRequestException(
          'El usuario no cuenta con autorización activa sobre el área interna de la novedad',
        );
      }
    }

    return targetUser;
  }

  /**
   * Crea una nueva actividad dentro de una novedad (RF-019 / CP-09).
   * Solo el Director Operativo o el responsable principal de la novedad pueden crearla.
   */
  async createActivity(
    user: AuthenticatedUser,
    issueId: string,
    dto: CreateActivityDto,
  ) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        code: true,
        title: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
        assignedUserId: true,
        status: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    // Validar acceso vigente al ámbito (RF-011 / Scope Authorization)
    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    // Validar permisos de creación: Director o Responsable Principal
    const isDirector = user.role === Role.DIRECTOR_OPERATIVO;
    const isPrincipal = issue.assignedUserId === user.id;

    if (!isDirector && !isPrincipal) {
      throw new ForbiddenException(
        'Solo el Director Operativo o el responsable principal de la novedad pueden crear actividades',
      );
    }

    this.assertIssueIsOpen(issue.status, 'crear actividades en');

    let assignedUser: { id: string; firstName: string; lastName: string } | null = null;
    if (dto.assignedUserId) {
      const candidate = await this.validateCandidateAuthorization(
        dto.assignedUserId,
        user.organizationId,
        issue.scope,
        issue.propertyId,
        issue.internalAreaId,
      );
      assignedUser = candidate;
    }

    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.issueActivity.create({
        data: {
          issueId: issue.id,
          title: dto.title.trim(),
          description: dto.description.trim(),
          assignedUserId: dto.assignedUserId ?? null,
          createdById: user.id,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          status: ActivityStatus.PENDIENTE,
          version: 1,
        },
        include: {
          assignedUser: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
        },
      });

      // Auditoría en la misma transacción
      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.ACTIVIDAD_CREADA,
          summary: `Actividad "${activity.title}" creada por ${user.email}${
            assignedUser ? ` y asignada a ${assignedUser.firstName} ${assignedUser.lastName}` : ''
          }`,
          details: {
            activityId: activity.id,
            title: activity.title,
            assignedUserId: activity.assignedUserId,
            dueDate: activity.dueDate ? activity.dueDate.toISOString() : null,
            authorId: user.id,
            createdAt: new Date().toISOString(),
          },
        },
      });

      // Notificación al responsable asignado (RF-020 / CP-09)
      if (dto.assignedUserId && dto.assignedUserId !== user.id) {
        await tx.notification.create({
          data: {
            organizationId: user.organizationId,
            recipientId: dto.assignedUserId,
            issueId: issue.id,
            title: `Nueva actividad asignada en ${issue.code}`,
            message: `Se le ha asignado la actividad "${activity.title}" en la novedad ${issue.code}: ${issue.title}`,
          },
        });
      }

      return activity;
    });
  }

  /**
   * Lista las actividades de una novedad, verificando autorización de ámbito.
   */
  async listActivities(user: AuthenticatedUser, issueId: string) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para acceder a actividades operativas',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    return this.prisma.issueActivity.findMany({
      where: { issueId: issue.id },
      include: {
        assignedUser: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
        _count: {
          select: { comments: true, attachments: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Asigna o reasigna un responsable a una actividad con control de concurrencia optimista y auditoría.
   * Solo el Director Operativo o el responsable principal de la novedad pueden reasignar actividades.
   */
  async assignActivity(
    user: AuthenticatedUser,
    issueId: string,
    activityId: string,
    dto: AssignActivityDto,
  ) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        code: true,
        title: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
        assignedUserId: true,
        status: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    // Validar acceso vigente al ámbito (RF-011 / Scope Authorization)
    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    const isDirector = user.role === Role.DIRECTOR_OPERATIVO;
    const isPrincipal = issue.assignedUserId === user.id;

    if (!isDirector && !isPrincipal) {
      throw new ForbiddenException(
        'Solo el Director Operativo o el responsable principal de la novedad pueden reasignar actividades',
      );
    }

    this.assertIssueIsOpen(issue.status, 'reasignar actividades en');

    // Integridad: verificar que la actividad pertenezca a esta novedad
    const activity = await this.prisma.issueActivity.findFirst({
      where: { id: activityId, issueId: issue.id },
      include: {
        assignedUser: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!activity) {
      throw new NotFoundException('Actividad no encontrada en esta novedad');
    }

    // Control de concurrencia optimista previo (409 Conflict)
    if (activity.version !== dto.version) {
      throw new ConflictException(
        `Conflicto de concurrencia (409): la actividad ha sido modificada por otro usuario (versión esperada: ${dto.version}, versión actual: ${activity.version})`,
      );
    }

    // Validar nuevo candidato (CP-10)
    const newAssignee = await this.validateCandidateAuthorization(
      dto.assignedUserId,
      user.organizationId,
      issue.scope,
      issue.propertyId,
      issue.internalAreaId,
    );

    const previousAssignedUserId = activity.assignedUserId;
    const previousAssigneeName = activity.assignedUser
      ? `${activity.assignedUser.firstName} ${activity.assignedUser.lastName}`
      : 'Sin asignar';

    return this.prisma.$transaction(async (tx) => {
      // Escritura atómica exigiendo la versión esperada para prevenir carreras de concurrencia (409)
      const updateResult = await tx.issueActivity.updateMany({
        where: {
          id: activity.id,
          version: dto.version,
        },
        data: {
          assignedUserId: dto.assignedUserId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException(
          `Conflicto de concurrencia (409): la actividad ha sido modificada por otro usuario (versión esperada: ${dto.version})`,
        );
      }

      const updatedActivity = await tx.issueActivity.findUniqueOrThrow({
        where: { id: activity.id },
        include: {
          assignedUser: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
        },
      });

      const eventType = previousAssignedUserId
        ? IssueEventType.ACTIVIDAD_REASIGNADA
        : IssueEventType.ACTIVIDAD_ASIGNADA;

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType,
          summary: `Actividad "${activity.title}" reasignada de ${previousAssigneeName} a ${newAssignee.firstName} ${newAssignee.lastName}`,
          details: {
            activityId: activity.id,
            title: activity.title,
            previousAssignedUserId,
            newAssignedUserId: dto.assignedUserId,
            previousVersion: activity.version,
            newVersion: updatedActivity.version,
            authorId: user.id,
            updatedAt: new Date().toISOString(),
          },
        },
      });

      // Notificación al nuevo responsable (RF-020 / CP-09)
      if (dto.assignedUserId !== user.id) {
        await tx.notification.create({
          data: {
            organizationId: user.organizationId,
            recipientId: dto.assignedUserId,
            issueId: issue.id,
            title: `Actividad asignada en ${issue.code}`,
            message: `Se le ha asignado la actividad "${activity.title}" en la novedad ${issue.code}: ${issue.title}`,
          },
        });
      }

      return updatedActivity;
    });
  }

  /**
   * Actualiza el estado o datos de una actividad con control de concurrencia optimista (409)
   * y permisos estrictos por rol y asignación.
   *
   * Permisos:
   * - Director Operativo o Responsable Principal: pueden modificar todo (título, descripción, fecha, estado, cancelar).
   * - Responsable Asignado de la Actividad: puede cambiar estado (PENDIENTE, EN_CURSO, BLOQUEADA, COMPLETADA) y statusReason.
   *   NO puede modificar título, descripción, fecha límite, ni CANCELAR la actividad.
   * - Otros usuarios (incluso con acceso al ámbito): 403 Forbidden.
   *
   * Invariante de NO cierre:
   * - Completar actividades NUNCA cambia el estado de la novedad (issue.status).
   *   El cierre de la novedad pertenece exclusivamente a F5 y al Director Operativo.
   */
  async updateActivity(
    user: AuthenticatedUser,
    issueId: string,
    activityId: string,
    dto: UpdateActivityDto,
  ) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        code: true,
        title: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
        assignedUserId: true,
        status: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    // Validar acceso vigente al ámbito (RF-011 / Scope Authorization)
    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    // Integridad: verificar que la actividad pertenezca exactamente a esta novedad
    const activity = await this.prisma.issueActivity.findFirst({
      where: { id: activityId, issueId: issue.id },
      include: {
        assignedUser: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!activity) {
      throw new NotFoundException('Actividad no encontrada en esta novedad');
    }

    // Control de concurrencia optimista previo (409 Conflict)
    if (activity.version !== dto.version) {
      throw new ConflictException(
        `Conflicto de concurrencia (409): la actividad ha sido modificada por otro usuario (versión esperada: ${dto.version}, versión actual: ${activity.version})`,
      );
    }

    // Distinción estricta de permisos de actualización
    const isDirector = user.role === Role.DIRECTOR_OPERATIVO;
    const isPrincipal = issue.assignedUserId === user.id;
    const isActivityAssignee = activity.assignedUserId === user.id;

    if (!isDirector && !isPrincipal && !isActivityAssignee) {
      throw new ForbiddenException(
        'No tiene permisos para modificar esta actividad (solo el Director, el responsable principal o el responsable asignado a la actividad pueden modificarla)',
      );
    }

    this.assertIssueIsOpen(issue.status, 'modificar actividades en');

    // Si el usuario es ÚNICAMENTE el responsable asignado a la actividad (no Director ni Principal de novedad):
    if (!isDirector && !isPrincipal && isActivityAssignee) {
      // 1. No puede editar datos generales (título, descripción, fecha límite)
      if (
        (dto.title && dto.title.trim() !== activity.title) ||
        (dto.description && dto.description.trim() !== activity.description) ||
        (dto.dueDate !== undefined && (dto.dueDate ? new Date(dto.dueDate).toISOString() : null) !== (activity.dueDate ? activity.dueDate.toISOString() : null))
      ) {
        throw new ForbiddenException(
          'Solo el Director Operativo o el responsable principal de la novedad pueden modificar los datos generales de la actividad',
        );
      }

      // 2. No puede cancelar la actividad
      if (dto.status === ActivityStatus.CANCELADA) {
        throw new ForbiddenException(
          'Solo el Director Operativo o el responsable principal de la novedad pueden cancelar una actividad',
        );
      }
    }

    // Validación de motivo obligatorio en BLOQUEADA y CANCELADA (RF-019 / RN-069 / RN-070 / CP-11)
    // Se valida el estado resultante completo: no se puede borrar el motivo de una actividad bloqueada o cancelada
    const resultingStatus = dto.status ?? activity.status;
    const resultingReason =
      dto.statusReason !== undefined
        ? (dto.statusReason ? dto.statusReason.trim() : '')
        : (activity.statusReason ? activity.statusReason.trim() : '');

    if (
      resultingStatus === ActivityStatus.BLOQUEADA ||
      resultingStatus === ActivityStatus.CANCELADA
    ) {
      if (!resultingReason) {
        throw new BadRequestException(
          'El motivo (statusReason) es obligatorio para marcar o mantener la actividad como BLOQUEADA o CANCELADA (RF-019 / RN-069 / RN-070)',
        );
      }
    }

    // Detección de cambios detallados para auditoría (Finding 6)
    const changes: Record<string, { previous: any; new: any }> = {};

    if (dto.title && (isDirector || isPrincipal)) {
      const cleanTitle = dto.title.trim();
      if (cleanTitle !== activity.title) {
        changes['title'] = { previous: activity.title, new: cleanTitle };
      }
    }

    if (dto.description && (isDirector || isPrincipal)) {
      const cleanDescription = dto.description.trim();
      if (cleanDescription !== activity.description) {
        changes['description'] = { previous: activity.description, new: cleanDescription };
      }
    }

    if (dto.dueDate !== undefined && (isDirector || isPrincipal)) {
      const prevDueIso = activity.dueDate ? activity.dueDate.toISOString() : null;
      const newDueIso = dto.dueDate ? new Date(dto.dueDate).toISOString() : null;
      if (prevDueIso !== newDueIso) {
        changes['dueDate'] = { previous: prevDueIso, new: newDueIso };
      }
    }

    if (dto.status && dto.status !== activity.status) {
      changes['status'] = { previous: activity.status, new: dto.status };
    }

    if (dto.statusReason !== undefined) {
      const prevReason = activity.statusReason ? activity.statusReason.trim() : null;
      const newReason = dto.statusReason ? dto.statusReason.trim() : null;
      if (prevReason !== newReason) {
        changes['statusReason'] = { previous: prevReason, new: newReason };
      }
    }

    const previousStatus = activity.status;
    const isStatusChange = dto.status && dto.status !== previousStatus;

    return this.prisma.$transaction(async (tx) => {
      const updateData: any = {
        version: { increment: 1 },
      };

      if (dto.title && (isDirector || isPrincipal)) {
        updateData.title = dto.title.trim();
      }
      if (dto.description && (isDirector || isPrincipal)) {
        updateData.description = dto.description.trim();
      }
      if (dto.dueDate !== undefined && (isDirector || isPrincipal)) {
        updateData.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      }
      if (dto.status) {
        updateData.status = dto.status;
      }
      if (dto.statusReason !== undefined) {
        updateData.statusReason = dto.statusReason ? dto.statusReason.trim() : null;
      }

      // Preservar completedAt: solo se establece al entrar a COMPLETADA; se conserva en actualizaciones posteriores
      if (dto.status === ActivityStatus.COMPLETADA && activity.status !== ActivityStatus.COMPLETADA) {
        updateData.completedAt = new Date();
      } else if (dto.status && dto.status !== ActivityStatus.COMPLETADA) {
        updateData.completedAt = null;
      }

      // Escritura atómica exigiendo la versión esperada para prevenir colisiones de concurrencia (409)
      const updateResult = await tx.issueActivity.updateMany({
        where: {
          id: activity.id,
          version: dto.version,
        },
        data: updateData,
      });

      if (updateResult.count === 0) {
        throw new ConflictException(
          `Conflicto de concurrencia (409): la actividad ha sido modificada por otro usuario (versión esperada: ${dto.version})`,
        );
      }

      const updatedActivity = await tx.issueActivity.findUniqueOrThrow({
        where: { id: activity.id },
        include: {
          assignedUser: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
        },
      });

      // Auditoría detallada en la misma transacción (Finding 6)
      const changeKeys = Object.keys(changes);
      let eventSummary = '';
      if (isStatusChange) {
        eventSummary = `Estado de la actividad "${activity.title}" cambiado de ${previousStatus} a ${dto.status}${
          dto.statusReason ? `. Motivo: ${dto.statusReason.trim()}` : ''
        }${changeKeys.length > 1 ? ` (modificaciones: ${changeKeys.filter((k) => k !== 'status').join(', ')})` : ''}`;
      } else if (changeKeys.length > 0) {
        eventSummary = `Actividad "${activity.title}" actualizada (${changeKeys.join(', ')}) por ${user.email}`;
      } else {
        eventSummary = `Actividad "${activity.title}" actualizada por ${user.email}`;
      }

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.ACTIVIDAD_ESTADO,
          summary: eventSummary,
          details: {
            activityId: activity.id,
            previousStatus: isStatusChange ? previousStatus : undefined,
            newStatus: isStatusChange ? dto.status : undefined,
            statusReason: dto.statusReason ? dto.statusReason.trim() : (activity.statusReason ?? undefined),
            changes: changeKeys.length > 0 ? changes : undefined,
            previousVersion: activity.version,
            newVersion: updatedActivity.version,
            authorId: user.id,
            date: new Date().toISOString(),
          },
        },
      });

      return updatedActivity;
    });
  }

  /**
   * Agrega un comentario a la novedad o a una actividad específica (RF-020).
   * Valida integridad (activityId pertenece a issueId) y soporte de menciones con notificación.
   */
  async createComment(
    user: AuthenticatedUser,
    issueId: string,
    dto: CreateCommentDto,
  ) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para comentar en novedades operativas',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        code: true,
        title: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    // Integridad: verificar que la actividad especificada pertenece exactamente a esta novedad
    let activityTitle: string | null = null;
    if (dto.activityId) {
      const activity = await this.prisma.issueActivity.findFirst({
        where: { id: dto.activityId, issueId: issue.id },
      });
      if (!activity) {
        throw new BadRequestException(
          'La actividad especificada no pertenece a esta novedad (integridad referencial)',
        );
      }
      activityTitle = activity.title;
    }

    // Validación de menciones a usuarios autorizados
    const validMentionIds: string[] = [];
    if (dto.mentions && dto.mentions.length > 0) {
      const uniqueMentions = Array.from(new Set(dto.mentions));
      for (const mentionId of uniqueMentions) {
        await this.validateCandidateAuthorization(
          mentionId,
          user.organizationId,
          issue.scope,
          issue.propertyId,
          issue.internalAreaId,
        );
        validMentionIds.push(mentionId);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.issueComment.create({
        data: {
          issueId: issue.id,
          activityId: dto.activityId ?? null,
          userId: user.id,
          content: dto.content.trim(),
          mentions: validMentionIds,
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
          activity: {
            select: { id: true, title: true },
          },
        },
      });

      // Auditoría en la misma transacción
      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.COMENTARIO_AGREGADO,
          summary: `Comentario agregado por ${user.email}${
            activityTitle ? ` en la actividad "${activityTitle}"` : ''
          }`,
          details: {
            commentId: comment.id,
            activityId: comment.activityId,
            mentions: validMentionIds,
            authorId: user.id,
            createdAt: comment.createdAt.toISOString(),
          },
        },
      });

      // Notificaciones para usuarios mencionados (RF-020)
      for (const recipientId of validMentionIds) {
        if (recipientId !== user.id) {
          await tx.notification.create({
            data: {
              organizationId: user.organizationId,
              recipientId,
              issueId: issue.id,
              title: `Mención en ${issue.code}`,
              message: `${user.email} le mencionó en la novedad ${issue.code}: "${dto.content.slice(0, 100)}${dto.content.length > 100 ? '...' : ''}"`,
            },
          });
        }
      }

      return comment;
    });
  }

  /**
   * Lista los comentarios de una novedad, con filtro opcional por actividad validando integridad.
   */
  async listComments(
    user: AuthenticatedUser,
    issueId: string,
    activityId?: string,
  ) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para acceder a comentarios operativos',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    // Integridad: verificar que la actividad especificada pertenece exactamente a esta novedad
    if (activityId) {
      const activity = await this.prisma.issueActivity.findFirst({
        where: { id: activityId, issueId: issue.id },
      });
      if (!activity) {
        throw new BadRequestException(
          'La actividad especificada no pertenece a esta novedad (integridad referencial)',
        );
      }
    }

    const where: any = { issueId: issue.id };
    if (activityId) where.activityId = activityId;

    return this.prisma.issueComment.findMany({
      where,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
        activity: {
          select: { id: true, title: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // --- GESTIÓN DE ADJUNTOS Y EVIDENCIAS (F4 / RF-021, RF-022, PEN-07) ---

  async uploadAttachment(
    user: AuthenticatedUser,
    issueId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    dto: CreateAttachmentDto,
  ) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para adjuntar evidencias operativas',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    if (issue.status === IssueStatus.CERRADA || issue.status === IssueStatus.DESCARTADA) {
      throw new BadRequestException(
        'No es posible adjuntar evidencias a una novedad que se encuentra cerrada o descartada',
      );
    }

    if (dto.activityId) {
      const activity = await this.prisma.issueActivity.findFirst({
        where: { id: dto.activityId, issueId: issue.id },
      });
      if (!activity) {
        throw new BadRequestException(
          'La actividad especificada no pertenece a esta novedad (integridad referencial)',
        );
      }
    }

    const currentAttachmentCount = await this.prisma.issueAttachment.count({
      where: { issueId: issue.id },
    });
    if (currentAttachmentCount >= PROVISIONAL_FILE_POLICY.maxAttachmentsPerIssue) {
      throw new BadRequestException(
        `Se ha alcanzado el límite máximo de ${PROVISIONAL_FILE_POLICY.maxAttachmentsPerIssue} adjuntos por novedad (PEN-07 provisional)`,
      );
    }

    const stored = await this.privateStorage.storeFile(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    const stage = dto.stage || EvidenceStage.SOPORTE;

    return this.prisma.$transaction(async (tx) => {
      const attachment = await tx.issueAttachment.create({
        data: {
          issueId: issue.id,
          activityId: dto.activityId || null,
          uploadedById: user.id,
          stage,
          fileName: stored.fileName,
          fileSize: stored.fileSize,
          mimeType: stored.mimeType,
          sha256: stored.sha256,
          storageKey: stored.storageKey,
        },
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
          activity: {
            select: { id: true, title: true },
          },
        },
      });

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.EVIDENCIA_ADJUNTADA,
          summary: `Evidencia adjuntada (${stage}): ${stored.fileName} (${(stored.fileSize / 1024).toFixed(1)} KB) por ${user.email}`,
          details: {
            attachmentId: attachment.id,
            fileName: stored.fileName,
            fileSize: stored.fileSize,
            mimeType: stored.mimeType,
            sha256: stored.sha256,
            stage,
            activityId: dto.activityId || null,
          },
        },
      });

      return attachment;
    });
  }

  async listAttachments(
    user: AuthenticatedUser,
    issueId: string,
    activityId?: string,
  ) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para acceder a evidencias operativas',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    const where: any = { issueId: issue.id };
    if (activityId) where.activityId = activityId;

    return this.prisma.issueAttachment.findMany({
      where,
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        activity: {
          select: { id: true, title: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAttachmentFile(
    user: AuthenticatedUser,
    issueId: string,
    attachmentId: string,
  ) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para descargar evidencias operativas',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    const attachment = await this.prisma.issueAttachment.findFirst({
      where: { id: attachmentId, issueId: issue.id },
    });

    if (!attachment) {
      throw new NotFoundException('Evidencia no encontrada para esta novedad');
    }

    const fileBuffer = await this.privateStorage.getFile(attachment.storageKey);

    return {
      buffer: fileBuffer,
      attachment,
    };
  }

  // --- CICLO DE CIERRE, REAPERTURA Y DESCARTE (F5 / RF-012, RF-023, RF-025, RF-026) ---

  private async findIssueForTransition(user: AuthenticatedUser, issueId: string) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para gestionar estados operativos',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    await this.validateIssueScopeAccess(user, issue);
    return issue;
  }

  /**
   * El responsable manda a hacer el trabajo: la novedad pasa de "pendiente" a "en proceso".
   */
  async startWork(user: AuthenticatedUser, issueId: string) {
    const issue = await this.findIssueForTransition(user, issueId);
    this.assertCanChangeState(user, issue);

    if (!issue.assignedUserId) {
      throw new BadRequestException('La novedad aún no tiene responsable; asígnela antes de iniciar el trabajo');
    }
    if (issue.status !== IssueStatus.ASIGNADA) {
      throw new BadRequestException(
        `Solo es posible iniciar el trabajo de una novedad pendiente (estado actual: ${issue.status})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.transitionStatus(tx, issue.id, [IssueStatus.ASIGNADA], IssueStatus.EN_ATENCION);

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.INICIO_TRABAJO,
          summary: `Trabajo iniciado por ${user.email}`,
          details: { previousStatus: issue.status },
        },
      });

      // Quien reportó se entera de que ya la están atendiendo
      if (issue.createdById !== user.id) {
        await tx.notification.create({
          data: {
            organizationId: user.organizationId,
            recipientId: issue.createdById,
            issueId: issue.id,
            title: `Novedad en proceso: ${issue.code}`,
            message: `Se inició el trabajo de la novedad ${issue.code}.`,
          },
        });
      }

      return tx.issue.findUniqueOrThrow({ where: { id: issue.id } });
    });
  }

  /**
   * Finaliza la novedad (Director o coordinador responsable - RF-023 / RF-025).
   * Solo desde "en proceso" y con la evidencia FINAL que pida la categoría.
   */
  async close(user: AuthenticatedUser, issueId: string, dto: CloseIssueDto) {
    const issue = await this.findIssueForTransition(user, issueId);
    this.assertCanChangeState(user, issue);

    // PENDIENTE_CIERRE se conserva solo por compatibilidad con datos anteriores
    const closableStatuses: IssueStatus[] = [IssueStatus.EN_ATENCION, IssueStatus.PENDIENTE_CIERRE];

    if (!closableStatuses.includes(issue.status)) {
      throw new BadRequestException(
        !issue.assignedUserId
          ? 'La novedad aún no tiene responsable; asígnela antes de finalizarla'
          : issue.status === IssueStatus.ASIGNADA
            ? 'Inicie el trabajo antes de finalizar la novedad'
            : `No es posible finalizar una novedad en estado ${issue.status}`,
      );
    }

    const [category, finalEvidenceCount] = await Promise.all([
      this.prisma.category.findUnique({
        where: { id: issue.categoryId },
        select: { requiresEvidence: true },
      }),
      this.prisma.issueAttachment.count({
        where: { issueId: issue.id, stage: EvidenceStage.FINAL },
      }),
    ]);

    if (category?.requiresEvidence && finalEvidenceCount === 0) {
      throw new BadRequestException(
        'Agregue la foto final antes de finalizar la novedad (CP-12 / RF-023)',
      );
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await this.transitionStatus(tx, issue.id, closableStatuses, IssueStatus.CERRADA, {
        closedAt: now,
      });

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.CIERRE_DEFINITIVO,
          summary: `Novedad finalizada por ${user.email}`,
          details: {
            observations: dto.closureObservations || null,
            previousStatus: issue.status,
            closedAt: now.toISOString(),
          },
        },
      });

      const recipients = new Set<string>();
      if (issue.assignedUserId) recipients.add(issue.assignedUserId);
      if (issue.createdById) recipients.add(issue.createdById);

      // Si cierra el coordinador, la Dirección Operativa queda enterada
      if (user.role !== Role.DIRECTOR_OPERATIVO) {
        const directors = (
          await this.directorIdsFor(tx, user.organizationId, issue.propertyId)
        ).map((id) => ({ id }));
        directors.forEach((d) => recipients.add(d.id));
      }
      recipients.delete(user.id);

      for (const recipientId of recipients) {
        await tx.notification.create({
          data: {
            organizationId: user.organizationId,
            recipientId,
            issueId: issue.id,
            title: `Novedad finalizada: ${issue.code}`,
            message: `La novedad ${issue.code} fue finalizada por ${user.email}.`,
          },
        });
      }

      return tx.issue.findUniqueOrThrow({ where: { id: issue.id } });
    });
  }

  /**
   * Reabre una novedad cerrada (Director o coordinador responsable, con motivo - CP-16).
   */
  async reopen(user: AuthenticatedUser, issueId: string, dto: ReopenIssueDto) {
    const issue = await this.findIssueForTransition(user, issueId);
    this.assertCanChangeState(user, issue);

    if (issue.status !== IssueStatus.CERRADA) {
      throw new BadRequestException(
        `Solo es posible reabrir novedades que se encuentren en estado CERRADA (estado actual: ${issue.status}) (CP-16)`,
      );
    }

    const previousClosedAt = issue.closedAt;

    return this.prisma.$transaction(async (tx) => {
      await this.transitionStatus(tx, issue.id, [IssueStatus.CERRADA], IssueStatus.EN_ATENCION, {
        closedAt: null,
      });

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.REAPERTURA,
          summary: `Reapertura de novedad por ${user.email}: ${dto.reason}`,
          details: {
            reason: dto.reason,
            previousClosedAt: previousClosedAt ? previousClosedAt.toISOString() : null,
          },
        },
      });

      if (issue.assignedUserId && issue.assignedUserId !== user.id) {
        await tx.notification.create({
          data: {
            organizationId: user.organizationId,
            recipientId: issue.assignedUserId,
            issueId: issue.id,
            title: `Reapertura de novedad: ${issue.code}`,
            message: `La novedad ${issue.code} ha sido reabierta por ${user.email}. Motivo: ${dto.reason}`,
          },
        });
      }

      return tx.issue.findUniqueOrThrow({ where: { id: issue.id } });
    });
  }

  async discard(user: AuthenticatedUser, issueId: string, dto: DiscardIssueDto) {
    if (user.role !== Role.DIRECTOR_OPERATIVO) {
      throw new ForbiddenException(
        'Únicamente el Director Operativo tiene autorización para descartar novedades (RF-012 / PEN-13)',
      );
    }

    const issue = await this.findIssueForTransition(user, issueId);

    this.assertIssueIsOpen(issue.status, 'descartar');

    return this.prisma.$transaction(async (tx) => {
      // Se condiciona al estado leído para no pisar un cierre concurrente
      await this.transitionStatus(tx, issue.id, [issue.status], IssueStatus.DESCARTADA);

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.DESCARTE,
          summary: `Novedad descartada por la Dirección Operativa: ${dto.reason}`,
          details: {
            reason: dto.reason,
            previousStatus: issue.status,
          },
        },
      });

      if (issue.createdById && issue.createdById !== user.id) {
        await tx.notification.create({
          data: {
            organizationId: user.organizationId,
            recipientId: issue.createdById,
            issueId: issue.id,
            title: `Novedad descartada: ${issue.code}`,
            message: `La novedad ${issue.code} ha sido descartada. Motivo: ${dto.reason}`,
          },
        });
      }

      return tx.issue.findUniqueOrThrow({ where: { id: issue.id } });
    });
  }
}
